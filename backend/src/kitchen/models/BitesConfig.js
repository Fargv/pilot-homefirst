import mongoose from "mongoose";

const BitesBundleSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    bitesAmount: { type: Number, required: true, min: 1 },
    price: { type: Number, required: true, min: 0 },
    discountPercent: { type: Number, default: 0, min: 0, max: 95 },
    badge: { type: String, default: "" },
    highlighted: { type: Boolean, default: false },
    active: { type: Boolean, default: true },
    sortOrder: { type: Number, default: 0 },
    isPaid: { type: Boolean, default: false },
    paymentMode: { type: String, enum: ["none", "stripe"], default: "none" },
    currency: { type: String, default: "eur", lowercase: true, trim: true },
    stripePriceId: { type: String, default: "" }
  },
  { _id: true }
);

const PlanGrantSchema = new mongoose.Schema(
  {
    basic: { type: Number, default: 100 },
    pro: { type: Number, default: 300 },
    premium: { type: Number, default: 1000 }
  },
  { _id: false }
);

const BitesConfigSchema = new mongoose.Schema(
  {
    key: { type: String, default: "bitesEconomy", unique: true },
    // Economy: 100 Bites = 1.99 EUR; monthly grants and carry-over limits are in Bites
    monthlyGrantByPlan: { type: PlanGrantSchema, default: () => ({ basic: 100, pro: 300, premium: 1000 }) },
    maxFreeCarryOverByPlan: { type: PlanGrantSchema, default: () => ({ basic: 500, pro: 1000, premium: 5000 }) },
    // baseBitePrice = price for 100 Bites in EUR (not per-Bite price)
    baseBitePrice: { type: Number, default: 1.99, min: 0.01 },
    bundles: { type: [BitesBundleSchema], default: [] },
    updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: "KitchenUser", default: null }
  },
  { timestamps: true }
);

export const BitesConfig = mongoose.model("BitesConfig", BitesConfigSchema);
