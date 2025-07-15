import Investment from "../models/investment.model.js";
import UserModel from "../models/user.model.js";
import { calculateTeams } from "./calculateTeam.js";
import RoiLevel from "../models/roiLevel.model.js";
import Roi from "../models/roi.model.js";
import { distributeCommissions } from "./distributeLevelIncomeUpto6LevelBasedOnRoiORAnyIncome.js";

export const distributeRoi = async () => {
  try {
    const allUsers = await UserModel.find({});
    // console.log("🧑‍🤝‍🧑 Total users found:", allUsers.length);

    for (const user of allUsers) {
      // console.log(`\n➡️ Checking user: ${user._id} - ${user.name}`);

      const investments = await Investment.find({ userId: user._id });
      // console.log(`💰 Total investments found: ${investments.length}`);

      if (investments.length === 0) {
        // console.log("⛔ No investments. Skipping user.");
        continue;
      }

      const totalInvestmentAmount = user.mainWallet
      // investments.reduce(
      //   (sum, inv) => sum + inv.investmentAmount,
      //   0
      // );
      // console.log("📊 Total Investment Amount:", totalInvestmentAmount);

      const { teamA, teamB, teamC } = await calculateTeams(user._id);
      // console.log("👥 Team A:", teamA.length);
      // console.log("👥 Team B:", teamB.length);
      // console.log("👥 Team C:", teamC.length);

      const teamACount = teamA.length;
      const teamBAndCCount = teamB.length + teamC.length;

      const roiLevels = await RoiLevel.find({});
      // console.log("📈 ROI Levels found:", roiLevels.length);

      const eligibleLevels = roiLevels.filter(
        (level) =>
          totalInvestmentAmount >= level.minInvestment &&
          totalInvestmentAmount <= level.maxInvestment &&
          teamACount >= level.teamA &&
          teamBAndCCount >= level.teamBAndC
      );

      // console.log("✅ Eligible ROI Levels:", eligibleLevels.length);

      const applicableLevel = eligibleLevels.length
        ? eligibleLevels[eligibleLevels.length - 1]
        : roiLevels[0];

      // console.log("📌 Applicable Level:", applicableLevel);

      const roiPercentage = applicableLevel.roi;
      const baseAmount = totalInvestmentAmount + user.totalRoi;
      const dailyRoi = (baseAmount * roiPercentage) / 100;

      // console.log("💸 Calculated daily ROI:", dailyRoi);

      const roiEntry = new Roi({
        userId: user._id,
        roiAmount: dailyRoi,
        dayCount: 0,
        investment: totalInvestmentAmount,
        percentage: roiPercentage,
      });

      await roiEntry.save();
      // console.log("📝 ROI entry saved.");

      if (user.level < applicableLevel.level) {
        user.level = applicableLevel.level;
        // console.log("📶 User level updated to:", applicableLevel.level);
      }

      await user.save();
      // console.log("✅ User saved.");

      await distributeCommissions(user, dailyRoi);
      // console.log("💰 Commissions distributed.\n");
    }

    return {
      success: true,
      message: "ROI and Commission Distributed Successfully",
    };
  } catch (error) {
    // console.error("❌ distributeRoi error:", error.message);
    throw new Error(error.message || "Server Error");
  }
};
