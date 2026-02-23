import mongoose from "mongoose";

const promoUsageSchema = new mongoose.Schema(
  {
    promoId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Promocode",
      required: true,
    },

    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "UserModel",
      required: true,
    },

    code: { type: String, required: true },
  },
  { timestamps: true },
);

promoUsageSchema.index({ promoId: 1, userId: 1 }, { unique: true });

const PromoUsage = mongoose.model("PromoUsage", promoUsageSchema);

export default PromoUsage;
