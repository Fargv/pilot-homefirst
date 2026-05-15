import express from "express";
import mongoose from "mongoose";
import Stripe from "stripe";
import { config } from "../config.js";
import { requireAuth, requireDiod } from "../kitchen/middleware.js";
import { PurchaseAttempt } from "../kitchen/models/PurchaseAttempt.js";
import { CatalogPack } from "../kitchen/models/CatalogPack.js";
import { PackEntitlement } from "../kitchen/models/PackEntitlement.js";
import { Household } from "../kitchen/models/Household.js";
import { BitesConfig } from "../kitchen/models/BitesConfig.js";
import { getPlansConfig } from "../kitchen/models/PlansConfig.js";
import { getEffectiveHouseholdId, handleHouseholdError } from "../kitchen/householdScope.js";
import {
  applyDevSubscriptionPlanToHousehold,
  applyPackEntitlementFromAttempt,
  applyBitesBundleEntitlementFromAttempt
} from "../kitchen/paymentEntitlementService.js";
import {
  applyAdminSubscriptionActivation,
  applyAdminSubscriptionDeactivation,
  buildHouseholdSubscriptionResponse,
  normalizeSubscriptionPlan,
  SUBSCRIPTION_PLANS
} from "../kitchen/subscriptionService.js";

const router = express.Router();

const VALID_TYPES = ["pack", "subscription", "bites"];
const STRIPE_API_VERSION = "2024-04-10";

function buildStripeClient() {
  if (!config.stripe.secretKey) return null;
  return new Stripe(config.stripe.secretKey, { apiVersion: STRIPE_API_VERSION });
}

function paymentsEnabledGuard(res) {
  if (!config.stripe.paymentsEnabled) {
    res.status(403).json({
      ok: false,
      code: "PAYMENTS_DISABLED",
      error: "Los pagos no están activados en este entorno."
    });
    return false;
  }
  return true;
}

function stripeClientGuard(res) {
  const stripe = buildStripeClient();
  if (!stripe) {
    console.error("[payments] Stripe not configured — STRIPE_SECRET_KEY missing");
    res.status(503).json({
      ok: false,
      code: "STRIPE_NOT_CONFIGURED",
      error: "El servicio de pago no está configurado. Contacta al administrador."
    });
    return null;
  }
  return stripe;
}

// ─── POST /api/payments/checkout-session ─────────────────────────────────────

