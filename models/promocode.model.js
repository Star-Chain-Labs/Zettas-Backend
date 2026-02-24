import mongoose from "mongoose";

const promocodeSchema = new mongoose.Schema(
  {
    code: { type: String, required: true, unique: true },
    discountType: {
      type: String,
      enum: ["percentage"],
      required: true,
    },
    discountValue: { type: Number, required: true },
    maxRedemptions: { type: Number, default: 1 },
    redemptionsCount: { type: Number, default: 0 },
  },
  { timestamps: true },
);

const Promocode = mongoose.model("Promocode", promocodeSchema);

export default Promocode;
