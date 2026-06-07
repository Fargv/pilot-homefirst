import mongoose from "mongoose";

const HouseholdBasicSchema = new mongoose.Schema(
  {
    householdId: { type: mongoose.Schema.Types.ObjectId, ref: "Household", required: true, index: true },
    // Required link to the real ingredient in the database
    ingredientId: { type: mongoose.Schema.Types.ObjectId, ref: "KitchenIngredient", default: null, index: true },
    // Denormalized cache from the ingredient (updated on create; name follows the ingredient)
    name: { type: String, required: true, trim: true, maxlength: 120 },
    canonicalName: { type: String, required: true },
    categoryId: { type: mongoose.Schema.Types.ObjectId, ref: "Category", default: null },
    // User-settable display preferences
    emoji: { type: String, default: "" },
    active: { type: Boolean, default: true },
    order: { type: Number, default: 0 }
  },
  { timestamps: true }
);

HouseholdBasicSchema.index({ householdId: 1, active: 1, order: 1 });
// Prevent duplicate basics for the same ingredient in the same household
HouseholdBasicSchema.index({ householdId: 1, ingredientId: 1 }, { unique: true, sparse: true });

export const HouseholdBasic = mongoose.model("HouseholdBasic", HouseholdBasicSchema);
