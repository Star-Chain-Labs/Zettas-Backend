import cron from "node-cron";
import { processUnlockedAmounts } from "./unlockAmount.js";
import { resetTradeCount } from "./resetTradeCount.js";

let isUnlockingAmounts = false;
let isResettingTradeCount = false;

cron.schedule("0 0 * * *", async () => {
  if (isUnlockingAmounts) {
    console.log(
      "processUnlockedAmounts is already running. Skipping this run.",
    );
    return;
  }
  isUnlockingAmounts = true;
  try {
    console.log(
      `[${new Date().toISOString()}] Starting processUnlockedAmounts...`,
    );
    await processUnlockedAmounts();
    console.log("processUnlockedAmounts completed successfully.");
  } catch (error) {
    console.error("Error during processUnlockedAmounts:", error);
  } finally {
    isUnlockingAmounts = false;
  }
});
cron.schedule(
  "0 0 * * *",
  async () => {
    if (isResettingTradeCount) {
      console.log("reset trade count is already running. Skipping this run.");
      return;
    }

    isResettingTradeCount = true;

    try {
      console.log(`[${new Date().toISOString()}] Starting resetTradeCount...`);
      await resetTradeCount();
      console.log("resetTradeCount completed successfully.");
    } catch (error) {
      console.error("Error during resetTradeCount:", error);
    } finally {
      isResettingTradeCount = false;
    }
  },
  {
    timezone: "Asia/Kolkata",
  },
);
