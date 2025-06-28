import cron from "node-cron";
import { processUnlockedAmounts } from "./unlockAmount.js";

let isUnlockingAmounts = false;

cron.schedule("0 0 * * *", async () => {
    if (isUnlockingAmounts) {
        console.log("processUnlockedAmounts is already running. Skipping this run.");
        return;
    }

    isUnlockingAmounts = true;

    try {
        console.log(`[${new Date().toISOString()}] Starting processUnlockedAmounts...`);
        await processUnlockedAmounts();
        console.log("processUnlockedAmounts completed successfully.");
    } catch (error) {
        console.error("Error during processUnlockedAmounts:", error);
    } finally {
        isUnlockingAmounts = false;
    }
});
