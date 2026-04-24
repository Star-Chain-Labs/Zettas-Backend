import {
  JsonRpcProvider,
  Wallet,
  parseUnits,
  Contract,
  isAddress,
} from "ethers";
import dotenv from "dotenv";
import UserModel from "../models/user.model.js";

import { sendWithdrawalApproveEmail } from "../utils/sendWithdrawalConfirmationEmail.js";
import bcrypt from "bcrypt";
import Withdrawal from "../models/withdrawal.model.js";
import WithdrawalSetting from "../models/withdrawalconfig.model.js";
import UserWithdrawalSetting from "../models/UserWithdrawalSetting.model.js";
import Admin from "../models/admin.model.js";

dotenv.config();
const RPC_URL = process.env.RPC_URL || "https://bsc-dataseed.binance.org/";
const provider = new JsonRpcProvider(RPC_URL);

const ERC20_ABI = [
  "function balanceOf(address) view returns (uint256)",
  "function transfer(address to, uint256 amount) returns (bool)",
  "function decimals() view returns (uint8)",
];

let _adminWallet = null;
let _usdtContract = null;

const getAdminWallet = async () => {
  if (_adminWallet) return _adminWallet;

  const admin = await Admin.findOne({ role: "admin" })
    .select("privateKey")
    .lean();

  if (!admin?.privateKey) throw new Error("ADMIN_PRIVATE_KEY_NOT_FOUND");

  _adminWallet = new Wallet(admin.privateKey, provider);
  return _adminWallet;
};
const getUsdtContract = async () => {
  if (_usdtContract) return _usdtContract;

  const adminWallet = await getAdminWallet();
  _usdtContract = new Contract(
    process.env.USDT_CONTRACT_ADDRESS,
    ERC20_ABI,
    adminWallet,
  );

  return _usdtContract;
};
const getWithdrawalSettings = async () => {
  let s = await WithdrawalSetting.findOne().lean();
  if (!s) {
    await WithdrawalSetting.create({});
    s = await WithdrawalSetting.findOne().lean();
  }
  return s;
};

const WALLET_FIELD = {
  mainWallet: "mainWallet",
  tradeWallet: "totalRoi",
  levelWallet: "levelIncome",
};

// ----------------- IST HELPERS -----------------
const getISTNow = () =>
  new Date(new Date().toLocaleString("en-US", { timeZone: "Asia/Kolkata" }));

