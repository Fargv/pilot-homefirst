import mongoose from "mongoose";
import { config } from "../config.js";
import { Household } from "./models/Household.js";
import { CatalogPack } from "./models/CatalogPack.js";
import { PackEntitlement } from "./models/PackEntitlement.js";
import { HouseholdCatalogPack } from "./models/HouseholdCatalogPack.js";
import { BitesConfig } from "./models/BitesConfig.js";
import { BitesTransaction } from "./models/BitesTransaction.js";
import { grantPurchasedBites } from "./bitesService.js";

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

export async function applyBitesBundleEntitlementFromAttempt(attempt, session = {}) {
  if (!config.stripe.paymentsEnabled) {
    return { applied: false, reason: "PAYMENTS_ENABLED is not true" };
  }

  if (attempt.mode === "test") {
    if (config.stripe.mode !== "test") {
      return { applied: false, reason: `STRIPE_MODE is "${config.stripe.mode}", must be "test" for test attempts` };
    }
    if (!config.stripe.allowTestEntitlements) {
      return { applied: false, reason: "ALLOW_TEST_PAYMENT_ENTITLEMENTS is not true" };
    }
  }

  if (attempt.status !== "completed") return { applied: false, reason: `attempt.status is "${attempt.status}", must be "completed"` };
  if (attempt.type !== "bites") return { applied: false, reason: `attempt.type is "${attempt.type}", must be "bites"` };
  if (!attempt.householdId || !mongoose.isValidObjectId(attempt.householdId)) {
    return { applied: false, reason: `householdId "${attempt.householdId}" is missing or invalid` };
  }
  if (!attempt.targetId || !mongoose.isValidObjectId(attempt.targetId)) {
    return { applied: false, reason: `targetId "${attempt.targetId}" is missing or invalid` };
  }

  const existingTransaction = await BitesTransaction.findOne({ "metadata.purchaseAttemptId": attempt._id.toString() });
  if (existingTransaction) {
    return { applied: false, reason: "already_granted" };
  }

  const bitesConfig = await BitesConfig.findOne({ key: "bitesEconomy" });
  const bundle = bitesConfig?.bundles?.id?.(attempt.targetId);
  if (!bundle || !bundle.active) {
    return { applied: false, reason: "bundle_not_found_or_inactive" };
  }

  const amount = Number(bundle.bitesAmount || 0);
  if (!Number.isFinite(amount) || amount < 1) {
    return { applied: false, reason: "bundle_amount_invalid" };
  }

  const stripePaymentIntentId =
    session.payment_intent
      ? (typeof session.payment_intent === "string" ? session.payment_intent : session.payment_intent?.id || "")
      : "";

  const result = await grantPurchasedBites(
    attempt.householdId,
    amount,
    `Compra de bundle ${bundle.name}`,
    {
      purchaseAttemptId: attempt._id.toString(),
      bundleId: attempt.targetId,
      bundleName: bundle.name,
      stripeCheckoutSessionId: attempt.stripeCheckoutSessionId || "",
      stripePaymentIntentId,
      stripePriceId: attempt.stripePriceId || "",
      amountTotal: attempt.amountTotal ?? null,
      currency: attempt.currency || bundle.currency || "eur",
      mode: attempt.mode
    }
  );

  console.log("[entitlements] Bites bundle purchase applied", {
    attemptId: attempt._id?.toString(),
    householdId: attempt.householdId,
    bundleId: attempt.targetId,
    bitesAmount: amount,
    mode: attempt.mode
  });

  return { applied: true, wallet: result.wallet };
}
