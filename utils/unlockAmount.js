import { LockedAmountModel } from "../models/lockamount.model.js";

export const processUnlockedAmounts = async () => {
  try {
    const now = Date.now();

    const normalCutoff = new Date(now - 60 * 24 * 60 * 60 * 1000);
    const bonusCutoff = new Date(now - 150 * 24 * 60 * 60 * 1000);

    const [normalResult, bonusResult] = await Promise.all([
      LockedAmountModel.updateMany(
        {
          status: "locked",
          isUnlocked: { $ne: true },
          isBonus: { $ne: true },
          lockedAt: { $lte: normalCutoff },
        },
        {
          $set: {
            isUnlocked: true,
            status: "released",
            unlockedAt: new Date(),
          },
        },
      ),

      LockedAmountModel.updateMany(
        {
          status: "locked",
          isUnlocked: { $ne: true },
          isBonus: true,
          lockedAt: { $lte: bonusCutoff },
        },
        {
          $set: {
            isUnlocked: true,
            status: "released",
            unlockedAt: new Date(),
          },
        },
      ),
    ]);
  } catch (err) {
    console.error("❌ Error in processUnlockedAmounts:", err);
  }
};
