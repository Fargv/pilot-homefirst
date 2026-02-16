import mongoose from "mongoose";

const HouseholdSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    ownerUserId: { type: mongoose.Schema.Types.ObjectId, ref: "KitchenUser", required: true }
  },
  { timestamps: true }
);

export const Household = mongoose.model("Household", HouseholdSchema);
