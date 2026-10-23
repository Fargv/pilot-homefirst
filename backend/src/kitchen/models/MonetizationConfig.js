import mongoose from "mongoose";

// Global, persistent monetization switches. Keep this separate from plans and
// pack entitlements: disabling subscriptions must never grant catalog content.
const MonetizationConfig = mongoose.model(
  "MonetizationConfig",
  new mongoose.Schema(
    {
      key: { type: String, required: true, unique: true, default: "default" },
      // Conservative default: existing subscription behavior remains enabled.
      subscriptionsEnabled: { type: Boolean, default: true },
      updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: "KitchenUser", default: null }
    },
    { timestamps: true }
  )
);

export { MonetizationConfig };
