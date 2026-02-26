import mongoose from "mongoose";

const investmentSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "UserModel",
    },
    walletAddress: {
      type: String,
    },

    investmentAmount: {
      type: Number,
      required: true,
    },
    investmentDate: {
      type: Date,
      default: Date.now,
    },
    txResponse: {
      type: String,
      unique: true,
    },
  },
  { timestamps: true },
);

const Investment = mongoose.model("Investment", investmentSchema);

export default Investment;
