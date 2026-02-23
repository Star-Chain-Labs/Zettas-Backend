import {
  JsonRpcProvider,
  Wallet,
  parseUnits,
  Contract,
  isAddress,
} from "ethers";
import dotenv from "dotenv";
import UserModel from "../models/user.model.js";

import {
  sendWithdrawalApproveEmail,
  sendWithdrawalConfirmationEmail,
} from "../utils/sendWithdrawalConfirmationEmail.js";
import bcrypt from "bcrypt";
import Withdrawal from "../models/withdrawal.model.js";
import WithdrawalSetting from "../models/withdrawalconfig.model.js";

dotenv.config();
const ERC20_ABI = [
  "function balanceOf(address) view returns (uint256)",
  "function transfer(address to, uint256 amount) returns (bool)",
  "function decimals() view returns (uint8)",
];

const RPC_URL = process.env.RPC_URL || "https://bsc-dataseed.binance.org/";
const provider = new JsonRpcProvider(RPC_URL);
const adminWallet = new Wallet(process.env.ADMIN_PRIVATE_KEY, provider);

const usdtContract = new Contract(
  process.env.USDT_CONTRACT_ADDRESS,
  ERC20_ABI,
  adminWallet,
);

const getWithdrawalSettings = async () => {
  let s = await WithdrawalSetting.findOne().lean();
  if (!s) {
    await WithdrawalSetting.create({});
    s = await WithdrawalSetting.findOne().lean();
  }
  return s;
};

