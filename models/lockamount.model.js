import mongoose from "mongoose";

const LockedAmountSchema = new mongoose.Schema({
    userId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
        required: true
    },
    amount: {
        type: Number,
        required: true
    },
    lockedAt: {
        type: Date,
        default: Date.now
    },
    isClaimed: {
        type: Boolean,
        default: false
    },
    status: {
        type: String,
        enum: ["locked", "released"],
        default: "locked"
    }

});

export const LockedAmountModel = mongoose.model("LockedAmount", LockedAmountSchema);
