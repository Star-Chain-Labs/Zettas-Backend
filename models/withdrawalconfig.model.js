import mongoose from "mongoose";

// day-of-month range: 1..31
const AllowedDayRangeSchema = new mongoose.Schema(
  {
    from: { type: Number, required: true, min: 1, max: 31 },
    to: { type: Number, required: true, min: 1, max: 31 },
  },
  { _id: false },
);

// ✅ date range: "YYYY-MM-DD"
const AllowedDateRangeSchema = new mongoose.Schema(
  {
    from: { type: String, required: true }, // "2026-02-02"
    to: { type: String, required: true }, // "2026-03-01"
  },
  { _id: false },
);

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

    // old: specific days
    allowedDaysOfMonth: { type: [Number], default: [] },

    // old: day-of-month ranges
    allowedDayRanges: { type: [AllowedDayRangeSchema], default: [] },

    // ✅ NEW: date ranges
    allowedDateRanges: { type: [AllowedDateRangeSchema], default: [] },
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
