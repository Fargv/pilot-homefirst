import mongoose from "mongoose";

const HouseholdSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    ownerUserId: { type: mongoose.Schema.Types.ObjectId, ref: "KitchenUser", required: true },
    inviteCode: { type: String, trim: true, minlength: 6, maxlength: 6, default: null },
    dinnersEnabled: { type: Boolean, default: false },
    avoidRepeatsEnabled: { type: Boolean, default: false },
    avoidRepeatsWeeks: { type: Number, min: 1, max: 12, default: 1 }
  },
  { timestamps: true }
);

HouseholdSchema.index(
  { inviteCode: 1 },
  {
    unique: true,
    partialFilterExpression: { inviteCode: { $type: "string" } }
  }
);

export const Household = mongoose.model("Household", HouseholdSchema);
