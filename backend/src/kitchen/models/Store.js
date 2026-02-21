import mongoose from "mongoose";

const StoreSchema = new mongoose.Schema(
  {
    householdId: { type: mongoose.Schema.Types.ObjectId, ref: "Household", index: true, required: true },
    name: { type: String, required: true, trim: true },
    canonicalName: { type: String, required: true, trim: true, index: true },
    active: { type: Boolean, default: true }
  },
  { timestamps: true }
);

StoreSchema.index({ householdId: 1, canonicalName: 1 }, { unique: true });

export const Store = mongoose.model("Store", StoreSchema, "stores");
