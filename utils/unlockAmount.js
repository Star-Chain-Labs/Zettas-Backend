import { LockedAmountModel } from "../models/lockamount.model.js";
import UserModel from "../models/user.model.js";

export const processUnlockedAmounts = async () => {
    const sixtyDaysAgo = new Date(Date.now() - 60 * 24 * 60 * 60 * 1000);

    try {
        const unlockedAmounts = await LockedAmountModel.find({
            status: "locked",
            lockedAt: { $lte: sixtyDaysAgo }
        });

        for (let entry of unlockedAmounts) {
            const user = await UserModel.findById(entry.userId);

            if (!user) continue;

            await user.save();

            entry.status = "released";
            entry.isUnlocked = true;
            await entry.save();

        }

    } catch (err) {
        console.error("Error in processUnlockedAmounts:", err);
    }
};

