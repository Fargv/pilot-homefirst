import mongoose from "mongoose";

const CategorySchema = new mongoose.Schema(
  {
    scope: {
      type: String,
      enum: ["master", "household", "override"],
      default: "household",
      index: true
    },
    householdId: { type: mongoose.Schema.Types.ObjectId, ref: "Household", index: true },
    masterId: { type: mongoose.Schema.Types.ObjectId, ref: "Category", index: true },
    name: { type: String, required: true, trim: true },
    slug: { type: String, required: true, index: true },
    colorBg: { type: String, required: true },
    colorText: { type: String, required: true },
    order: { type: Number, default: 0 },
    active: { type: Boolean, default: true },
    isArchived: { type: Boolean, default: false }
  },
  { timestamps: true }
);

CategorySchema.index({ householdId: 1, scope: 1 });
CategorySchema.index(
  { householdId: 1, masterId: 1, scope: 1 },
  { unique: true, partialFilterExpression: { scope: "override" } }
);

export const Category = mongoose.model("Category", CategorySchema);
