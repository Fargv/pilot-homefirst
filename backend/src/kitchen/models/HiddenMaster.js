import mongoose from "mongoose";

const HiddenMasterSchema = new mongoose.Schema(
  {
    householdId: { type: mongoose.Schema.Types.ObjectId, ref: "Household", required: true, index: true },
    type: { type: String, enum: ["ingredient", "category", "side"], required: true },
    masterId: { type: mongoose.Schema.Types.ObjectId, required: true }
  },
  { timestamps: true }
);

HiddenMasterSchema.index({ householdId: 1, type: 1, masterId: 1 }, { unique: true });

export const HiddenMaster = mongoose.model("HiddenMaster", HiddenMasterSchema, "hiddenMasters");
