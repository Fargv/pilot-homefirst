import mongoose from "mongoose";

const KitchenDishCategorySchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    code: { type: String, trim: true, lowercase: true },
    slug: { type: String, trim: true },
    colorBg: { type: String, default: "#E8F1FF" },
    colorText: { type: String, default: "#1D4ED8" },
    active: { type: Boolean, default: true }
  },
  {
    collection: "kitchendishcategories",
    timestamps: true
  }
);

KitchenDishCategorySchema.index({ name: 1 });
KitchenDishCategorySchema.index({ code: 1 });
KitchenDishCategorySchema.index({ active: 1 });

export const KitchenDishCategory = mongoose.model("KitchenDishCategory", KitchenDishCategorySchema);
