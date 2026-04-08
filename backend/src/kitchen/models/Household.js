import mongoose from "mongoose";

const HouseholdSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    ownerUserId: { type: mongoose.Schema.Types.ObjectId, ref: "KitchenUser", required: true },
    inviteCode: { type: String, trim: true, minlength: 6, maxlength: 6, default: null },
    dinnersEnabled: { type: Boolean, default: false },
    avoidRepeatsEnabled: { type: Boolean, default: false },
    avoidRepeatsWeeks: { type: Number, min: 1, max: 12, default: 1 },
    monthlyBudget: { type: Number, min: 0, default: null },
    cycleStartDay: { type: Number, min: 1, max: 28, default: 1 },
    subscriptionPlan: {
      type: String,
      enum: ["free", "basic", "pro", "premium"],
      default: "free"
    },
    subscriptionStatus: {
      type: String,
      enum: ["inactive", "trial", "active", "pending"],
      default: "inactive"
    },
    subscriptionRequestedPlan: {
      type: String,
      enum: ["basic", "pro", "premium"],
      default: null
    },
    trialEndsAt: { type: Date, default: null },
    subscriptionEndsAt: { type: Date, default: null },
    isPro: { type: Boolean, default: false },
    assignedByAdmin: { type: Boolean, default: false }
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
