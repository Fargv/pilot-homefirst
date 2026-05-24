import mongoose from "mongoose";

const HouseholdBasicSchema = new mongoose.Schema(
  {
    householdId: { type: mongoose.Schema.Types.ObjectId, ref: "Household", required: true, index: true },
    name: { type: String, required: true, trim: true, maxlength: 120 },
    canonicalName: { type: String, required: true },
    categoryId: { type: mongoose.Schema.Types.ObjectId, ref: "Category", default: null },
    emoji: { type: String, default: "" },
    active: { type: Boolean, default: true },
    order: { type: Number, default: 0 }
  },
  { timestamps: true }
);

HouseholdBasicSchema.index({ householdId: 1, active: 1, order: 1 });

export const HouseholdBasic = mongoose.model("HouseholdBasic", HouseholdBasicSchema);