router.post("/checkout-session", requireAuth, async (req, res) => {
  try {
    if (!paymentsEnabledGuard(res)) return;
    const stripe = stripeClientGuard(res);
    if (!stripe) return;

    const { type, targetId, targetName, stripePriceId: clientPriceId, planKey } = req.body || {};

    if (!type || !VALID_TYPES.includes(type)) {
      return res.status(400).json({
        ok: false,
        error: `Tipo de pago inválido. Valores permitidos: ${VALID_TYPES.join(", ")}.`
      });
    }

    const effectiveHouseholdId = getEffectiveHouseholdId(req.user);
    const userId = req.user.id;
    const email = req.kitchenUser?.email || "";
    const appEnv = process.env.APP_ENV || config.nodeEnv || "development";

    let resolvedPriceId = clientPriceId;
    let resolvedPlanKey = planKey || null;
    let resolvedTargetId = targetId || "";
    let resolvedTargetName = targetName || "";

    // ── Pack checkout: resolve price from the catalog pack ────────────────
    if (type === "pack") {
      if (!targetId || !mongoose.isValidObjectId(targetId)) {
        return res.status(400).json({ ok: false, error: "targetId debe ser un ObjectId válido para tipo 'pack'." });
      }

      const pack = await CatalogPack.findById(targetId).select(
        "isPaid stripePriceId paymentMode title status active"
      );
      if (!pack || !pack.active || pack.status !== "published") {
        return res.status(404).json({ ok: false, error: "Pack no encontrado." });
      }
      if (!pack.isPaid || pack.paymentMode !== "stripe" || !String(pack.stripePriceId || "").startsWith("price_")) {
        return res.status(400).json({
          ok: false,
          code: "PACK_NOT_FOR_SALE",
          error: "Este pack no está disponible para compra directa."
        });
      }

      // Check existing active entitlement (no duplicates)
      const existingEntitlement = await PackEntitlement.findOne({
        householdId: effectiveHouseholdId,
        packId: targetId,
        mode: config.stripe.mode,
        status: "active"
      });
      if (existingEntitlement) {
        return res.status(409).json({
          ok: false,
          code: "PACK_ALREADY_OWNED",
          error: "Ya tienes este pack activo."
        });
      }

      resolvedPriceId = pack.stripePriceId;
      resolvedTargetName = resolvedTargetName || pack.title;
    }

    if (type === "bites") {
      if (!targetId || !mongoose.isValidObjectId(targetId)) {
        return res.status(400).json({ ok: false, error: "targetId debe ser un ObjectId vÃ¡lido para tipo 'bites'." });
      }

      const bitesConfig = await BitesConfig.findOne({ key: "bitesEconomy" });
      const bundle = bitesConfig?.bundles?.id?.(targetId);
      if (!bundle || !bundle.active) {
        return res.status(404).json({ ok: false, error: "Bundle no encontrado." });
      }
      if (!bundle.isPaid || bundle.paymentMode !== "stripe" || !String(bundle.stripePriceId || "").startsWith("price_")) {
        return res.status(400).json({
          ok: false,
          code: "BUNDLE_NOT_FOR_SALE",
          error: "Este bundle no estÃ¡ disponible para compra directa."
        });
      }

      resolvedPriceId = bundle.stripePriceId;
      resolvedTargetId = targetId;
      resolvedTargetName = resolvedTargetName || bundle.name;
    }

    // ── Subscription checkout: resolve price ID from DB PlansConfig ──────
    if (type === "subscription" && resolvedPlanKey) {
      try {
        const plansConfig = await getPlansConfig();
        const planEntry = plansConfig[resolvedPlanKey];
        if (planEntry?.isPaid && planEntry?.paymentMode === "stripe" && String(planEntry?.stripePriceId || "").startsWith("price_")) {
          resolvedPriceId = planEntry.stripePriceId;
          console.log("[payments] Resolved subscription price ID from DB PlansConfig", {
            planKey: resolvedPlanKey,
            stripePriceId: resolvedPriceId
          });
        }
      } catch (err) {
        console.warn("[payments] Failed to load PlansConfig for price ID resolution", { error: err.message });
      }
    }

    // ── Subscription checkout: guard against existing active subscription ─
    if (type === "subscription") {
      if (!resolvedPriceId || typeof resolvedPriceId !== "string" || !resolvedPriceId.startsWith("price_")) {
        return res.status(400).json({
          ok: false,
          error: "stripePriceId es obligatorio y debe ser un Stripe price ID válido."
        });
      }

      // In DEV/test mode with entitlements enabled, skip the guard — demos need to re-checkout freely.
      const isDevTestMode = config.stripe.mode === "test" && config.stripe.allowTestEntitlements;

      if (!isDevTestMode) {
        const household = await Household.findById(effectiveHouseholdId).select(
          "stripeSubscriptionId subscriptionStatus"
        );
        if (household?.stripeSubscriptionId && household.subscriptionStatus === "active") {
          return res.status(409).json({
            ok: false,
            code: "SUBSCRIPTION_ACTIVE",
            redirectToPortal: config.stripe.portalEnabled,
            error: "Ya tienes una suscripción activa. Gestiona tu suscripción desde el portal de facturación."
          });
        }
      } else {
        console.log("[payments] DEV test mode — subscription active guard bypassed", {
          householdId: effectiveHouseholdId,
          planKey: resolvedPlanKey
        });
      }
    }

    if (!resolvedPriceId || typeof resolvedPriceId !== "string" || !resolvedPriceId.startsWith("price_")) {
      return res.status(400).json({
        ok: false,
        error: "stripePriceId es obligatorio y debe ser un Stripe price ID válido."
      });
    }

    const attempt = await PurchaseAttempt.create({
      userId,
      householdId: effectiveHouseholdId,
      email,
      type,
      targetId: resolvedTargetId,
      targetName: resolvedTargetName,
      planKey: resolvedPlanKey,
      stripePriceId: resolvedPriceId,
      status: "created",
      mode: config.stripe.mode,
      metadata: { appEnv }
    });

    const checkoutMode = type === "subscription" ? "subscription" : "payment";
    const frontendUrl = String(config.frontendUrl || "").replace(/\/$/, "");

    const session = await stripe.checkout.sessions.create({
      mode: checkoutMode,
      line_items: [{ price: resolvedPriceId, quantity: 1 }],
      success_url: `${frontendUrl}/payments/success?session_id={CHECKOUT_SESSION_ID}&type=${type}`,
      cancel_url: `${frontendUrl}/payments/cancelled`,
      customer_email: email || undefined,
      metadata: {
        userId,
        householdId: effectiveHouseholdId,
        type,
        targetId: resolvedTargetId,
        planKey: resolvedPlanKey || "",
        purchaseAttemptId: attempt._id.toString(),
        appEnv
      }
    });

    attempt.stripeCheckoutSessionId = session.id;
    await attempt.save();

    console.log("[payments] Checkout session created", {
      attemptId: attempt._id.toString(),
      sessionId: session.id,
      type,
      planKey: resolvedPlanKey || null,
      userId,
      householdId: effectiveHouseholdId,
      stripeMode: config.stripe.mode,
      appEnv
    });

    return res.status(201).json({ ok: true, url: session.url, sessionId: session.id });
  } catch (error) {
    const handled = handleHouseholdError(res, error);
    if (handled) return handled;
    console.error("[payments] checkout-session error", {
      userId: req.user?.id || null,
      body: req.body,
      error: error?.message,
      stack: error?.stack
    });
    return res.status(500).json({ ok: false, error: "No se pudo crear la sesión de pago." });
  }
});

