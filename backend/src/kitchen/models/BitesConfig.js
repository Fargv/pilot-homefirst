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
    stripePriceId: { type: String, default: "" }
  },
  { _id: true }
);

const PlanGrantSchema = new mongoose.Schema(
  {
    basic: { type: Number, default: 1 },
    pro: { type: Number, default: 3 },
    premium: { type: Number, default: 10 }
  },
  { _id: false }
);

const BitesConfigSchema = new mongoose.Schema(
  {
    key: { type: String, default: "bitesEconomy", unique: true },
    monthlyGrantByPlan: { type: PlanGrantSchema, default: () => ({ basic: 1, pro: 3, premium: 10 }) },
    maxFreeCarryOverByPlan: { type: PlanGrantSchema, default: () => ({ basic: 5, pro: 10, premium: 50 }) },
    baseBitePrice: { type: Number, default: 1.99, min: 0.01 },
    bundles: { type: [BitesBundleSchema], default: [] },
    updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: "KitchenUser", default: null }
  },
  { timestamps: true }
);

export const BitesConfig = mongoose.model("BitesConfig", BitesConfigSchema);
