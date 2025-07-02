import UserModel from "../models/user.model.js";
import Investment from "../models/investment.model.js";
import Roi from "../models/roi.model.js";
import { distributeCommissions4Level } from "./distributeLevelIncomeUpto4Level.js";

function generateRandomRoiTillTarget(currentTotalRoi, investedAmount, totalTargetPercent, remainingDays) {
  const maxTarget = (investedAmount * totalTargetPercent) / 100;
  const remainingRoi = maxTarget - currentTotalRoi;
  if (remainingRoi <= 0 || remainingDays <= 0) return 0;

  const avgDaily = remainingRoi / remainingDays;
  const randomFactor = Math.random() * 1.5;
  return Math.min(avgDaily * randomFactor, remainingRoi);
}

export const triggerMonthlyTargetRoi = async (req, res) => {
  try {
    const userId = req.user._id;
    const user = await UserModel.findById(userId);

    if (!user) return res.status(404).json({ success: false, message: "User not found" });


    const investedAmount = Number(user?.additionalWallet || 0);
    if (isNaN(investedAmount) || investedAmount <= 0) {
      return res.status(400).json({ success: false, message: "Invalid investment amount." });
    }

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const existingTodayRoi = await Roi.findOne({
      userId,
      createdAt: { $gte: today },
    });

    if (existingTodayRoi) {
      return res.status(200).json({
        success: false,
        message: "⛔ You have already claimed today's Trade.",
        tradeStatus: "already-claimed",
      });
    }

    const tradeRecords = await Roi.find({ userId }).sort({ createdAt: 1 });
    const totalEarnedRoi = tradeRecords.reduce((sum, r) => sum + (r.roiAmount || 0), 0);
    const daysPassed = tradeRecords.length;
    const totalDays = 30;
    const totalTargetPercent = 10;

    const tradeAmount = generateRandomRoiTillTarget(totalEarnedRoi, investedAmount, totalTargetPercent, totalDays - daysPassed);

    if (isNaN(tradeAmount) || tradeAmount <= 0) {
      return res.status(200).json({
        success: false,
        message: "No Trade today to balance monthly target.",
        tradeStatus: "skipped",
      });
    }

    const percentage = Number((tradeAmount / investedAmount) * 100);

    if (isNaN(percentage)) {
      return res.status(500).json({ success: false, message: "Invalid percentage calculated." });
    }

    await Roi.create({
      userId,
      roiAmount: Number(tradeAmount.toFixed(2)),
      dayCount: daysPassed + 1,
      investment: investedAmount,
      percentage: Number(percentage.toFixed(2)),
    });

    user.currentEarnings += tradeAmount;
    user.mainWallet += tradeAmount;
    user.dailyRoi = Number(tradeAmount);
    user.totalRoi += Number(tradeAmount);
    await user.save();

    await distributeCommissions4Level(user, tradeAmount);

    return res.status(200).json({
      success: true,
      message: `✅ Trade successful. You earned $${tradeAmount.toFixed(2)} Trade today.`,
      tradeAmount: tradeAmount.toFixed(2),
      totalEarned: user.totalRoi,
      tradeStatus: "success",
    });

  } catch (err) {
    console.error("❌ Error in triggerMonthlyTargetRoi:", err);
    res.status(500).json({ success: false, message: "Server error." });
  }
};
