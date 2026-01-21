import mongoose from "mongoose";

const IngredientSchema = new mongoose.Schema(
  {
    displayName: { type: String, required: true, trim: true },
    canonicalName: { type: String, required: true, index: true }
  },
  { _id: false }
);

const KitchenDishSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    ingredients: { type: [IngredientSchema], default: [] },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "KitchenUser" }
  },
  { timestamps: true }
);

export const KitchenDish = mongoose.model("KitchenDish", KitchenDishSchema);