// ✅ Minimal wallet field mapping (required)
const WALLET_FIELD = {
  mainWallet: "mainWallet",
  tradeWallet: "totalRoi",
  levelWallet: "levelIncome",
};
export const processWithdrawal = async (req, res) => {
  const userId = req.user._id;

  try {
    const { userWalletAddress, amount, otp, loginPassword, walletType } =
      req.body;

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

    // rules from DB
    const settings = await getWithdrawalSettings();
    const rule = settings?.[walletType];

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

    // allowed days check
    if (
      Array.isArray(rule.allowedDaysOfMonth) &&
      rule.allowedDaysOfMonth.length > 0
    ) {
      const indiaNow = new Date(
        new Date().toLocaleString("en-US", { timeZone: "Asia/Kolkata" }),
      );
      const day = indiaNow.getDate();
      if (!rule.allowedDaysOfMonth.includes(day)) {
        return res.status(403).json({
          success: false,
          message: `Withdrawals from ${walletType} are allowed only on: ${rule.allowedDaysOfMonth.join(", ")}.`,
        });
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

    // ✅ LOG BEFORE
    const beforeBal = Number(user[walletField] || 0);
    console.log("========== WITHDRAW DEBUG ==========");
    console.log("userId:", String(userId));
    console.log("walletType:", walletType, "walletField:", walletField);
    console.log("beforeBalance:", beforeBal);
    console.log("requestedAmount(GROSS):", numericAmount);
    console.log("fee:", fee, "netAmount(to send):", netAmount);
    console.log("NOTE: wallet cut will be GROSS =", numericAmount);
    console.log("====================================");

    // ✅ CUT GROSS AMOUNT (as per your requirement)
    const updatedUser = await UserModel.findOneAndUpdate(
      {
        _id: userId,
        isWithdrawalblock: { $ne: true },
        [walletField]: { $gte: numericAmount }, // ✅ FIX: gross check
      },
      {
        $inc: { [walletField]: -numericAmount }, // ✅ FIX: gross cut
        $set: { otp: null, otpExpire: null },
      },
      { new: true },
    ).select(`_id email name ${walletField}`);

    if (!updatedUser) {
      console.log("❌ CUT FAILED: insufficient balance", {
        need: numericAmount,
        have: beforeBal,
      });
      return res.status(400).json({
        success: false,
        message: `Insufficient balance in ${walletType}.`,
      });
    }

    // ✅ LOG AFTER CUT
    const afterCutBal = Number(updatedUser[walletField] || 0);
    console.log("✅ CUT SUCCESS");
    console.log("afterCutBalance:", afterCutBal);
    console.log(
      "minusDone(actual):",
      Number((beforeBal - afterCutBal).toFixed(6)),
    );
    console.log("expectedMinus(gross):", numericAmount);
    console.log("====================================");

    // create withdrawal record
    const wd = await Withdrawal.create({
      userId,
      userWalletAddress,
      amount: numericAmount, // ✅ gross stored
      feeAmount: fee,
      netAmountSent: netAmount, // ✅ net stored
      status: "processing",
      transactionHash: "",
      walletType,
      processedAt: null,
      failReason: "",
    });

    // blockchain transfer (netAmount)
    try {
      const DECIMALS =
        Number(process.env.USDT_DECIMALS) ||
        Number(await usdtContract.decimals());

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
          status: "success",
          transactionHash: receipt.hash,
          processedAt: new Date(),
        },
      });

      console.log("✅ CHAIN TRANSFER SUCCESS:", receipt.hash);

      return res.status(200).json({
        success: true,
        message: `Withdrawal successful. Requested: $${numericAmount.toFixed(
          2,
        )}, Fee: $${fee.toFixed(2)}, Sent: $${netAmount.toFixed(2)}.`,
        transactionHash: receipt.hash,
      });
    } catch (txErr) {
      // ✅ REFUND GROSS (because we cut gross)
      const refundRes = await UserModel.findOneAndUpdate(
        { _id: userId },
        { $inc: { [walletField]: numericAmount } }, // ✅ FIX: gross refund
        { new: true },
      ).select(`${walletField}`);

      const afterRefundBal = Number(refundRes?.[walletField] || 0);

      console.log("❌ CHAIN TRANSFER FAILED:", txErr?.message);
      console.log("✅ REFUND DONE (GROSS)");
      console.log("afterRefundBalance:", afterRefundBal);
      console.log("refundAdded(gross):", numericAmount);
      console.log("====================================");

      await Withdrawal.findByIdAndUpdate(wd._id, {
        $set: {
          status: "failed",
          failReason: txErr?.message || "Payout failed",
          processedAt: new Date(),
        },
      });

      const msg =
        txErr?.message === "SERVER_LOW_BALANCE"
          ? "Admin payout wallet has insufficient USDT. Your full amount has been refunded. Please try later."
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
// export const processWithdrawal = async (req, res) => {
//   const userId = req.user._id;

//   try {
//     const { userWalletAddress, amount, otp, loginPassword, walletType } =
//       req.body;

//     // basic validations
//     if (
//       !userWalletAddress ||
//       !amount ||
//       !otp ||
//       !loginPassword ||
//       !walletType
//     ) {
//       return res
//         .status(400)
//         .json({ success: false, message: "All fields are required." });
//     }

//     if (!isAddress(userWalletAddress)) {
//       return res
//         .status(400)
//         .json({ success: false, message: "Invalid wallet address." });
//     }

//     if (!["mainWallet", "levelWallet", "tradeWallet"].includes(walletType)) {
//       return res
//         .status(400)
//         .json({ success: false, message: "Invalid wallet type specified." });
//     }

//     const numericAmount = Number(amount);
//     if (!Number.isFinite(numericAmount) || numericAmount <= 0) {
//       return res
//         .status(400)
//         .json({ success: false, message: "Invalid amount." });
//     }

//     // user fetch
//     const user = await UserModel.findById(userId);
//     if (!user)
//       return res
//         .status(404)
//         .json({ success: false, message: "User not found" });

//     if (user.isWithdrawalblock) {
//       return res.status(403).json({
//         success: false,
//         message: "Withdrawals are blocked for your account.",
//       });
//     }

//     // password + otp
//     const okPass = await bcrypt.compare(loginPassword, user.password);
//     if (!okPass)
//       return res
//         .status(401)
//         .json({ success: false, message: "Incorrect login password." });

//     if (user.otp !== otp || user.otpExpire < Date.now()) {
//       return res
//         .status(400)
//         .json({ success: false, message: "Invalid or expired OTP." });
//     }

//     // rules from DB
//     const settings = await getWithdrawalSettings();
//     const rule = settings?.[walletType];

//     if (!rule) {
//       return res
//         .status(500)
//         .json({ success: false, message: "Withdrawal rules not configured." });
//     }

//     if (rule.enabled === false) {
//       return res.status(400).json({
//         success: false,
//         message:
//           rule.disabledMessage || "Withdrawals are disabled for this wallet.",
//       });
//     }

//     // allowed days check
//     if (
//       Array.isArray(rule.allowedDaysOfMonth) &&
//       rule.allowedDaysOfMonth.length > 0
//     ) {
//       const indiaNow = new Date(
//         new Date().toLocaleString("en-US", { timeZone: "Asia/Kolkata" }),
//       );
//       const day = indiaNow.getDate();
//       if (!rule.allowedDaysOfMonth.includes(day)) {
//         return res.status(403).json({
//           success: false,
//           message: `Withdrawals from ${walletType} are allowed only on: ${rule.allowedDaysOfMonth.join(", ")}.`,
//         });
//       }
//     }

//     // min/max check
//     const minA = Number(rule.minAmount ?? 10);
//     const maxA = Number(rule.maxAmount ?? 100000);

//     if (numericAmount < minA) {
//       return res.status(400).json({
//         success: false,
//         message: `Minimum withdrawal for ${walletType} is $${minA}.`,
//       });
//     }
//     if (numericAmount > maxA) {
//       return res.status(400).json({
//         success: false,
//         message: `Maximum withdrawal for ${walletType} is $${maxA}.`,
//       });
//     }

//     // fee + net
//     const feePercent = 5;
//     const fee = (numericAmount * feePercent) / 100;
//     const netAmount = Number((numericAmount - fee).toFixed(6));
//     console.log("Calculated fee:", fee, "Net amount:", netAmount);
//     console.log(amount, "amount");
//     if (netAmount <= 0) {
//       return res.status(400).json({
//         success: false,
//         message: "Net amount must be greater than 0.",
//       });
//     }

//     // ✅ wallet field decide
//     const walletField = WALLET_FIELD[walletType];
//     if (!walletField) {
//       return res
//         .status(500)
//         .json({ success: false, message: "Wallet mapping not configured." });
//     }

//     const updatedUser = await UserModel.findOneAndUpdate(
//       {
//         _id: userId,
//         isWithdrawalblock: { $ne: true },
//         [walletField]: { $gte: amount },
//       },
//       {
//         $inc: { [walletField]: -amount },
//         $set: { otp: null, otpExpire: null },
//       },
//       { new: true },
//     ).select("_id email name");

//     if (!updatedUser) {
//       return res.status(400).json({
//         success: false,
//         message: `Insufficient balance in ${walletType}.`,
//       });
//     }

//     // create record (processing)
//     const wd = await Withdrawal.create({
//       userId,
//       userWalletAddress,
//       amount: amount,
//       feeAmount: fee,
//       netAmountSent: netAmount,
//       status: "processing",
//       transactionHash: "",
//       walletType,
//       processedAt: null,
//       failReason: "",
//     });

//     // ✅ blockchain transfer (netAmount)
//     try {
//       const DECIMALS =
//         Number(process.env.USDT_DECIMALS) ||
//         Number(await usdtContract.decimals());

//       const amountWei = parseUnits(netAmount.toString(), DECIMALS);

//       const adminAddress = await adminWallet.getAddress();
//       const serverBalance = await usdtContract.balanceOf(adminAddress);

//       if (serverBalance < amountWei) throw new Error("SERVER_LOW_BALANCE");

//       const tx = await usdtContract.transfer(userWalletAddress, amountWei, {
//         gasLimit: 210000,
//       });
//       const receipt = await tx.wait();
//       if (!receipt?.status) throw new Error("TX_REVERTED");

//       await Withdrawal.findByIdAndUpdate(wd._id, {
//         $set: {
//           status: "success",
//           transactionHash: receipt.hash,
//           processedAt: new Date(),
//         },
//       });

//       await sendWithdrawalConfirmationEmail(
//         updatedUser.email,
//         updatedUser.name,
//         numericAmount,
//         netAmount,
//         userWalletAddress,
//         new Date(),
//       );

//       return res.status(200).json({
//         success: true,
//         message: `Withdrawal successful. Requested: $${numericAmount.toFixed(
//           2,
//         )}, Fee: $${fee.toFixed(2)}, Sent: $${netAmount.toFixed(2)}.`,
//         transactionHash: receipt.hash,
//       });
//     } catch (txErr) {
//       // ✅ refund ONLY netAmount (because we cut netAmount)
//       await UserModel.updateOne(
//         { _id: userId },
//         { $inc: { [walletField]: netAmount } },
//       );

//       await Withdrawal.findByIdAndUpdate(wd._id, {
//         $set: {
//           status: "failed",
//           failReason: txErr?.message || "Payout failed",
//           processedAt: new Date(),
//         },
//       });

//       const msg =
//         txErr?.message === "SERVER_LOW_BALANCE"
//           ? "Admin payout wallet has insufficient USDT. Your amount has been refunded. Please try later."
//           : "Blockchain transfer failed. Amount refunded to your wallet.";

//       return res
//         .status(500)
//         .json({ success: false, message: msg, error: txErr?.message });
//     }
//   } catch (error) {
//     console.error("Withdrawal Error:", error);
//     return res.status(500).json({
//       success: false,
//       message: "Internal server error during withdrawal.",
//     });
//   }
// };

//   const userId = req.user._id;
//   try {
//     const user = await UserModel.findById(userId).populate("referedUsers");
//     if (!user) {
//       return res
//         .status(404)
//         .json({ success: false, message: "User not found" });
//     }

//     if (user.isWithdrawalblock) {
//       return res.status(403).json({
//         success: false,
//         message: "Withdrawals are blocked for your account.",
//       });
//     }
//     if (!isWithdrawalDay()) {
//       return res.status(403).json({
//         success: false,
//         message: "Withdrawals are only allowed on 15th of every month .",
//       });
//     }
//     const { userWalletAddress, amount, otp, loginPassword, walletType } =
//       req.body;
//     if (
//       !userWalletAddress ||
//       !amount ||
//       !otp ||
//       !loginPassword ||
//       !walletType
//     ) {
//       return res
//         .status(400)
//         .json({ success: false, message: "All fields are required." });
//     }
//     if (!isAddress(userWalletAddress)) {
//       return res
//         .status(400)
//         .json({ success: false, message: "Invalid wallet address." });
//     }
//     if (
//       walletType !== "mainWallet" &&
//       walletType !== "levelWallet" &&
//       walletType !== "tradeWallet"
//     ) {
//       return res
//         .status(400)
//         .json({ success: false, message: "Invalid wallet type specified." });
//     }

//     const isPasswordCorrect = await bcrypt.compare(
//       loginPassword,
//       user.password,
//     );
//     if (!isPasswordCorrect) {
//       return res
//         .status(401)
//         .json({ success: false, message: "Incorrect login password." });
//     }

//     if (user.otp !== otp || user.otpExpire < Date.now()) {
//       return res
//         .status(400)
//         .json({ success: false, message: "Invalid or expired OTP." });
//     }

//     const numericAmount = Number(amount);
//     if (isNaN(numericAmount) || numericAmount < 10) {
//       return res
//         .status(400)
//         .json({ success: false, message: "Minimum withdrawal is $10." });
//     }

//     // 8. Wallet specific logic
//     // if (walletType === "levelWallet") {
//     //   const activeUsers =
//     //     user.referedUsers?.filter((u) => u.additionalWallet > 0).length || 0;
//     //   if (activeUsers < 5) {
//     //     return res.status(400).json({
//     //       success: false,
//     //       message:
//     //         "You need at least 5 active referred users to withdraw from Level Wallet.",
//     //     });
//     //   }

//     if (walletType === "levelWallet") {
//       const activeUsers =
//         user.referedUsers?.filter(
//           (u) => u.mainWallet > 0 || u.additionalWallet > 0,
//         ).length || 0;

//       if (activeUsers < 5) {
//         return res.status(400).json({
//           success: false,
//           message:
//             "You need at least 5 active referred users to withdraw from Level Wallet.",
//         });
//       }

//       if (user.levelIncome < numericAmount) {
//         return res.status(400).json({
//           success: false,
//           message: "Insufficient Level Income balance.",
//         });
//       }

//       user.levelIncome -= numericAmount;
//     }

//     if (walletType === "tradeWallet") {
//       // Month end check
//       // const today = new Date();
//       // const lastDayOfMonth = new Date(
//       //   today.getFullYear(),
//       //   today.getMonth() + 1,
//       //   0
//       // ).getDate();
//       // if (today.getDate() !== lastDayOfMonth) {
//       //   return res.status(403).json({
//       //     success: false,
//       //     message:
//       //       "Withdrawals from Trade Wallet are only allowed on the last day of the month.",
//       //   });
//       // }
//       if (user.totalRoi < numericAmount) {
//         return res.status(400).json({
//           success: false,
//           message: "Insufficient Trade Wallet balance.",
//         });
//       }
//       user.totalRoi -= numericAmount;
//     }

//     if (walletType === "mainWallet") {
//       if (user.mainWallet < numericAmount) {
//         return res.status(400).json({
//           success: false,
//           message: "Insufficient Main Wallet balance.",
//         });
//       }

//       user.mainWallet -= numericAmount;
//     }

//     // 9. Fee calculation
//     const fee = (numericAmount * 5) / 100;
//     const netAmount = numericAmount - fee;

//     const serverBalance = await usdtContract.balanceOf(wallet.address);
//     const amountWei = parseUnits(netAmount.toString(), 18);

//     if (serverBalance < amountWei) {
//       return res.status(400).json({
//         success: false,
//         message:
//           "Transaction could not be processed at the moment. Please try again later",
//       });
//     }

//     const tx = await usdtContract.transfer(userWalletAddress, amountWei, {
//       gasLimit: 210000,
//     });
//     const receipt = await tx.wait();
//     const txStatus = receipt.status ? "success" : "failed";
//     user.totalPayouts += numericAmount;
//     user.otp = null;
//     user.otpExpire = null;
//     await user.save();

//     // 10. Withdrawal record create
//     await Withdrawal.create({
//       userId,
//       userWalletAddress,
//       amount: numericAmount,
//       feeAmount: fee,
//       netAmountSent: netAmount,
//       status: "pending",
//       transactionHash: "",
//       walletType,
//     });

//     // 11. Send confirmation mail
//     await sendWithdrawalConfirmationEmail(
//       user.email,
//       user.name,
//       numericAmount,
//       netAmount,
//       userWalletAddress,
//       new Date(),
//     );

//     return res.status(200).json({
//       success: true,
//       message: `Withdrawal request submitted successfully. Net amount: $${netAmount.toFixed(
//         2,
//       )}.`,
//     });
//   } catch (error) {
//     console.error("Withdrawal Error:", error);
//     return res.status(500).json({
//       success: false,
//       message: "Internal server error during withdrawal.",
//     });
//   }
// };
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
