import mongoose from "mongoose";
import WithdrawalSetting from "../models/withdrawalconfig.model.js";

// 🔥 YAHAN APNA MONGO URL PASTE KAR
const MONGO_URI =
  "mongodb+srv://bhaisiddharth63:nexoinvest1234@cluster0.difrzt8.mongodb.net/Zettas";

const seed = async () => {
  try {
    await mongoose.connect(MONGO_URI, {
      maxPoolSize: 10,
    });

    console.log("🟢 MongoDB Connected");

    // old remove (optional)
    await WithdrawalSetting.deleteMany({});

    // insert config
    await WithdrawalSetting.create({
      tradeWallet: {
        enabled: true,
        minAmount: 10,
        maxAmount: 500,
        dailyMaxCount: 3,
        dailyMaxAmount: 1000,
        allowedDaysOfMonth: [],
      },

      mainWallet: {
        enabled: false,
        minAmount: 10,
        maxAmount: 1000,
        dailyMaxCount: 1,
        dailyMaxAmount: 1000,
        allowedDaysOfMonth: [15],
        disabledMessage:
          "Withdrawals from Main Wallet are currently under scheduled processing. Please use Trade Wallet for instant withdrawals.",
      },

      levelWallet: {
        enabled: false,
        minAmount: 10,
        maxAmount: 1000,
        dailyMaxCount: 1,
        dailyMaxAmount: 1000,
        disabledMessage:
          "Withdrawals from Level Wallet are currently disabled due to some technical issues. We are working to resolve this as soon as possible.",
      },
    });

    console.log("✅ WithdrawalSetting inserted successfully");

    await mongoose.disconnect();
    process.exit(0);
  } catch (err) {
    console.error("❌ Seed Error:", err.message);
    process.exit(1);
  }
};

seed();