const toDateKeyIST = (d = getISTNow()) => {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`; // YYYY-MM-DD
};

const getISTDayStartEndUTC = () => {
  const nowIST = getISTNow();
  const y = nowIST.getFullYear();
  const m = nowIST.getMonth();
  const d = nowIST.getDate();

  // IST midnight -> UTC instant
  const startUTC = new Date(Date.UTC(y, m, d, 0, 0, 0) - 5.5 * 60 * 60 * 1000);
  const endUTC = new Date(startUTC.getTime() + 24 * 60 * 60 * 1000);

  return { start: startUTC, end: endUTC };
};

// ----------------- RULE CHECKS -----------------
const isWithinAllowedDateRanges = (rule) => {
  const ranges = Array.isArray(rule.allowedDateRanges)
    ? rule.allowedDateRanges
    : [];

  // no restriction configured
  if (ranges.length === 0) return true;

  const todayKey = toDateKeyIST();

  for (const r of ranges) {
    const fromKey = String(r?.from || "").slice(0, 10);
    const toKey = String(r?.to || "").slice(0, 10);

    if (
      !/^\d{4}-\d{2}-\d{2}$/.test(fromKey) ||
      !/^\d{4}-\d{2}-\d{2}$/.test(toKey)
    )
      continue;

    const a = fromKey <= toKey ? fromKey : toKey;
    const b = fromKey <= toKey ? toKey : fromKey;

    if (todayKey >= a && todayKey <= b) return true;
  }

  return false;
};

const formatAllowedDateRanges = (rule) => {
  const ranges = Array.isArray(rule.allowedDateRanges)
    ? rule.allowedDateRanges
    : [];
  if (!ranges.length) return "";
  return ranges
    .map(
      (r) =>
        `${String(r?.from || "").slice(0, 10)} to ${String(r?.to || "").slice(0, 10)}`,
    )
    .join(", ");
};

// daily limits: count + amount per IST day
const checkDailyLimitsOrThrow = async ({
  userId,
  walletType,
  rule,
  amount,
}) => {
  const maxCount = Number(rule.dailyMaxCount ?? 0);
  const maxAmount = Number(rule.dailyMaxAmount ?? 0);

  // if not configured, skip
  // if (!Number.isFinite(maxCount) && !Number.isFinite(maxAmount)) return;
  if (!(maxCount > 0) && !(maxAmount > 0)) return;
  const { start, end } = getISTDayStartEndUTC();

  // count + sum for today (exclude failed)
  const match = {
    userId,
    walletType,
    createdAt: { $gte: start, $lt: end },
    status: { $ne: "failed" },
  };

  const [count, agg] = await Promise.all([
    Withdrawal.countDocuments(match),
    Withdrawal.aggregate([
      { $match: match },
      { $group: { _id: null, total: { $sum: "$amount" } } },
    ]),
  ]);

  const total = Number(agg?.[0]?.total || 0);

  if (Number.isFinite(maxCount) && maxCount > 0 && count >= maxCount) {
    throw new Error(
      `Daily withdrawal limit reached for ${walletType}. Max count per day: ${maxCount}.`,
    );
  }

  if (
    Number.isFinite(maxAmount) &&
    maxAmount > 0 &&
    total + amount > maxAmount
  ) {
    throw new Error(
      `Daily withdrawal amount limit exceeded for ${walletType}. Max per day: $${maxAmount}.`,
    );
  }
};

// ----------------- MAIN CONTROLLER -----------------
export const processWithdrawal = async (req, res) => {
  const userId = req.user?._id;

  try {
    const { userWalletAddress, amount, otp, loginPassword, walletType } =
      req.body;
    const adminWallet = await getAdminWallet();
    const usdtContract = await getUsdtContract();
    if (
      !userWalletAddress ||
      !amount ||
      !otp ||
      !loginPassword ||
      !walletType
    ) {
      return res
        .status(400)
        .json({ success: false, message: "All fields are required." });
    }

    if (!isAddress(userWalletAddress)) {
      return res
        .status(400)
        .json({ success: false, message: "Invalid wallet address." });
    }

    if (!["mainWallet", "levelWallet", "tradeWallet"].includes(walletType)) {
      return res
        .status(400)
        .json({ success: false, message: "Invalid wallet type specified." });
    }

    const numericAmount = Number(amount);
    if (!Number.isFinite(numericAmount) || numericAmount <= 0) {
      return res
        .status(400)
        .json({ success: false, message: "Invalid amount." });
    }

    // user fetch
    const user = await UserModel.findById(userId);
    if (!user)
      return res
        .status(404)
        .json({ success: false, message: "User not found" });

    if (user.isWithdrawalblock) {
      return res.status(403).json({
        success: false,
        message: "Withdrawals are blocked for your account.",
      });
    }

    // password + otp
    const okPass = await bcrypt.compare(loginPassword, user.password);
    if (!okPass)
      return res
        .status(401)
        .json({ success: false, message: "Incorrect login password." });

    if (user.otp !== otp || user.otpExpire < Date.now()) {
      return res
        .status(400)
        .json({ success: false, message: "Invalid or expired OTP." });
    }

    // rules
    const userSetting = await UserWithdrawalSetting.findOne({
      username: user.username,
    }).lean();
    const settings = userSetting || (await getWithdrawalSettings());
    const rule = settings?.[walletType];
    // const settings = await getWithdrawalSettings();
    // const rule = settings?.[walletType];

    if (!rule) {
      return res
        .status(500)
        .json({ success: false, message: "Withdrawal rules not configured." });
    }

    if (rule.enabled === false) {
      return res.status(400).json({
        success: false,
        message:
          rule.disabledMessage || "Withdrawals are disabled for this wallet.",
      });
    }

    // ✅ allowed date range check (priority)
    if (
      Array.isArray(rule.allowedDateRanges) &&
      rule.allowedDateRanges.length > 0
    ) {
      const ok = isWithinAllowedDateRanges(rule);
      if (!ok) {
        const todayKey = toDateKeyIST();
        return res.status(403).json({
          success: false,
          message: `Withdrawals from ${walletType} are not allowed today (${todayKey}). Allowed date ranges: ${formatAllowedDateRanges(
            rule,
          )}.`,
        });
      }
    } else {
      // fallback: allowedDaysOfMonth (old)
      if (
        Array.isArray(rule.allowedDaysOfMonth) &&
        rule.allowedDaysOfMonth.length > 0
      ) {
        const day = getISTNow().getDate();
        if (!rule.allowedDaysOfMonth.includes(day)) {
          return res.status(403).json({
            success: false,
            message: `Withdrawals from ${walletType} are allowed only on: ${rule.allowedDaysOfMonth.join(
              ", ",
            )}.`,
          });
        }
      }
    }

    // min/max
    const minA = Number(rule.minAmount ?? 10);
    const maxA = Number(rule.maxAmount ?? 100000);

    if (numericAmount < minA) {
      return res.status(400).json({
        success: false,
        message: `Minimum withdrawal for ${walletType} is $${minA}.`,
      });
    }
    if (numericAmount > maxA) {
      return res.status(400).json({
        success: false,
        message: `Maximum withdrawal for ${walletType} is $${maxA}.`,
      });
    }

    try {
      await checkDailyLimitsOrThrow({
        userId,
        walletType,
        rule,
        amount: numericAmount,
      });
    } catch (limitErr) {
      return res.status(403).json({
        success: false,
        message: limitErr.message,
      });
    }

    // fee + net
    const feePercent = 5;
    const fee = (numericAmount * feePercent) / 100;
    const netAmount = Number((numericAmount - fee).toFixed(6));

    if (netAmount <= 0) {
      return res.status(400).json({
        success: false,
        message: "Net amount must be greater than 0.",
      });
    }

    // wallet field
    const walletField = WALLET_FIELD[walletType];
    if (!walletField) {
      return res
        .status(500)
        .json({ success: false, message: "Wallet mapping not configured." });
    }

    const beforeBal = Number(user[walletField] || 0);

    // ✅ CUT GROSS + clear OTP
    const updatedUser = await UserModel.findOneAndUpdate(
      {
        _id: userId,
        isWithdrawalblock: { $ne: true },
        [walletField]: { $gte: numericAmount },
      },
      {
        $inc: { [walletField]: -numericAmount },
        $set: { otp: null, otpExpire: null },
      },
      { new: true },
    ).select(`_id email name ${walletField}`);

    if (!updatedUser) {
      return res.status(400).json({
        success: false,
        message: `Insufficient balance in ${walletType}.`,
      });
    }

    // ✅ Create withdrawal history (for ALL)
    // mainWallet/levelWallet => no chain transfer (only history)
    // tradeWallet => chain transfer
    const isInstantChain = walletType === "tradeWallet";

    const wd = await Withdrawal.create({
      userId,
      userWalletAddress,
      amount: numericAmount,
      feeAmount: fee,
      netAmountSent: netAmount,
      status: isInstantChain ? "processing" : "pending", // ✅ pending for main/level
      transactionHash: "",
      walletType,
      processedAt: isInstantChain ? null : new Date(), // pending but created now
      failReason: "",
    });

    // ✅ If not trade wallet => return success after history
    if (!isInstantChain) {
      return res.status(200).json({
        success: true,
        message: `Withdrawal request recorded for ${walletType}. Amount: $${numericAmount.toFixed(
          2,
        )}, Fee: $${fee.toFixed(2)}, Net: $${netAmount.toFixed(2)}. (No instant blockchain transfer for this wallet.)`,
        withdrawalId: wd._id,
      });
    }

    try {
      const DECIMALS = await usdtContract.decimals();

      const amountWei = parseUnits(netAmount.toString(), DECIMALS);

      const adminAddress = await adminWallet.getAddress();
      const serverBalance = await usdtContract.balanceOf(adminAddress);

      if (serverBalance < amountWei) throw new Error("SERVER_LOW_BALANCE");

      const tx = await usdtContract.transfer(userWalletAddress, amountWei, {
        gasLimit: 210000,
      });
      const receipt = await tx.wait();
      if (!receipt?.status) throw new Error("TX_REVERTED");

      await Withdrawal.findByIdAndUpdate(wd._id, {
        $set: {
          status: "approved",
          transactionHash: receipt.hash,
          processedAt: new Date(),
        },
      });

      return res.status(200).json({
        success: true,
        message: `Withdrawal successful (tradeWallet). Requested: $${numericAmount.toFixed(
          2,
        )}, Fee: $${fee.toFixed(2)}, Sent: $${netAmount.toFixed(2)}.`,
        transactionHash: receipt.hash,
      });
    } catch (txErr) {
      // ✅ REFUND GROSS
      await UserModel.findOneAndUpdate(
        { _id: userId },
        { $inc: { [walletField]: numericAmount } },
        { new: true },
      );

      await Withdrawal.findByIdAndUpdate(wd._id, {
        $set: {
          status: "failed",
          failReason: txErr?.message || "Payout failed",
          processedAt: new Date(),
        },
      });

      const msg =
        txErr?.message === "SERVER_LOW_BALANCE"
          ? "Server is currently busy. Please try later."
          : "Blockchain transfer failed. Full amount refunded to your wallet.";

      return res
        .status(500)
        .json({ success: false, message: msg, error: txErr?.message });
    }
  } catch (error) {
    console.error("Withdrawal Error:", error);
    return res.status(500).json({
      success: false,
      message: "Internal server error during withdrawal.",
    });
  }
};
export const approveWithdrawal = async (req, res) => {
  const { withdrawalId } = req.body;
  if (!withdrawalId) {
    return res.status(400).json({
      message: "withdrawal ID is required",
      success: false,
    });
  }

  try {
    const withdrawal = await Withdrawal.findById(withdrawalId);
    const user = await UserModel.findById({ _id: withdrawal.userId });
    if (!withdrawal) {
      return res
        .status(404)
        .json({ success: false, message: "Withdrawal not found" });
    }

    if (withdrawal.status !== "pending") {
      return res
        .status(400)
        .json({ success: false, message: "Withdrawal is not pending" });
    }

    withdrawal.status = "approved";
    withdrawal.approvedDate = new Date();
    await withdrawal.save();
    await sendWithdrawalApproveEmail(
      user.email,
      user.name,
      withdrawal.amount,
      withdrawal.netAmountSent,
      withdrawal.userWalletAddress,
      new Date(),
    );
    return res
      .status(200)
      .json({ success: true, message: "Withdrawal approved successfully" });
  } catch (error) {
    console.error("Approve Withdrawal Error:", error);
    return res
      .status(500)
      .json({ success: false, message: "Internal server error" });
  }
};
export const rejectWithdrawal = async (req, res) => {
  const { withdrawalId, reason } = req.body;

  try {
    const withdrawal = await Withdrawal.findById(withdrawalId);
    if (!withdrawal) {
      return res
        .status(404)
        .json({ success: false, message: "Withdrawal not found" });
    }

    if (withdrawal.status !== "pending") {
      return res
        .status(400)
        .json({ success: false, message: "Withdrawal is not pending" });
    }

    const user = await UserModel.findById(withdrawal.userId);
    if (!user) {
      return res
        .status(404)
        .json({ success: false, message: "User not found" });
    }

    const amount = withdrawal.amount;

    user.mainWallet += amount;
    user.totalPayouts -= amount;
    if (user.totalPayouts < 0) user.totalPayouts = 0;

    await user.save();

    withdrawal.status = "rejected";
    withdrawal.reason = reason || "Rejected by admin";
    withdrawal.transactionHash = "";
    withdrawal.approvedDate = new Date();
    await withdrawal.save();

    return res.status(200).json({
      success: true,
      message: "Withdrawal rejected and balance reverted",
    });
  } catch (error) {
    console.error("Reject Withdrawal Error:", error);
    return res
      .status(500)
      .json({ success: false, message: "Internal server error" });
  }
};
