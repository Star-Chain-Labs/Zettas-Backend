import mongoose from "mongoose";

const promoUsageSchema = new mongoose.Schema(
  {
    promocode: {
      type: String,
    },

    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "UserModel",
    },
  },
  { timestamps: true },
);

const PromoUsage = mongoose.model("PromoUsage", promoUsageSchema);

export default PromoUsage;
