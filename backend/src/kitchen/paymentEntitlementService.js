import mongoose from "mongoose";
import { config } from "../config.js";
import { Household } from "./models/Household.js";
import { CatalogPack } from "./models/CatalogPack.js";
import { PackEntitlement } from "./models/PackEntitlement.js";
import { HouseholdCatalogPack } from "./models/HouseholdCatalogPack.js";
import {
  applyAdminSubscriptionActivation,
  normalizeSubscriptionPlan
} from "./subscriptionService.js";

const ENTITLEMENT_PLANS = new Set(["pro", "premium"]);

/**
 * Safety gate for test-mode automatic entitlements.
 * Returns { allowed: true } or { allowed: false, reason: string }.
 */
function checkTestEntitlementAllowed(attempt) {
  if (!config.stripe.paymentsEnabled) {
    return { allowed: false, reason: "PAYMENTS_ENABLED is not true" };
  }
  if (config.stripe.mode !== "test") {
    return { allowed: false, reason: `STRIPE_MODE is "${config.stripe.mode}", must be "test"` };
  }
  if (!config.stripe.allowTestEntitlements) {
    return { allowed: false, reason: "ALLOW_TEST_PAYMENT_ENTITLEMENTS is not true" };
  }
  if (attempt.mode !== "test") {
    return { allowed: false, reason: `attempt.mode is "${attempt.mode}", must be "test"` };
  }
  if (attempt.status !== "completed") {
    return { allowed: false, reason: `attempt.status is "${attempt.status}", must be "completed"` };
  }
  if (attempt.type !== "subscription") {
    return { allowed: false, reason: `attempt.type is "${attempt.type}", only "subscription" triggers entitlements` };
  }
  const planKey = normalizeSubscriptionPlan(attempt.planKey);
  if (!ENTITLEMENT_PLANS.has(planKey)) {
    return { allowed: false, reason: `planKey "${attempt.planKey}" is not in entitlement plans (pro, premium)` };
  }
  if (!attempt.householdId || !mongoose.isValidObjectId(attempt.householdId)) {
    return { allowed: false, reason: `householdId "${attempt.householdId}" is missing or invalid` };
  }
  return { allowed: true, planKey };
}

/**
 * Applies a test-mode subscription plan upgrade to the household linked to the given
 * PurchaseAttempt. Idempotent: if the household is already on the target plan and active,
 * it logs and returns without changing data.
 *
 * All safety flags are verified before any mutation:
 *   - PAYMENTS_ENABLED === "true"
 *   - STRIPE_MODE === "test"
 *   - ALLOW_TEST_PAYMENT_ENTITLEMENTS === "true"
 *   - attempt.mode === "test"
 *   - attempt.status === "completed"
 *   - attempt.type === "subscription"
 *   - planKey is "pro" or "premium"
 *
 * Production / live mode: this function will always skip — the guard on STRIPE_MODE
 * ensures no accidental activation in a live environment.
 *
 * @param {object} attempt - A saved PurchaseAttempt document
 * @returns {Promise<{ applied: boolean, reason?: string, household?: object }>}
 */
export async function applyTestSubscriptionEntitlementFromAttempt(attempt) {
  const gate = checkTestEntitlementAllowed(attempt);

  if (!gate.allowed) {
    console.log("[entitlements] Test entitlement skipped", {
      attemptId: attempt._id?.toString(),
      reason: gate.reason,
      type: attempt.type,
      planKey: attempt.planKey,
      mode: attempt.mode,
      status: attempt.status
    });
    return { applied: false, reason: gate.reason };
  }

  const { planKey } = gate;
  const householdId = attempt.householdId;

  const household = await Household.findById(householdId);
  if (!household) {
    console.error("[entitlements] Household not found for test entitlement", {
      attemptId: attempt._id?.toString(),
      householdId
    });
    return { applied: false, reason: `Household ${householdId} not found` };
  }

  // Idempotency: already on the target plan and active — nothing to do
  if (household.subscriptionPlan === planKey && household.subscriptionStatus === "active") {
    console.log("[entitlements] Household already on target plan — skipping (idempotent)", {
      attemptId: attempt._id?.toString(),
      householdId,
      planKey,
      subscriptionStatus: household.subscriptionStatus
    });
    return { applied: false, reason: "already_active_on_plan" };
  }

  const previousPlan = household.subscriptionPlan;

  // Apply subscription using the same service used by admin activation
  applyAdminSubscriptionActivation(household, planKey);

  // Store Stripe test metadata alongside the subscription state
  household.stripeCustomerId = attempt.stripeCustomerId || household.stripeCustomerId || "";
  household.stripeSubscriptionId = attempt.stripeSubscriptionId || household.stripeSubscriptionId || "";
  household.paymentProvider = "stripe-test";
  household.paymentMode = "test";
  household.planUpdatedAt = new Date();
  household.planUpdatedByPaymentAttemptId = attempt._id.toString();

  await household.save();

  console.log("[entitlements] Test subscription entitlement applied", {
    attemptId: attempt._id?.toString(),
    householdId,
    planKey,
    previousPlan,
    subscriptionStatus: household.subscriptionStatus,
    isPro: household.isPro,
    subscriptionEndsAt: household.subscriptionEndsAt
  });

  return { applied: true, household };
}