// ─── POST /api/payments/customer-portal ──────────────────────────────────────

router.post("/customer-portal", requireAuth, async (req, res) => {
  try {
    if (!paymentsEnabledGuard(res)) return;
    if (!config.stripe.portalEnabled) {
      return res.status(403).json({
        ok: false,
        code: "PORTAL_DISABLED",
        error: "El portal de facturación no está activado en este entorno."
      });
    }
    const stripe = stripeClientGuard(res);
    if (!stripe) return;

    const effectiveHouseholdId = getEffectiveHouseholdId(req.user);
    const household = await Household.findById(effectiveHouseholdId).select("stripeCustomerId");
    if (!household?.stripeCustomerId) {
      return res.status(404).json({
        ok: false,
        code: "NO_STRIPE_CUSTOMER",
        error: "No se encontró una cuenta de facturación asociada. Realiza una compra primero."
      });
    }

    const frontendUrl = String(config.frontendUrl || "").replace(/\/$/, "");
    const portalSession = await stripe.billingPortal.sessions.create({
      customer: household.stripeCustomerId,
      return_url: `${frontendUrl}/kitchen/configuracion`
    });

    console.log("[payments] Customer portal session created", {
      householdId: effectiveHouseholdId,
      customerId: household.stripeCustomerId
    });

    return res.json({ ok: true, url: portalSession.url });
  } catch (error) {
    const handled = handleHouseholdError(res, error);
    if (handled) return handled;
    console.error("[payments] customer-portal error", {
      userId: req.user?.id || null,
      error: error?.message
    });
    return res.status(500).json({ ok: false, error: "No se pudo abrir el portal de facturación." });
  }
});

// ─── GET /api/payments/my-attempts ───────────────────────────────────────────

