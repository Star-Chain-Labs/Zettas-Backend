import mongoose from "mongoose";

const withdrawalRuleSchema = new mongoose.Schema(
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
    allowedDayRanges: {
      type: [{ from: Number, to: Number }],
      default: [],
    },
    allowedDateRanges: {
      type: [{ from: String, to: String }],
      default: [],
    },
  },
  { _id: false },
);

const userWithdrawalSettingSchema = new mongoose.Schema(
  {
    username: {
      type: String,
      required: true,
      unique: true, // ek user ka ek hi setting doc
      index: true,
    },
    tradeWallet: { type: withdrawalRuleSchema, default: () => ({}) },
    mainWallet: { type: withdrawalRuleSchema, default: () => ({}) },
    levelWallet: { type: withdrawalRuleSchema, default: () => ({}) },
  },
  { timestamps: true },
);

const UserWithdrawalSetting = mongoose.model(
  "UserWithdrawalSetting",
  userWithdrawalSettingSchema,
);

export default UserWithdrawalSetting;
