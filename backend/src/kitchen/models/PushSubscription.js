import mongoose from "mongoose";

const PushSubscriptionSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: "KitchenUser", required: true, index: true },
    householdId: { type: mongoose.Schema.Types.ObjectId, ref: "Household", default: null, index: true },
    endpoint: { type: String, required: true, trim: true },
    keys: {
      p256dh: { type: String, default: "" },
      auth: { type: String, default: "" }
    },
    subscription: { type: mongoose.Schema.Types.Mixed, required: true },
    userAgent: { type: String, default: "" }
  },
  { timestamps: true }
);

PushSubscriptionSchema.index({ endpoint: 1 }, { unique: true });

export const KitchenPushSubscription = mongoose.model("KitchenPushSubscription", PushSubscriptionSchema);