router.get("/my-attempts", requireAuth, async (req, res) => {
  try {
    const userId = req.user.id;
    const attempts = await PurchaseAttempt.find({ userId })
      .sort({ createdAt: -1 })
      .limit(50)
      .lean();

    return res.json({ ok: true, attempts });
  } catch (error) {
    console.error("[payments] my-attempts error", {
      userId: req.user?.id || null,
      error: error?.message
    });
    return res.status(500).json({ ok: false, error: "No se pudieron cargar los intentos de pago." });
  }
});

// ─── POST /api/payments/dev/reset-plan ───────────────────────────────────────
// DEV-only. Protected by non-production env check + DIOD admin role.

function requireDevEnv(req, res, next) {
  const appEnv = process.env.APP_ENV || config.nodeEnv || "";
  const isProduction = appEnv === "production" || config.nodeEnv === "production";
  if (isProduction) {
    return res.status(403).json({
      ok: false,
      code: "DEV_ONLY",
      error: "Este endpoint solo está disponible en entornos no-productivos."
    });
  }
  return next();
}

router.post("/dev/reset-plan", requireDevEnv, requireAuth, requireDiod, async (req, res) => {
  try {
    const { householdId, planKey } = req.body || {};

    if (!householdId || !mongoose.isValidObjectId(householdId)) {
      return res.status(400).json({ ok: false, error: "householdId inválido o ausente." });
    }

    const normalizedPlan = normalizeSubscriptionPlan(planKey);
    if (!SUBSCRIPTION_PLANS.includes(normalizedPlan)) {
      return res.status(400).json({
        ok: false,
        error: `planKey inválido. Valores permitidos: ${SUBSCRIPTION_PLANS.join(", ")}.`
      });
    }

    const household = await Household.findById(householdId);
    if (!household) {
      return res.status(404).json({ ok: false, error: "Hogar no encontrado." });
    }

    const previousPlan = household.subscriptionPlan;

    if (normalizedPlan === "basic" || normalizedPlan === "free") {
      applyAdminSubscriptionDeactivation(household);
    } else {
      applyAdminSubscriptionActivation(household, normalizedPlan);
    }

    // Clear all Stripe metadata so the next test checkout starts fresh with no active-subscription guard
    household.stripeCustomerId = "";
    household.stripeSubscriptionId = "";
    household.paymentProvider = "";
    household.paymentMode = "";
    household.planUpdatedAt = new Date();
    household.planUpdatedByPaymentAttemptId = "";

    await household.save();

    console.log("[payments][dev] Household plan reset", {
      householdId,
      previousPlan,
      newPlan: normalizedPlan,
      resetBy: req.user?.id || null
    });

    return res.json({
      ok: true,
      household: {
        id: household._id.toString(),
        name: household.name,
        previousPlan,
        ...buildHouseholdSubscriptionResponse(household)
      }
    });
  } catch (error) {
    console.error("[payments][dev] reset-plan error", {
      body: req.body,
      error: error?.message,
      stack: error?.stack
    });
    return res.status(500).json({ ok: false, error: "No se pudo resetear el plan." });
  }
});

// ─── POST /api/payments/dev/change-plan ──────────────────────────────────────
// DEV/test shortcut — change the calling user's own household plan directly,
// without going through Stripe. Requires STRIPE_MODE=test AND
// ALLOW_TEST_PAYMENT_ENTITLEMENTS=true. Safe to use for demo resets.

function requireDevTestEntitlements(req, res, next) {
  if (config.stripe.mode !== "test" || !config.stripe.allowTestEntitlements) {
    return res.status(403).json({
      ok: false,
      code: "DEV_ONLY",
      error: "Este endpoint solo está disponible cuando STRIPE_MODE=test y ALLOW_TEST_PAYMENT_ENTITLEMENTS=true."
    });
  }
  return next();
}

