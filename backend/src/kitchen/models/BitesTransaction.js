import mongoose from "mongoose";

const BitesTransactionSchema = new mongoose.Schema(
  {
    householdId: { type: mongoose.Schema.Types.ObjectId, ref: "Household", required: true, index: true },
    type: {
      type: String,
      // challenge_reward: automatic reward for completing a weekly challenge
      // onboarding_reward: automatic reward for completing an onboarding challenge
      // admin_grant: one-time system grant (welcome bites) or explicit admin top-up
      // admin_remove: admin-initiated deduction
      enum: ["monthly_grant", "purchase", "admin_grant", "admin_remove", "pack_unlock", "refund", "adjustment", "challenge_reward", "onboarding_reward"],
      required: true
    },
    amount: { type: Number, required: true },
    balanceAfterFree: { type: Number, required: true },
    balanceAfterPurchased: { type: Number, required: true },
    reason: { type: String, default: "" },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "KitchenUser", default: null },
    metadata: { type: mongoose.Schema.Types.Mixed, default: null }
  },
  { timestamps: true }
);

BitesTransactionSchema.index({ householdId: 1, createdAt: -1 });

export const BitesTransaction = mongoose.model("BitesTransaction", BitesTransactionSchema);
