import Commission from "../models/teamIncome.model.js";
import UserModel from "../models/user.model.js";

const commissionRatesByLevel = [
  { level: 1, percent: 3 },
  { level: 2, percent: 2 },
  { level: 3, percent: 2 },
  { level: 4, percent: 2 },
  { level: 5, percent: 2 },
];

export const distributeCommissions4Level = async (user, investedAmount) => {
  try {
    const uplineChain = [];
    let current = user;

    for (let i = 0; i < 5; i++) {
      if (!current.sponsorId) break;

      const sponsor = await UserModel.findById(current.sponsorId);
      if (!sponsor) break;

      uplineChain.push(sponsor);
      current = sponsor;
    }

    for (let i = 0; i < uplineChain.length; i++) {
      const uplineUser = uplineChain[i];
      const { level, percent } = commissionRatesByLevel[i];

      const directReferralsCount = await UserModel.countDocuments({ sponsorId: uplineUser._id });
      const allowedLevels = directReferralsCount >= 3 ? 5 : directReferralsCount >= 2 ? 2 : 0;
      if (level > allowedLevels) {
        console.log(`⛔ Skipping level ${level} income for ${uplineUser.username} (has only ${directReferralsCount} referrals)`);
        continue;
      }
      if (uplineUser.isIncomeBlocked) {
        console.log(`⚠️ Skipping commission for ${uplineUser.username} (income blocked)`);
        continue;
      }

      const commissionAmount = (investedAmount * percent) / 100;
      console.log(`✅ Level ${level} commission ₹${commissionAmount} to ${uplineUser.username}`);

      uplineUser.currentEarnings += commissionAmount;
      uplineUser.roiAndLevelIncome += commissionAmount;
      uplineUser.levelIncome += commissionAmount;
      await uplineUser.save();

      await Commission.create({
        userId: uplineUser._id,
        fromUserId: user._id,
        level,
        commissionType: `Level ${level}`,
        commissionPercentage: percent,
        commissionAmount,
        amount: investedAmount,
      });
    }
  } catch (error) {
    console.error("❌ Error in commission distribution:", error.message);
  }
};