/**
 * Applies a pack entitlement after a completed checkout (test or live).
 * Creates or updates a PackEntitlement record and upserts HouseholdCatalogPack to "purchase".
 * Increments CatalogPack.purchasedCount.
 * Idempotent: if a PackEntitlement with status "active" already exists, it logs and skips.
 *
 * Safety gates (test mode only):
 *   - PAYMENTS_ENABLED=true, STRIPE_MODE=test, ALLOW_TEST_PAYMENT_ENTITLEMENTS=true
 *   - attempt.mode=test
 * In live mode these gates are skipped (live entitlements always apply when attempt.mode=live).
 *
 * @param {object} attempt - A saved PurchaseAttempt document
 * @param {object} session - The Stripe checkout.session.completed event data object
 * @returns {Promise<{ applied: boolean, reason?: string, entitlement?: object }>}
 */
export async function applyPackEntitlementFromAttempt(attempt, session = {}) {
  if (!config.stripe.paymentsEnabled) {
    return { applied: false, reason: "PAYMENTS_ENABLED is not true" };
  }

  const isTestAttempt = attempt.mode === "test";

  if (isTestAttempt) {
    if (config.stripe.mode !== "test") {
      return { applied: false, reason: `STRIPE_MODE is "${config.stripe.mode}", must be "test" for test attempts` };
    }
    if (!config.stripe.allowTestEntitlements) {
      return { applied: false, reason: "ALLOW_TEST_PAYMENT_ENTITLEMENTS is not true" };
    }
  }

  if (attempt.status !== "completed") {
    return { applied: false, reason: `attempt.status is "${attempt.status}", must be "completed"` };
  }
  if (attempt.type !== "pack") {
    return { applied: false, reason: `attempt.type is "${attempt.type}", must be "pack"` };
  }
  if (!attempt.targetId || !mongoose.isValidObjectId(attempt.targetId)) {
    return { applied: false, reason: `targetId "${attempt.targetId}" is missing or invalid` };
  }
  if (!attempt.householdId || !mongoose.isValidObjectId(attempt.householdId)) {
    return { applied: false, reason: `householdId "${attempt.householdId}" is missing or invalid` };
  }

  const packId = attempt.targetId;

  // Idempotency: active entitlement for this household+pack+mode already exists
  const existing = await PackEntitlement.findOne({
    householdId: attempt.householdId,
    packId,
    mode: attempt.mode
  });
  if (existing && existing.status === "active") {
    console.log("[entitlements] Pack entitlement already active — skipping (idempotent)", {
      attemptId: attempt._id?.toString(),
      householdId: attempt.householdId,
      packId,
      mode: attempt.mode
    });
    return { applied: false, reason: "already_active" };
  }

  const pack = await CatalogPack.findById(packId);
  if (!pack) {
    return { applied: false, reason: `CatalogPack ${packId} not found` };
  }

  const stripePaymentIntentId =
    session.payment_intent
      ? (typeof session.payment_intent === "string" ? session.payment_intent : session.payment_intent?.id || "")
      : "";

  // Upsert PackEntitlement
  const entitlement = await PackEntitlement.findOneAndUpdate(
    { householdId: attempt.householdId, packId, mode: attempt.mode },
    {
      $set: {
        userId: attempt.userId,
        purchaseAttemptId: attempt._id,
        stripeCheckoutSessionId: attempt.stripeCheckoutSessionId || "",
        stripePaymentIntentId,
        stripePriceId: attempt.stripePriceId || "",
        amountTotal: attempt.amountTotal ?? null,
        currency: attempt.currency || "eur",
        status: "active"
      }
    },
    { upsert: true, new: true }
  );

  // Upsert HouseholdCatalogPack as purchased
  await HouseholdCatalogPack.findOneAndUpdate(
    { householdId: attempt.householdId, packId },
    {
      $set: {
        acquiredVia: "purchase",
        paymentStatus: "paid",
        pricePaid: attempt.amountTotal != null ? attempt.amountTotal / 100 : null,
        acquiredAt: new Date()
      },
      $setOnInsert: { status: "owned" }
    },
    { upsert: true }
  );

  // Increment purchasedCount on the catalog pack
  await CatalogPack.findByIdAndUpdate(packId, {
    $inc: { purchasedCount: 1 },
    $set: { lastPurchasedAt: new Date() }
  });

  console.log("[entitlements] Pack entitlement applied", {
    attemptId: attempt._id?.toString(),
    householdId: attempt.householdId,
    packId,
    packSlug: pack.slug,
    mode: attempt.mode,
    amountTotal: attempt.amountTotal
  });

  return { applied: true, entitlement };
}
