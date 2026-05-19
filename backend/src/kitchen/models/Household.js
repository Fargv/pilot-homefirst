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
