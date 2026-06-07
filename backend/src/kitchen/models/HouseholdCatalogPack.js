import mongoose from "mongoose";

const HouseholdCatalogPackSchema = new mongoose.Schema(
  {
    householdId: { type: mongoose.Schema.Types.ObjectId, ref: "Household", required: true, index: true },
    packId: { type: mongoose.Schema.Types.ObjectId, ref: "CatalogPack", required: true, index: true },
    acquiredVia: {
      type: String,
      enum: ["subscription", "purchase", "admin_grant", "free"],
      required: true
    },
    acquiredAt: { type: Date, default: Date.now },
    installedAt: { type: Date, default: null },
    installedBy: { type: mongoose.Schema.Types.ObjectId, ref: "KitchenUser", default: null },
    status: {
      type: String,
      enum: ["owned", "installed"],
      default: "owned"
    },
    claimMonth: { type: String, default: null },
    paymentStatus: {
      type: String,
      enum: ["not_required", "pending", "paid", "manual"],
      default: "not_required"
    },
    pricePaid: { type: Number, default: null }
  },
  { timestamps: true }
);

HouseholdCatalogPackSchema.index({ householdId: 1, packId: 1 }, { unique: true });

export const HouseholdCatalogPack = mongoose.model("HouseholdCatalogPack", HouseholdCatalogPackSchema);