router.post("/dev/change-plan", requireDevTestEntitlements, requireAuth, async (req, res) => {
  try {
    const { planKey } = req.body || {};
    const normalizedPlan = normalizeSubscriptionPlan(planKey);

    if (!["basic", "pro", "premium"].includes(normalizedPlan)) {
      return res.status(400).json({
        ok: false,
        error: "planKey inválido. Valores permitidos: basic, pro, premium."
      });
    }

    const effectiveHouseholdId = getEffectiveHouseholdId(req.user);
    const household = await Household.findById(effectiveHouseholdId);
    if (!household) {
      return res.status(404).json({ ok: false, error: "Hogar no encontrado." });
    }

    const previousPlan = household.subscriptionPlan;

    if (normalizedPlan === "basic") {
      applyAdminSubscriptionDeactivation(household);
    } else {
      applyAdminSubscriptionActivation(household, normalizedPlan);
    }

    // Clear Stripe metadata so the next checkout starts clean
    household.stripeCustomerId = "";
    household.stripeSubscriptionId = "";
    household.paymentProvider = "dev-override";
    household.paymentMode = "test";
    household.planUpdatedAt = new Date();
    household.planUpdatedByPaymentAttemptId = "";

    await household.save();

    console.log("[payments][dev] Household plan changed via dev/change-plan", {
      householdId: effectiveHouseholdId,
      previousPlan,
      newPlan: normalizedPlan,
      userId: req.user?.id || null
    });

    return res.json({
      ok: true,
      household: {
        id: household._id.toString(),
        name: household.name,
        previousPlan,
        ...buildHouseholdSubscriptionResponse(household)
      }
    });
  } catch (error) {
    const handled = handleHouseholdError(res, error);
    if (handled) return handled;
    console.error("[payments][dev] change-plan error", {
      body: req.body,
      error: error?.message
    });
    return res.status(500).json({ ok: false, error: "No se pudo cambiar el plan." });
  }
});

// ─── POST /api/payments/dev/apply-latest-subscription ────────────────────────
// DEV-only fallback. If the webhook applied the entitlement but the plan didn't
// appear to update (e.g. due to polling timing), the frontend calls this after
// the success page polls fail. Re-applies the latest completed subscription
// PurchaseAttempt for the current household.

router.post("/dev/apply-latest-subscription", requireDevTestEntitlements, requireAuth, async (req, res) => {
  try {
    const effectiveHouseholdId = getEffectiveHouseholdId(req.user);

    console.log("[payments][dev] apply-latest-subscription called", {
      householdId: effectiveHouseholdId,
      userId: req.user?.id || null,
      envPaymentsEnabled: config.stripe.paymentsEnabled,
      envStripeMode: config.stripe.mode,
      envAllowTestEntitlements: config.stripe.allowTestEntitlements
    });

    const attempt = await PurchaseAttempt.findOne({
      householdId: effectiveHouseholdId,
      type: "subscription",
      status: "completed",
      mode: "test"
    }).sort({ updatedAt: -1 });

    if (!attempt) {
      return res.status(404).json({
        ok: false,
        code: "NO_COMPLETED_ATTEMPT",
        error: "No se encontró ningún intento de suscripción completado para este hogar en modo test."
      });
    }

    console.log("[payments][dev] apply-latest-subscription: attempt found", {
      attemptId: attempt._id.toString(),
      planKey: attempt.planKey,
      mode: attempt.mode,
      status: attempt.status,
      householdId: attempt.householdId
    });

    const result = await applyDevSubscriptionPlanToHousehold(attempt);

    const household = await Household.findById(effectiveHouseholdId);

    console.log("[payments][dev] apply-latest-subscription: result", {
      applied: result.applied,
      reason: result.reason || null,
      newPlan: household?.subscriptionPlan,
      isPro: household?.isPro,
      subscriptionStatus: household?.subscriptionStatus
    });

    return res.json({
      ok: true,
      applied: result.applied,
      reason: result.reason || null,
      household: household ? {
        id: household._id.toString(),
        ...buildHouseholdSubscriptionResponse(household)
      } : null
    });
  } catch (error) {
    const handled = handleHouseholdError(res, error);
    if (handled) return handled;
    console.error("[payments][dev] apply-latest-subscription error", {
      error: error?.message,
      stack: error?.stack
    });
    return res.status(500).json({ ok: false, error: "No se pudo aplicar la suscripción." });
  }
});

