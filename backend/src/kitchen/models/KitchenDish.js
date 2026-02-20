import mongoose from "mongoose";

const IngredientSchema = new mongoose.Schema(
  {
    ingredientId: { type: mongoose.Schema.Types.ObjectId, ref: "KitchenIngredient" },
    displayName: { type: String, required: true, trim: true },
    canonicalName: { type: String, required: true, index: true }
  },
  { _id: false }
);

const KitchenDishSchema = new mongoose.Schema(
  {
    scope: {
      type: String,
      enum: ["master", "household", "override"],
      default: "household",
      index: true
    },
    householdId: { type: mongoose.Schema.Types.ObjectId, ref: "Household", index: true },
    masterId: { type: mongoose.Schema.Types.ObjectId, ref: "KitchenDish", index: true },
    name: { type: String, required: true, trim: true },
    ingredients: { type: [IngredientSchema], default: [] },
    sidedish: { type: Boolean, default: false },
    isArchived: { type: Boolean, default: false },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "KitchenUser" }
  },
  { timestamps: true }
);

KitchenDishSchema.index({ householdId: 1, scope: 1 });
KitchenDishSchema.index(
  { householdId: 1, masterId: 1, scope: 1 },
  { unique: true, partialFilterExpression: { scope: "override" } }
);

export const KitchenDish = mongoose.model("KitchenDish", KitchenDishSchema);
