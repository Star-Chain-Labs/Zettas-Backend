import UserModel from "../models/user.model.js";
import Investment from "../models/investment.model.js";
import Roi from "../models/roi.model.js";
import { distributeCommissions4Level } from "./distributeLevelIncomeUpto4Level.js";

// function generateRandomRoiTillTarget(
//   currentTotalRoi,
//   investedAmount,
//   totalTargetPercent,
//   remainingDays
// ) {
//   const maxTarget = (investedAmount * totalTargetPercent) / 100;
//   const remainingRoi = maxTarget - currentTotalRoi;
//   if (remainingRoi <= 0 || remainingDays <= 0) return 0;

//   const avgDaily = remainingRoi / remainingDays;
//   const randomFactor = Math.random() * 1.5;
//   return Math.min(avgDaily * randomFactor, remainingRoi);
// }

// function generateRandomRoiTillTarget(
//   currentTotalRoi,
//   investedAmount,
//   totalTargetPercent,
//   remainingDays
// ) {
//   const maxTarget = (investedAmount * totalTargetPercent) / 100;
//   const remainingRoi = maxTarget - currentTotalRoi;

//   if (remainingRoi <= 0 || remainingDays <= 0) return 0;

//   const avgDaily = remainingRoi / remainingDays;

//   const randomFactor = 0.7 + Math.random() * 0.4;

//   return Math.min(avgDaily * randomFactor, remainingRoi);
// }

// export const triggerMonthlyTargetRoi = async (req, res) => {
//   try {
//     const userId = req.user._id;
//     const user = await UserModel.findById(userId);
//     if (!user)
//       return res
//         .status(404)
//         .json({ success: false, message: "User not found" });

//     const investedAmount = Number(user?.additionalWallet || 0);
//     if (isNaN(investedAmount) || investedAmount <= 0) {
//       return res
//         .status(400)
//         .json({ success: false, message: "Invalid investment amount." });
//     }
//     const today = new Date();
//     today.setHours(0, 0, 0, 0);

//     const existingTodayRoi = await Roi.findOne({
//       userId,
//       createdAt: { $gte: today },
//     });

//     if (existingTodayRoi) {
//       return res.status(200).json({
//         success: false,
//         message: "⛔ You have already claimed today's Trade.",
//         tradeStatus: "already-claimed",
//       });
//     }

//     const tradeRecords = await Roi.find({ userId }).sort({ createdAt: 1 });
//     const totalEarnedRoi = tradeRecords.reduce(
//       (sum, r) => sum + (r.roiAmount || 0),
//       0
//     );
//     const daysPassed = tradeRecords.length;
//     const totalDays = 30;
//     const totalTargetPercent = 10;

//     const tradeAmount = generateRandomRoiTillTarget(
//       totalEarnedRoi,
//       investedAmount,
//       totalTargetPercent,
//       totalDays - daysPassed
//     );

//     if (isNaN(tradeAmount) || tradeAmount <= 0) {
//       return res.status(200).json({
//         success: false,
//         message:
//           "Your monthly target is balanced for now, so no trade was generated today. Come back tomorrow!",
//         tradeStatus: "skipped",
//       });
//     }

//     const percentage = Number((tradeAmount / investedAmount) * 100);

//     if (isNaN(percentage)) {
//       return res
//         .status(500)
//         .json({ success: false, message: "Invalid percentage calculated." });
//     }

//     await Roi.create({
//       userId,
//       roiAmount: Number(tradeAmount.toFixed(2)),
//       dayCount: daysPassed + 1,
//       investment: investedAmount,
//       percentage: Number(percentage.toFixed(2)),
//     });

//     user.currentEarnings += tradeAmount;
//     user.roiAndLevelIncome += Number(tradeAmount);
//     user.dailyRoi = Number(tradeAmount);
//     user.totalRoi += Number(tradeAmount);
//     user.totalTradeCount += 1;
//     await user.save();

//     await distributeCommissions4Level(user, tradeAmount);

