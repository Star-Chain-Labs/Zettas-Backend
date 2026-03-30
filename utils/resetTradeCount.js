import UserModel from "../models/user.model.js";

export const resetTradeCount = async () => {
  try {
    await UserModel.updateMany(
      { additionalWallet: { $gt: 0 } },
      { $set: { todayTradeCount: 0 } },
    );
  } catch (error) {
    console.error("Error resetting trade count:", error);
  }
};
