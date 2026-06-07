import mongoose from "mongoose";

const { Schema } = mongoose;

const purchaseAttemptSchema = new Schema(
  {
    userId: { type: String, required: true, index: true },
    householdId: { type: String, required: true, index: true },
    email: { type: String, default: "" },
    type: {
      type: String,
      enum: ["pack", "subscription", "bites", "unknown"],
      required: true
    },
    targetId: { type: String, default: "" },
    targetName: { type: String, default: "" },
    planKey: {
      type: String,
      enum: ["basic", "pro", "premium", null],
      default: null
    },
    stripeCheckoutSessionId: { type: String, default: "", index: true },
    stripeCustomerId: { type: String, default: "" },
    stripePriceId: { type: String, default: "" },
    stripeSubscriptionId: { type: String, default: "" },
    amountTotal: { type: Number, default: null },
    currency: { type: String, default: "" },
    status: {
      type: String,
      enum: ["created", "completed", "cancelled", "expired", "failed"],
      default: "created",
      index: true
    },
    mode: {
      type: String,
      enum: ["test", "live"],
      default: "test"
    },
    metadata: { type: Schema.Types.Mixed, default: {} }
  },
  { timestamps: true }
);

export const PurchaseAttempt = mongoose.model("PurchaseAttempt", purchaseAttemptSchema);
