import Commission from "../models/teamIncome.model.js";
import UserModel from "../models/user.model.js";

const commissionRatesByLevel = [{ level: 1, percent: 50 }];

export const distributeCommissions4Level = async (user, investedAmount) => {
  try {
    if (!user.sponsorId) return;

    const sponsor = await UserModel.findById(user.sponsorId);
    if (!sponsor) return;

    const { level, percent } = commissionRatesByLevel[0];

    if (sponsor.isIncomeBlocked) {
      console.log(
        `⚠️ Skipping commission for ${sponsor.username} (income blocked)`
      );
      return;
    }

    const commissionAmount = (investedAmount * percent) / 100;
    console.log(
      `✅ Level ${level} commission ₹${commissionAmount} to ${sponsor.username}`
    );

    sponsor.currentEarnings += commissionAmount;
    sponsor.roiAndLevelIncome += commissionAmount;
    sponsor.levelIncome += commissionAmount;
    await sponsor.save();

    await Commission.create({
      userId: sponsor._id,
      fromUserId: user._id,
      level,
      commissionType: `Level ${level}`,
      commissionPercentage: percent,
      commissionAmount,
      amount: investedAmount,
    });
  } catch (error) {
    console.error("❌ Error in commission distribution:", error.message);
  }
};
