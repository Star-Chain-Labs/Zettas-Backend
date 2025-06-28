import { LockedAmountModel } from "../models/lockamount.model.js";
import UnlockedAmountModel from "../models/unlockAmount.model.js";
import UserModel from "../models/user.model.js";

export const processUnlockedAmounts = async () => {
    const sixtyDaysAgo = new Date(Date.now() - 60 * 24 * 60 * 60 * 1000);


    // console.log(`[${new Date().toISOString()}] processUnlockedAmounts started.`);

    try {
        const unlockedAmounts = await LockedAmountModel.find({
            status: "locked",
            lockedAt: { $lte: sixtyDaysAgo }
        });

        // console.log(`Found ${unlockedAmounts.length} locked amounts eligible for unlocking.`);

        for (let entry of unlockedAmounts) {
            // console.log(`Processing locked amount: ${entry._id} | User: ${entry.userId} | Amount: ₹${entry.amount}`);

            const user = await UserModel.findById(entry.userId);

            if (!user) {
                // console.log(`User not found for ID: ${entry.userId}`);
                continue;
            }

            // Step 2: Add to user's current earnings
            user.currentEarnings += entry.amount;
            await user.save();
            // console.log(`Updated user (${user._id}) currentEarnings: ₹${user.currentEarnings}`);

            entry.status = "released";
            await entry.save();
            // console.log(`Marked locked amount (${entry._id}) as released.`);

            const history = await UnlockedAmountModel.create({
                userId: entry.userId,
                amount: entry.amount,
                sourceLockedId: entry._id
            });
            // console.log(`Unlock history created with ID: ${history._id}`);
        }

        // console.log("processUnlockedAmounts completed successfully.");
    } catch (err) {
        console.error("Error in processUnlockedAmounts:", err);
    }
};
