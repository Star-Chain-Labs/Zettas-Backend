import mongoose from "mongoose";

const WalletRuleSchema = new mongoose.Schema(
  {
    enabled: { type: Boolean, default: true },

    minAmount: { type: Number, default: 10 },
    maxAmount: { type: Number, default: 100000 },

    dailyMaxCount: { type: Number, default: 1 },
    dailyMaxAmount: { type: Number, default: 100000 },

    disabledMessage: {
      type: String,
      default: "Withdrawals are temporarily unavailable for this wallet.",
    },

    allowedDaysOfMonth: { type: [Number], default: [] },
  },
  { _id: false },
);

const WithdrawalSettingSchema = new mongoose.Schema(
  {
    tradeWallet: { type: WalletRuleSchema, default: () => ({}) },
    mainWallet: { type: WalletRuleSchema, default: () => ({}) },
    levelWallet: { type: WalletRuleSchema, default: () => ({}) },
  },
  { timestamps: true },
);

const WithdrawalSetting = mongoose.model(
  "WithdrawalSetting",
  WithdrawalSettingSchema,
);

export default WithdrawalSetting;
