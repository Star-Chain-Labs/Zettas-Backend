import mongoose from "mongoose";

const cardApplicationSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "UserModel",
      required: true,
    },
    name: {
      type: String,
    },
    email: {
      type: String,
    },
    phone: {
      type: String,
    },
    country: {
      type: String,
    },
    cpuntryCode: {
      type: String,
    },

    status: {
      type: String,
      enum: ["pending", "approved", "rejected"],
      default: "pending",
      required: true,
    },
    rejectionReason: {
      type: String,
      default: "",
    },
  },
  { timestamps: true },
);

const CardApplication = mongoose.model(
  "CardApplication",
  cardApplicationSchema,
);

export default CardApplication;
