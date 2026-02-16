import mongoose from "mongoose";

const KitchenSwapSchema = new mongoose.Schema(
  {
    weekStart: { type: Date, required: true },
    fromUserId: { type: mongoose.Schema.Types.ObjectId, ref: "KitchenUser", required: true },
    toUserId: { type: mongoose.Schema.Types.ObjectId, ref: "KitchenUser", required: true },
    fromDate: { type: Date, required: true },
    toDate: { type: Date, required: true },
    status: { type: String, enum: ["pending", "accepted", "rejected"], default: "pending" },
    resolvedAt: { type: Date },
    householdId: { type: mongoose.Schema.Types.ObjectId, ref: "Household", index: true }
  },
  { timestamps: true }
);

export const KitchenSwap = mongoose.model("KitchenSwap", KitchenSwapSchema);
