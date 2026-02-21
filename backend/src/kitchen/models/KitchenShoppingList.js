import mongoose from "mongoose";

const ShoppingItemSchema = new mongoose.Schema(
  {
    ingredientId: { type: mongoose.Schema.Types.ObjectId, ref: "KitchenIngredient", default: null },
    categoryId: { type: mongoose.Schema.Types.ObjectId, ref: "Category", default: null },
    displayName: { type: String, required: true, trim: true },
    canonicalName: { type: String, required: true, index: true },
    quantity: { type: Number, default: null },
    unit: { type: String, default: null },
    occurrences: { type: Number, default: 1 },
    fromDishes: { type: [mongoose.Schema.Types.ObjectId], ref: "KitchenDish", default: [] },
    status: { type: String, enum: ["pending", "purchased"], default: "pending" },
    purchasedBy: { type: mongoose.Schema.Types.ObjectId, ref: "KitchenUser", default: null },
    purchasedAt: { type: Date, default: null },
    tripId: { type: mongoose.Schema.Types.ObjectId, ref: "ShoppingTrip", default: null }
  },
  { _id: false }
);

const KitchenShoppingListSchema = new mongoose.Schema(
  {
    weekStart: { type: Date, required: true },
    householdId: { type: mongoose.Schema.Types.ObjectId, ref: "Household", index: true },
    items: { type: [ShoppingItemSchema], default: [] }
  },
  { timestamps: true }
);

KitchenShoppingListSchema.index(
  { householdId: 1, weekStart: 1 },
  { unique: true, partialFilterExpression: { householdId: { $exists: true } } }
);

export const KitchenShoppingList = mongoose.model("KitchenShoppingList", KitchenShoppingListSchema);