// ─── Webhook handler ──────────────────────────────────────────────────────────
// Exported separately — needs raw body, registered in index.js before express.json()

async function handleCheckoutCompleted(session) {
  const attemptId = session.metadata?.purchaseAttemptId;
  const sessionId = session.id;

  console.log("[payments][webhook] handleCheckoutCompleted start", {
    sessionId,
    attemptId: attemptId || null,
    type: session.metadata?.type || null,
    planKey: session.metadata?.planKey || null,
    householdId: session.metadata?.householdId || null,
    customer: session.customer || null
  });

  const attempt = attemptId
    ? await PurchaseAttempt.findById(attemptId)
    : await PurchaseAttempt.findOne({ stripeCheckoutSessionId: sessionId });

  if (!attempt) {
    console.warn("[payments][webhook] PurchaseAttempt not found for completed session", {
      sessionId,
      attemptId: attemptId || null
    });
    return;
  }

  attempt.status = "completed";
  attempt.amountTotal = session.amount_total ?? null;
  attempt.currency = session.currency || "";
  attempt.stripeCustomerId = session.customer || "";
  attempt.stripeCheckoutSessionId = sessionId;
  if (session.subscription) {
    attempt.stripeSubscriptionId = session.subscription;
  }
  await attempt.save();

  console.log("[payments][webhook] PurchaseAttempt marked completed", {
    attemptId: attempt._id.toString(),
    type: attempt.type,
    planKey: attempt.planKey,
    userId: attempt.userId,
    householdId: attempt.householdId,
    amountTotal: attempt.amountTotal,
    currency: attempt.currency,
    mode: attempt.mode,
    stripeCustomerId: attempt.stripeCustomerId
  });

  // Always store stripeCustomerId on the household immediately, even if the
  // entitlement gate is blocked. This ensures the customer.subscription.created
  // event can look up the household by stripeCustomerId regardless of env flags.
  if (attempt.stripeCustomerId && attempt.householdId && mongoose.isValidObjectId(String(attempt.householdId))) {
    try {
      const updated = await Household.findByIdAndUpdate(
        attempt.householdId,
        { $set: { stripeCustomerId: attempt.stripeCustomerId } },
        { new: false }
      );
      if (updated) {
        console.log("[payments][webhook] stripeCustomerId stored on household (pre-entitlement)", {
          householdId: attempt.householdId,
          stripeCustomerId: attempt.stripeCustomerId
        });
      } else {
        console.warn("[payments][webhook] Household not found when storing stripeCustomerId", {
          householdId: attempt.householdId
        });
      }
    } catch (err) {
      console.error("[payments][webhook] Failed to store stripeCustomerId on household", {
        householdId: attempt.householdId,
        error: err.message
      });
    }
  }

  if (attempt.type === "subscription") {
    console.log("[payments][webhook] Dispatching subscription entitlement", {
      attemptId: attempt._id.toString(),
      planKey: attempt.planKey,
      mode: attempt.mode,
      envPaymentsEnabled: config.stripe.paymentsEnabled,
      envStripeMode: config.stripe.mode,
      envAllowTestEntitlements: config.stripe.allowTestEntitlements
    });
    await applyDevSubscriptionPlanToHousehold(attempt);
  } else if (attempt.type === "pack") {
    await applyPackEntitlementFromAttempt(attempt, session);
  } else if (attempt.type === "bites") {
    await applyBitesBundleEntitlementFromAttempt(attempt, session);
  }
}

