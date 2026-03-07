import mongoose from "mongoose";

const KitchenDishCategorySchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    slug: { type: String, trim: true },
    active: { type: Boolean, default: true }
  },
  {
    collection: "kitchendishcategories",
    timestamps: true
  }
);

KitchenDishCategorySchema.index({ name: 1 });
KitchenDishCategorySchema.index({ active: 1 });

export const KitchenDishCategory = mongoose.model("KitchenDishCategory", KitchenDishCategorySchema);
