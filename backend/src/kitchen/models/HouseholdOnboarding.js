import mongoose from "mongoose";

const CompletedChallengeSchema = new mongoose.Schema(
  {
    challengeId: { type: mongoose.Schema.Types.ObjectId, ref: "OnboardingChallenge" },
    challengeKey: { type: String },
    completedAt: { type: Date, default: Date.now },
    rewardBites: { type: Number, default: 0 }
  },
  { _id: false }
);

const ResetHistorySchema = new mongoose.Schema(
  {
    resetAt: { type: Date, default: Date.now },
    resetBy: { type: mongoose.Schema.Types.ObjectId, ref: "KitchenUser", default: null },
    reason: { type: String, default: "" }
  },
  { _id: false }
);

const HouseholdOnboardingSchema = new mongoose.Schema(
  {
    householdId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Household",
      required: true,
      unique: true
    },
    status: {
      type: String,
      enum: ["not_started", "active", "completed", "reset", "disabled"],
      default: "not_started"
    },
    completedChallenges: { type: [CompletedChallengeSchema], default: [] },
    mealsPlanCount: { type: Number, default: 0 },
    purchasesMarkedCount: { type: Number, default: 0 },
    totalBitesEarned: { type: Number, default: 0 },
    welcomeBitesGranted: { type: Boolean, default: false },
    startedAt: { type: Date, default: null },
    completedAt: { type: Date, default: null },
    resetHistory: { type: [ResetHistorySchema], default: [] }
  },
  { timestamps: true }
);

HouseholdOnboardingSchema.index({ householdId: 1 }, { unique: true });

export const HouseholdOnboarding = mongoose.model("HouseholdOnboarding", HouseholdOnboardingSchema);
