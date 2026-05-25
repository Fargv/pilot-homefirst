import mongoose from "mongoose";

const HouseholdSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    ownerUserId: { type: mongoose.Schema.Types.ObjectId, ref: "KitchenUser", required: true },
    inviteCode: { type: String, trim: true, minlength: 6, maxlength: 6, default: null },
    dinnersEnabled: { type: Boolean, default: false },
    dinnersIncludeInShopping: { type: Boolean, default: false },
    avoidRepeatsEnabled: { type: Boolean, default: false },
    avoidRepeatsWeeks: { type: Number, min: 1, max: 12, default: 1 },
    monthlyBudget: { type: Number, min: 0, default: null },
    cycleStartDay: { type: Number, min: 1, max: 28, default: 1 },
    subscriptionPlan: {
      type: String,
      enum: ["free", "basic", "pro", "premium"],
      default: "basic"
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
    pendingDowngradeAt: { type: Date, default: null },
    pendingDowngradeReason: { type: String, default: "" },
    isPro: { type: Boolean, default: false },
    assignedByAdmin: { type: Boolean, default: false },
    randomizationUseDietFilter: { type: Boolean, default: false },
    randomizationDefaultDietPackIds: { type: [mongoose.Schema.Types.ObjectId], default: [] },
    freeBitesBalance: { type: Number, default: 0, min: 0 },
    purchasedBitesBalance: { type: Number, default: 0, min: 0 },
    totalBitesSpent: { type: Number, default: 0, min: 0 },
    lastMonthlyBitesGrantAt: { type: Date, default: null },

    // Plan source: distinguishes how the current plan was granted.
    // "manual" = default / admin-assigned without a specific source
    // "paid" = active Stripe subscription
    // "admin_grant" = manually granted by admin
    // "beta_pro" = auto-granted by Beta Pro unlock logic
    planSource: {
      type: String,
      enum: ["manual", "paid", "admin_grant", "beta_pro"],
      default: "manual"
    },

    // Last time the user performed a meaningful in-app action (not pings/crons).
    lastMeaningfulActivityAt: { type: Date, default: null },

    // Date of the Monday of the first week where this household started weekly challenges.
    // Used to calculate per-household cycle week index (1-4) instead of a shared global date.
    weeklyChallengeCycleStartedAt: { type: Date, default: null },

    // Beta Pro grant tracking.
    betaPro: {
      active: { type: Boolean, default: false },
      unlockedAt: { type: Date, default: null },
      expiresAt: { type: Date, default: null },
      lastRenewedAt: { type: Date, default: null },
      expiredAt: { type: Date, default: null },
      expirationReason: { type: String, default: "" }
    },

    // Stripe payment metadata — populated by webhook when a checkout completes.
    // These are intentionally separate from core subscription fields so the
    // subscription logic doesn't depend on them.
    stripeCustomerId: { type: String, default: "" },
    stripeSubscriptionId: { type: String, default: "" },
    paymentProvider: { type: String, default: "" },
    paymentMode: { type: String, default: "" },
    planUpdatedAt: { type: Date, default: null },
    planUpdatedByPaymentAttemptId: { type: String, default: "" }
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

HouseholdSchema.index({ stripeCustomerId: 1 });

export const Household = mongoose.model("Household", HouseholdSchema);