async function handleCheckoutStatusUpdate(session, status) {
  const attemptId = session.metadata?.purchaseAttemptId;
  const sessionId = session.id;

  const attempt = attemptId
    ? await PurchaseAttempt.findById(attemptId)
    : await PurchaseAttempt.findOne({ stripeCheckoutSessionId: sessionId });

  if (!attempt) {
    console.warn(`[payments][webhook] PurchaseAttempt not found for ${status} session`, {
      sessionId,
      attemptId: attemptId || null
    });
    return;
  }

  attempt.status = status;
  await attempt.save();

  console.log(`[payments][webhook] PurchaseAttempt marked ${status}`, {
    attemptId: attempt._id.toString(),
    type: attempt.type,
    userId: attempt.userId
  });
}

function resolvePlanFromPriceId(priceId) {
  if (!priceId) return null;
  if (config.stripe.proPriceId && priceId === config.stripe.proPriceId) return "pro";
  if (config.stripe.premiumPriceId && priceId === config.stripe.premiumPriceId) return "premium";
  return null;
}

async function handleSubscriptionEvent(subscription, eventType) {
  const customerId = typeof subscription.customer === "string"
    ? subscription.customer
    : subscription.customer?.id;

  if (!customerId) {
    console.warn("[payments][webhook] subscription event missing customer", { eventType });
    return;
  }

  let household = await Household.findOne({ stripeCustomerId: customerId });

  if (!household) {
    // Fallback: look up via the most recent subscription PurchaseAttempt for this Stripe customer.
    // This happens when checkout.session.completed couldn't store stripeCustomerId in time,
    // or when the household was never linked (first subscription, DEV scenarios).
    console.warn("[payments][webhook] Household not found by stripeCustomerId — trying PurchaseAttempt fallback", {
      customerId,
      eventType
    });
    const fallbackAttempt = await PurchaseAttempt.findOne({
      stripeCustomerId: customerId,
      type: "subscription"
    }).sort({ updatedAt: -1 });

    if (fallbackAttempt?.householdId && mongoose.isValidObjectId(String(fallbackAttempt.householdId))) {
      household = await Household.findById(fallbackAttempt.householdId);
      if (household) {
        console.log("[payments][webhook] Household found via PurchaseAttempt fallback", {
          householdId: household._id.toString(),
          attemptId: fallbackAttempt._id.toString(),
          customerId
        });
        // Store stripeCustomerId so future events can find it directly
        household.stripeCustomerId = customerId;
      }
    }

    if (!household) {
      console.warn("[payments][webhook] Household not found for stripeCustomerId (both paths failed)", {
        customerId,
        eventType
      });
      return;
    }
  }

  if (eventType === "customer.subscription.deleted") {
    applyAdminSubscriptionDeactivation(household);
    household.stripeSubscriptionId = "";
    household.paymentProvider = "stripe";
    household.paymentMode = config.stripe.mode;
    household.planUpdatedAt = new Date();
    await household.save();
    console.log("[payments][webhook] Subscription cancelled — plan deactivated", {
      householdId: household._id.toString(),
      customerId
    });
    return;
  }

  // created or updated — resolve plan from price IDs
  const items = subscription.items?.data || [];
  const priceId = items[0]?.price?.id || "";
  const planKey = resolvePlanFromPriceId(priceId);

  if (!planKey) {
    console.warn("[payments][webhook] Could not resolve planKey from subscription price", {
      priceId,
      subscriptionId: subscription.id,
      eventType
    });
    return;
  }

  const status = subscription.status;
  if (status === "active" || status === "trialing") {
    applyAdminSubscriptionActivation(household, planKey);
    household.stripeSubscriptionId = subscription.id;
    household.stripeCustomerId = customerId;
    household.paymentProvider = "stripe";
    household.paymentMode = config.stripe.mode;
    household.planUpdatedAt = new Date();
    await household.save();
    console.log("[payments][webhook] Subscription activated", {
      householdId: household._id.toString(),
      planKey,
      subscriptionId: subscription.id,
      status,
      eventType
    });
  } else if (status === "past_due" || status === "unpaid" || status === "canceled") {
    applyAdminSubscriptionDeactivation(household);
    household.paymentProvider = "stripe";
    household.paymentMode = config.stripe.mode;
    household.planUpdatedAt = new Date();
    await household.save();
    console.log("[payments][webhook] Subscription deactivated due to status", {
      householdId: household._id.toString(),
      status,
      eventType
    });
  }
}

