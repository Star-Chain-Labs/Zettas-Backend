import mongoose from "mongoose";

const UnlockedAmountSchema = new mongoose.Schema({
    userId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
        required: true
    },
    amount: {
        type: Number,
        required: true
    },
    unlockedAt: {
        type: Date,
        default: Date.now
    },
    sourceLockedId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "LockedAmount",
        required: true
    }
});

const UnlockedAmountModel = mongoose.model("UnlockedAmount", UnlockedAmountSchema);
export default UnlockedAmountModel;