//     return res.status(200).json({
//       success: true,
//       message: `✅ Trade successful. You earned $${tradeAmount.toFixed(
//         2
//       )} Trade today.`,
//       tradeAmount: tradeAmount.toFixed(2),
//       totalEarned: user.totalRoi,
//       tradeStatus: "success",
//     });
//   } catch (err) {
//     console.error("❌ Error in triggerMonthlyTargetRoi:", err);
//     res.status(500).json({ success: false, message: "Server error." });
//   }
// };

// Fixed Daily ROI Generator (0.33% daily)
function generateFixedDailyRoi(
  currentTotalRoi,
  investedAmount,
  totalTargetPercent
) {
  const maxTarget = (investedAmount * totalTargetPercent) / 100;
  const remainingRoi = maxTarget - currentTotalRoi;

  if (remainingRoi <= 0) return 0;

  const dailyPercent = totalTargetPercent / 30;
  const dailyRoi = (investedAmount * dailyPercent) / 100;

  return Math.min(dailyRoi, remainingRoi);
}

export const triggerMonthlyTargetRoi = async (req, res) => {
  try {
    const userId = req.user._id;
    const user = await UserModel.findById(userId);
    if (!user)
      return res
        .status(404)
        .json({ success: false, message: "User not found" });

    const investedAmount = Number(user?.additionalWallet || 0);
    if (isNaN(investedAmount) || investedAmount <= 0) {
      return res
        .status(400)
        .json({ success: false, message: "Invalid investment amount." });
    }

    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const endOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0);

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const existingTodayRoi = await Roi.findOne({
      userId,
      createdAt: { $gte: today },
    });

    if (existingTodayRoi) {
      return res.status(200).json({
        success: false,
        message: "⛔ You have already claimed today's trade.",
        tradeStatus: "already-claimed",
      });
    }

    const tradeRecords = await Roi.find({
      userId,
      createdAt: { $gte: startOfMonth, $lte: endOfMonth },
    }).sort({ createdAt: 1 });

    const totalEarnedRoi = tradeRecords.reduce(
      (sum, r) => sum + (r.roiAmount || 0),
      0
    );

    const daysPassed = tradeRecords.length;
    const totalTargetPercent = 10;

    const tradeAmount = generateFixedDailyRoi(
      totalEarnedRoi,
      investedAmount,
      totalTargetPercent
    );

    if (isNaN(tradeAmount) || tradeAmount <= 0) {
      return res.status(200).json({
        success: false,
        message:
          "No trade executed today due to unfavorable market conditions. Please check back tomorrow for the next trade opportunity.",
        tradeStatus: "skipped",
      });
    }

    const percentage = Number((tradeAmount / investedAmount) * 100);

    if (isNaN(percentage)) {
      return res
        .status(500)
        .json({ success: false, message: "Invalid percentage calculated." });
    }

    // Save ROI Record
    await Roi.create({
      userId,
      roiAmount: Number(tradeAmount.toFixed(2)),
      dayCount: daysPassed + 1,
      investment: investedAmount,
      percentage: Number(percentage.toFixed(2)),
    });

    // Update User Wallets
    user.currentEarnings += tradeAmount;
    user.roiAndLevelIncome += Number(tradeAmount);
    user.dailyRoi = Number(tradeAmount);
    user.totalRoi += Number(tradeAmount);
    user.totalTradeCount += 1;
    await user.save();

    // Distribute commissions
    await distributeCommissions4Level(user, tradeAmount);

    // Progress Percentage
    const monthlyTarget = (investedAmount * totalTargetPercent) / 100;
    const newTotalEarned = totalEarnedRoi + tradeAmount;
    const progressPercent = ((newTotalEarned / monthlyTarget) * 100).toFixed(2);

    return res.status(200).json({
      success: true,
      message: `✅ Trade successful! You earned $${tradeAmount.toFixed(
        2
      )} today. Monthly target ${progressPercent}% completed.`,
      tradeAmount: tradeAmount.toFixed(2),
      totalEarned: user.totalRoi,
      progressPercent,
      tradeStatus: "success",
    });
  } catch (err) {
    console.error("❌ Error in triggerMonthlyTargetRoi:", err);
    res.status(500).json({ success: false, message: "Server error." });
  }
};
