import mongoose from "mongoose";

const PackEntitlementSchema = new mongoose.Schema(
  {
    householdId: { type: String, required: true, index: true },
    userId: { type: String, required: true, index: true },
    packId: { type: mongoose.Schema.Types.ObjectId, ref: "CatalogPack", required: true },
    purchaseAttemptId: { type: mongoose.Schema.Types.ObjectId, ref: "PurchaseAttempt", default: null },
    stripeCheckoutSessionId: { type: String, default: "", trim: true },
    stripePaymentIntentId: { type: String, default: "", trim: true },
    stripePriceId: { type: String, default: "", trim: true },
    amountTotal: { type: Number, default: null },
    currency: { type: String, default: "eur", trim: true, lowercase: true },
    status: {
      type: String,
      enum: ["active", "refunded", "revoked"],
      default: "active",
      index: true
    },
    mode: {
      type: String,
      enum: ["test", "live"],
      required: true
    }
  },
  { timestamps: true }
);

// One active entitlement per household+pack+mode (test and live tracked separately)
PackEntitlementSchema.index({ householdId: 1, packId: 1, mode: 1 }, { unique: true });

export const PackEntitlement = mongoose.model("PackEntitlement", PackEntitlementSchema);
