import mongoose from "mongoose";

const KitchenIngredientSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    canonicalName: { type: String, required: true, index: true },
    categoryId: { type: mongoose.Schema.Types.ObjectId, ref: "Category", required: true },
    active: { type: Boolean, default: true }
  },
  { timestamps: true }
);

export const KitchenIngredient = mongoose.model(
  "KitchenIngredient",
  KitchenIngredientSchema,
  "kitchenIngredients"
);