async function handleInvoicePaymentFailed(invoice) {
  const customerId = typeof invoice.customer === "string"
    ? invoice.customer
    : invoice.customer?.id;
  if (!customerId) return;

  console.warn("[payments][webhook] Invoice payment failed", {
    customerId,
    invoiceId: invoice.id,
    subscriptionId: invoice.subscription || null
  });
  // Subscription deactivation is handled by customer.subscription.updated (status=past_due)
}

async function handleChargeRefunded(charge) {
  const paymentIntentId = typeof charge.payment_intent === "string"
    ? charge.payment_intent
    : charge.payment_intent?.id;

  if (!paymentIntentId) return;

  // Mark matching pack entitlements as refunded
  const updated = await PackEntitlement.updateMany(
    { stripePaymentIntentId: paymentIntentId, status: "active" },
    { $set: { status: "refunded" } }
  );

  if (updated.modifiedCount > 0) {
    console.log("[payments][webhook] Pack entitlement(s) refunded", {
      paymentIntentId,
      count: updated.modifiedCount
    });
  }
}

export async function stripeWebhookHandler(req, res) {
  if (!config.stripe.paymentsEnabled) {
    return res.status(403).json({ error: "Payments not enabled." });
  }
  if (!config.stripe.webhookSecret) {
    console.error("[payments][webhook] STRIPE_WEBHOOK_SECRET not set");
    return res.status(500).json({ error: "Webhook secret not configured." });
  }

  const sig = req.headers["stripe-signature"];
  if (!sig) {
    return res.status(400).json({ error: "Missing stripe-signature header." });
  }

  let event;
  try {
    const stripe = new Stripe(config.stripe.secretKey, { apiVersion: STRIPE_API_VERSION });
    event = stripe.webhooks.constructEvent(req.body, sig, config.stripe.webhookSecret);
  } catch (err) {
    console.error("[payments][webhook] Signature verification failed", { error: err.message });
    return res.status(400).json({ error: `Webhook signature invalid: ${err.message}` });
  }

  console.log("[payments][webhook] Event received", {
    type: event.type,
    id: event.id,
    mode: config.stripe.mode
  });

  try {
    switch (event.type) {
      case "checkout.session.completed":
        await handleCheckoutCompleted(event.data.object);
        break;
      case "checkout.session.expired":
        await handleCheckoutStatusUpdate(event.data.object, "expired");
        break;
      case "checkout.session.async_payment_failed":
        await handleCheckoutStatusUpdate(event.data.object, "failed");
        break;
      case "customer.subscription.created":
      case "customer.subscription.updated":
      case "customer.subscription.deleted":
        await handleSubscriptionEvent(event.data.object, event.type);
        break;
      case "invoice.payment_succeeded":
        // Subscription activation is handled via customer.subscription events
        break;
      case "invoice.payment_failed":
        await handleInvoicePaymentFailed(event.data.object);
        break;
      case "charge.refunded":
        await handleChargeRefunded(event.data.object);
        break;
      default:
        console.log("[payments][webhook] Unhandled event type — ignored", { type: event.type });
    }
  } catch (handlerError) {
    // Log but return 200 — Stripe retries on non-2xx, risking duplicate processing
    console.error("[payments][webhook] Handler threw unexpectedly", {
      type: event.type,
      error: handlerError?.message,
      stack: handlerError?.stack
    });
  }

  return res.status(200).json({ received: true });
}

export default router;
