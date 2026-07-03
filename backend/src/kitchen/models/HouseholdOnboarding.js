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

// Guided interactive tour (spotlight walkthrough) — separate from the challenge
// list. `rewardedSteps` persists across resends so bites can never be farmed by
// replaying the tour: each step key is rewarded at most once per household.
const GuidedTourSchema = new mongoose.Schema(
  {
    status: {
      type: String,
      enum: ["none", "pending", "active", "completed", "skipped"],
      default: "none"
    },
    version: { type: Number, default: 1 },
    currentStepIndex: { type: Number, default: 0 },
    rewardedSteps: { type: [String], default: [] },
    totalTourBites: { type: Number, default: 0 },
    lastSentAt: { type: Date, default: null },
    startedAt: { type: Date, default: null },
    completedAt: { type: Date, default: null },
    skippedAt: { type: Date, default: null },
    // Admin resend can flag test mode: tour runs but never grants bites.
    testMode: { type: Boolean, default: false },
    // ── Stall/debug telemetry ──
    currentStepId: { type: String, default: "" },
    stepStartedAt: { type: Date, default: null },
    completedStepIds: { type: [String], default: [] },
    skippedStepIds: { type: [String], default: [] },
    // Step the user was on when they skipped/abandoned — where users stall.
    stalledStepId: { type: String, default: "" },
    // Last "target/recipe not found" report (onboarding data issues).
    lastMissingTarget: { type: String, default: "" }
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
    // counters for multi-trigger challenges
    mealsPlanCount: { type: Number, default: 0 },
    purchasesMarkedCount: { type: Number, default: 0 },
    ingredientsCreatedCount: { type: Number, default: 0 },
    // explore_app multi-screen tracking
    screensVisited: { type: [String], default: [] },
    totalBitesEarned: { type: Number, default: 0 },
    welcomeBitesGranted: { type: Boolean, default: false },
    startedAt: { type: Date, default: null },
    completedAt: { type: Date, default: null },
    resetHistory: { type: [ResetHistorySchema], default: [] },
    // Legacy docs won't have this path; treat missing as { status: "none" }.
    guidedTour: { type: GuidedTourSchema, default: null }
  },
  { timestamps: true }
);

HouseholdOnboardingSchema.index({ householdId: 1 }, { unique: true });

export const HouseholdOnboarding = mongoose.model("HouseholdOnboarding", HouseholdOnboardingSchema);
