import mongoose from "mongoose";

const PlanEntrySchema = new mongoose.Schema(
  {
    displayPrice: { type: String, default: "" },
    isPaid: { type: Boolean, default: false },
    paymentMode: { type: String, default: "none", enum: ["none", "stripe"] },
    stripePriceId: { type: String, default: "" }
  },
  { _id: false }
);

const PlansConfigSchema = new mongoose.Schema(
  {
    key: { type: String, default: "plansConfig", unique: true },
    basic: {
      type: PlanEntrySchema,
      default: () => ({ displayPrice: "Gratis", isPaid: false, paymentMode: "none", stripePriceId: "" })
    },
    pro: {
      type: PlanEntrySchema,
      default: () => ({ displayPrice: "€4.99/mes", isPaid: true, paymentMode: "stripe", stripePriceId: "" })
    },
    premium: {
      type: PlanEntrySchema,
      default: () => ({ displayPrice: "€8.99/mes", isPaid: true, paymentMode: "stripe", stripePriceId: "" })
    },
    updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: "KitchenUser", default: null }
  },
  { timestamps: true }
);

export const PlansConfig = mongoose.model("PlansConfig", PlansConfigSchema);

export async function getPlansConfig() {
  let cfg = await PlansConfig.findOne({ key: "plansConfig" });
  if (!cfg) {
    cfg = await PlansConfig.create({ key: "plansConfig" });
  }
  return cfg;
}
