import mongoose from "mongoose";

const aroiSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "UserModel",
      required: true,
    },
    investment: {
      type: Number,
      default: 0,
    },
    roiAmount: {
      type: Number,
      default: 0,
    },
    dayCount: {
      type: Number,
      required: true,
    },
    creditedOn: {
      type: Date,
      default: Date.now,
    },
    percentage: {
      type: Number,
      default: 0,
    },
    isClaimed: {
      type: Boolean,
      default: false,
    },
  },
  { timestamps: true }
);

const Roi = mongoose.model("Roi", aroiSchema);
export default Roi;
