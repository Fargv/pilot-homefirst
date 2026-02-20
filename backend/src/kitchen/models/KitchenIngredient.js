import mongoose from "mongoose";

const KitchenIngredientSchema = new mongoose.Schema(
  {
    scope: {
      type: String,
      enum: ["master", "household", "override"],
      default: "household",
      index: true
    },
    householdId: { type: mongoose.Schema.Types.ObjectId, ref: "Household", index: true },
    masterId: { type: mongoose.Schema.Types.ObjectId, ref: "KitchenIngredient", index: true },
    name: { type: String, required: true, trim: true },
    canonicalName: { type: String, required: true, index: true },
    categoryId: { type: mongoose.Schema.Types.ObjectId, ref: "Category", required: true },
    active: { type: Boolean, default: true },
    isArchived: { type: Boolean, default: false }
  },
  { timestamps: true }
);

KitchenIngredientSchema.index({ householdId: 1, scope: 1 });
KitchenIngredientSchema.index(
  { householdId: 1, masterId: 1, scope: 1 },
  { unique: true, partialFilterExpression: { scope: "override" } }
);

export const KitchenIngredient = mongoose.model(
  "KitchenIngredient",
  KitchenIngredientSchema,
  "kitchenIngredients"
);
