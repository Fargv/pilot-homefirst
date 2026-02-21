import mongoose from "mongoose";

const StoreSchema = new mongoose.Schema(
  {
    scope: { type: String, enum: ["master", "household"], default: "household", index: true },
    householdId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Household",
      index: true,
      default: null,
      required() {
        return this.scope === "household";
      }
    },
    name: { type: String, required: true, trim: true },
    canonicalName: { type: String, required: true, trim: true, index: true },
    order: { type: Number, default: null },
    active: { type: Boolean, default: true }
  },
  { timestamps: true }
);

StoreSchema.index({ scope: 1, householdId: 1, canonicalName: 1 }, { unique: true });

export const Store = mongoose.model("Store", StoreSchema, "stores");
