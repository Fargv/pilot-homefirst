import mongoose from "mongoose";

const CategorySchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    slug: { type: String, required: true, index: true },
    colorBg: { type: String, required: true },
    colorText: { type: String, required: true },
    order: { type: Number, default: 0 },
    active: { type: Boolean, default: true }
  },
  { timestamps: true }
);

export const Category = mongoose.model("Category", CategorySchema);
