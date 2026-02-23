import mongoose from "mongoose";

const LockedAmountSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
    required: true,
  },
  amount: {
    type: Number,
    required: true,
  },
  isBonus: {
    type: Boolean,
    default: false,
  },
  bonusAmount: {
    type: Number,
    default: 0,
  },
  lockedAt: {
    type: Date,
    default: Date.now,
  },
  isClaimed: {
    type: Boolean,
    default: false,
  },
  status: {
    type: String,
    enum: ["locked", "released"],
    default: "locked",
  },
  isUnlocked: {
    type: Boolean,
    default: false,
  },
});

export const LockedAmountModel = mongoose.model(
  "LockedAmount",
  LockedAmountSchema,
);
