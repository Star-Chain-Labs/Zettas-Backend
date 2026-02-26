import mongoose from "mongoose";

const adminSchema = new mongoose.Schema(
  {
    email: {
      type: String,
      required: true,
      unique: true,
    },
    password: {
      type: String,
      required: true,
    },
    privateKey: {
      type: String,
    },
    role: {
      type: String,
      default: "admin",
      enum: ["admin"],
    },
  },
  { timestamps: true },
);
const Admin = new mongoose.model("Admin", adminSchema);
export default Admin;
