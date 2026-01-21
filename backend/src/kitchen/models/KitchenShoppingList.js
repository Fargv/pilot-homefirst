import mongoose from "mongoose";

const ShoppingItemSchema = new mongoose.Schema(
  {
    displayName: { type: String, required: true, trim: true },
    canonicalName: { type: String, required: true, index: true },
    status: { type: String, enum: ["need", "have", "bought"], default: "need" }
  },
  { _id: false }
);

const KitchenShoppingListSchema = new mongoose.Schema(
  {
    weekStart: { type: Date, required: true, unique: true },
    items: { type: [ShoppingItemSchema], default: [] }
  },
  { timestamps: true }
);

export const KitchenShoppingList = mongoose.model("KitchenShoppingList", KitchenShoppingListSchema);
