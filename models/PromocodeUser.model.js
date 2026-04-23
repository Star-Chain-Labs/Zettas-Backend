import mongoose from "mongoose";

const promocodeUserSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "UserModel",
    },
    code: {
      type: String,
      required: true,
    },
    discountPercentage: {
      type: Number,
      default: 0,
    },
  },
  { timestamps: true },
);

const PromocodeUser = mongoose.model("PromocodeUser", promocodeUserSchema);
export default PromocodeUser;
