import express from "express";
import mongoose from "mongoose";
import Stripe from "stripe";
import rateLimit from "express-rate-limit";
import { config } from "../config.js";
import { requireAuth, requireDiod } from "../kitchen/middleware.js";
import { StripeWebhookEvent } from "../kitchen/models/StripeWebhookEvent.js";
import { PurchaseAttempt } from "../kitchen/models/PurchaseAttempt.js";
import { CatalogPack } from "../kitchen/models/CatalogPack.js";
import { PackEntitlement } from "../kitchen/models/PackEntitlement.js";
import { Household } from "../kitchen/models/Household.js";
import { BitesConfig } from "../kitchen/models/BitesConfig.js";
import { getPlansConfig } from "../kitchen/models/PlansConfig.js";
import { getEffectiveHouseholdId, handleHouseholdError } from "../kitchen/householdScope.js";
import {
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

// S-1: Rate-limit checkout creation — 10 attempts per 15 minutes per IP.
const checkoutRateLimit = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { ok: false, code: "RATE_LIMITED", error: "Demasiadas solicitudes de pago. Inténtalo de nuevo en 15 minutos." }
});
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

router.post("/checkout-session", checkoutRateLimit, requireAuth, async (req, res) => {
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
        return res.status(400).json({ ok: false, error: "targetId debe ser un ObjectId válido para tipo 'bites'." });
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
          error: "Este bundle no está disponible para compra directa."
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

// ─── POST /api/payments/session-activate ─────────────────────────────────────
// Called from the success page to activate an entitlement without relying on
// webhook delivery. Verifies the Stripe session directly via the Stripe API,
// so it works in any environment without ALLOW_TEST_PAYMENT_ENTITLEMENTS.

router.post("/session-activate", requireAuth, async (req, res) => {
  if (!paymentsEnabledGuard(res)) return;
  const stripe = stripeClientGuard(res);
  if (!stripe) return;

  const { sessionId } = req.body || {};
  if (!sessionId || typeof sessionId !== "string") {
    return res.status(400).json({ ok: false, error: "sessionId requerido." });
  }

  try {
    const effectiveHouseholdId = getEffectiveHouseholdId(req.user);

    const attempt = await PurchaseAttempt.findOne({
      stripeCheckoutSessionId: sessionId,
      householdId: effectiveHouseholdId
    });

    console.log("[payments] session-activate: attempt lookup", {
      sessionId,
      householdId: effectiveHouseholdId,
      found: Boolean(attempt),
      status: attempt?.status,
      type: attempt?.type,
      planKey: attempt?.planKey
    });

    if (!attempt) {
      return res.status(404).json({
        ok: false,
        code: "ATTEMPT_NOT_FOUND",
        error: "No se encontró el intento de pago para esta sesión."
      });
    }

    // Attempt was already completed (webhook fired). Check if the plan was actually
    // applied — the webhook may have marked it completed but skipped the entitlement
    // (e.g. ALLOW_TEST_PAYMENT_ENTITLEMENTS was false). If so, apply it now.
    if (attempt.status === "completed") {
      const household = await Household.findById(effectiveHouseholdId);
      if (!household) {
        return res.status(404).json({ ok: false, error: "Household no encontrado." });
      }

      if (attempt.type === "subscription") {
        const expectedPlan = normalizeSubscriptionPlan(attempt.planKey);
        const currentPlan = normalizeSubscriptionPlan(household.subscriptionPlan);

        if (["pro", "premium"].includes(expectedPlan) && currentPlan !== expectedPlan) {
          applyAdminSubscriptionActivation(household, expectedPlan);
          // Override mock 30-day offset with Stripe's actual billing period end
          if (attempt.stripeSubscriptionId) {
            try {
              const sub = await stripe.subscriptions.retrieve(attempt.stripeSubscriptionId);
              if (sub.current_period_end) {
                household.subscriptionEndsAt = new Date(sub.current_period_end * 1000);
              }
            } catch (subErr) {
              console.warn("[payments] session-activate: could not retrieve subscription for period end", {
                stripeSubscriptionId: attempt.stripeSubscriptionId,
                error: subErr.message
              });
            }
          }
          household.stripeCustomerId = attempt.stripeCustomerId || household.stripeCustomerId || "";
          household.stripeSubscriptionId = attempt.stripeSubscriptionId || household.stripeSubscriptionId || "";
          household.paymentProvider = attempt.mode === "test" ? "stripe-test" : "stripe";
          household.paymentMode = attempt.mode;
          household.planUpdatedAt = new Date();
          household.planUpdatedByPaymentAttemptId = attempt._id.toString();
          await household.save({ validateBeforeSave: false });
          console.log("[payments] session-activate: applied plan from completed-but-unactivated attempt", {
            householdId: effectiveHouseholdId,
            expectedPlan,
            sessionId,
            mode: attempt.mode,
            subscriptionEndsAt: household.subscriptionEndsAt
          });
          const reloaded = await Household.findById(effectiveHouseholdId);
          return res.json({
            ok: true,
            applied: true,
            household: { id: reloaded._id.toString(), ...buildHouseholdSubscriptionResponse(reloaded) }
          });
        }
      }

      return res.json({
        ok: true,
        applied: false,
        reason: "already_completed",
        household: { id: household._id.toString(), ...buildHouseholdSubscriptionResponse(household) }
      });
    }

    // Verify payment directly with Stripe (this is the proof of payment).
    // Expand subscription so we get current_period_end without a second API call.
    console.log("[payments] session-activate: retrieving from Stripe", { sessionId });
    const stripeSession = await stripe.checkout.sessions.retrieve(sessionId, {
      expand: ["subscription"]
    });
    if (stripeSession.payment_status !== "paid") {
      return res.status(400).json({
        ok: false,
        code: "NOT_PAID",
        error: `El pago no está completado (estado: ${stripeSession.payment_status}).`
      });
    }

    // B-4: Confirm the Stripe session was created for this household.
    // If metadata.householdId is absent (old sessions), log and continue.
    // If it is present but doesn't match, reject — prevents cross-household activation.
    const sessionMetaHouseholdId = stripeSession.metadata?.householdId || "";
    if (sessionMetaHouseholdId && sessionMetaHouseholdId !== String(effectiveHouseholdId)) {
      console.error("[payments] session-activate: householdId mismatch", {
        sessionMetaHouseholdId,
        effectiveHouseholdId,
        sessionId
      });
      return res.status(403).json({
        ok: false,
        code: "HOUSEHOLD_MISMATCH",
        error: "Esta sesión de pago no pertenece a tu cuenta."
      });
    }

    // subscription may be an expanded object or a bare string ID
    const stripeSubscriptionId = typeof stripeSession.subscription === "string"
      ? stripeSession.subscription
      : stripeSession.subscription?.id || "";

    // Mark attempt completed with Stripe data
    attempt.status = "completed";
    attempt.amountTotal = stripeSession.amount_total ?? null;
    attempt.currency = stripeSession.currency || "";
    attempt.stripeCustomerId = stripeSession.customer || "";
    if (stripeSubscriptionId) attempt.stripeSubscriptionId = stripeSubscriptionId;
    await attempt.save();

    // Store stripeCustomerId on household so future subscription events can find it
    if (attempt.stripeCustomerId && mongoose.isValidObjectId(String(effectiveHouseholdId))) {
      await Household.findByIdAndUpdate(effectiveHouseholdId, {
        $set: { stripeCustomerId: attempt.stripeCustomerId }
      });
    }

    const household = await Household.findById(effectiveHouseholdId);
    if (!household) {
      return res.status(404).json({ ok: false, error: "Household no encontrado." });
    }

    if (attempt.type === "subscription") {
      const planKey = normalizeSubscriptionPlan(attempt.planKey);
      if (!["pro", "premium"].includes(planKey)) {
        return res.status(422).json({ ok: false, error: `planKey "${attempt.planKey}" no es válido.` });
      }
      applyAdminSubscriptionActivation(household, planKey);
      // Override the mock 30-day offset with Stripe's actual billing period end
      const periodEnd = typeof stripeSession.subscription === "object"
        ? stripeSession.subscription?.current_period_end
        : null;
      if (periodEnd) household.subscriptionEndsAt = new Date(periodEnd * 1000);
      household.stripeSubscriptionId = stripeSubscriptionId || household.stripeSubscriptionId || "";
      household.paymentProvider = attempt.mode === "test" ? "stripe-test" : "stripe";
      household.paymentMode = attempt.mode;
      household.planUpdatedAt = new Date();
      household.planUpdatedByPaymentAttemptId = attempt._id.toString();
      await household.save({ validateBeforeSave: false });
      console.log("[payments] session-activate: subscription activated", {
        householdId: effectiveHouseholdId,
        planKey,
        mode: attempt.mode,
        sessionId,
        subscriptionEndsAt: household.subscriptionEndsAt
      });
    } else if (attempt.type === "pack") {
      await applyPackEntitlementFromAttempt(attempt, stripeSession);
    } else if (attempt.type === "bites") {
      await applyBitesBundleEntitlementFromAttempt(attempt, stripeSession);
    }

    const reloaded = await Household.findById(effectiveHouseholdId);
    return res.json({
      ok: true,
      applied: true,
      household: { id: reloaded._id.toString(), ...buildHouseholdSubscriptionResponse(reloaded) }
    });
  } catch (error) {
    const handled = handleHouseholdError(res, error);
    if (handled) return handled;
    console.error("[payments] session-activate error", { error: error?.message, stack: error?.stack });
    return res.status(500).json({ ok: false, error: "No se pudo activar el pago." });
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
// DEV-only fallback. Called from PaymentSuccessPage when polling exhausts without
// detecting an upgrade. Works even if the Stripe webhook never reached this server
// (common in Render/tunnel setups where webhook delivery is unreliable).
// Finds the latest test subscription attempt (any status), marks it completed if
// needed, and applies the entitlement.

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

    // Find the most recent test subscription attempt regardless of status.
    // The webhook may not have fired (Render endpoint unreachable, tunnel issues, etc.)
    // so we cannot require status === "completed".
    const attempt = await PurchaseAttempt.findOne({
      householdId: effectiveHouseholdId,
      type: "subscription",
      mode: "test"
    }).sort({ createdAt: -1 });

    if (!attempt) {
      return res.status(404).json({
        ok: false,
        code: "NO_COMPLETED_SUBSCRIPTION_ATTEMPT",
        error: "No se encontró ningún intento de suscripción en modo test para este hogar."
      });
    }

    // Validate it has a usable planKey before touching anything
    const normalizedPlanKey = String(attempt.planKey || "").toLowerCase();
    if (!["pro", "premium"].includes(normalizedPlanKey)) {
      return res.status(422).json({
        ok: false,
        code: "INVALID_PLAN_KEY",
        error: `planKey "${attempt.planKey}" no es válido (debe ser 'pro' o 'premium').`
      });
    }

    // If the webhook never fired, the attempt is still "created". Mark it completed
    // so the subsequent entitlement logic treats it as a valid completed purchase.
    if (attempt.status !== "completed") {
      console.log("[payments][dev] apply-latest-subscription: attempt not completed — marking completed now (webhook likely missed)", {
        attemptId: attempt._id.toString(),
        previousStatus: attempt.status,
        planKey: attempt.planKey
      });
      attempt.status = "completed";
      await attempt.save();
    }

    console.log("[payments][dev] apply-latest-subscription: attempt found", {
      attemptId: attempt._id.toString(),
      planKey: attempt.planKey,
      mode: attempt.mode,
      status: attempt.status,
      householdId: attempt.householdId
    });

    // Apply directly — same logic as the webhook path, no complex gate
    const household = await Household.findById(effectiveHouseholdId);
    if (!household) {
      return res.status(404).json({ ok: false, error: "Household no encontrado." });
    }

    const oldPlan = household.subscriptionPlan;
    applyAdminSubscriptionActivation(household, normalizedPlanKey);
    household.stripeCustomerId = attempt.stripeCustomerId || household.stripeCustomerId || "";
    household.stripeSubscriptionId = attempt.stripeSubscriptionId || household.stripeSubscriptionId || "";
    household.paymentProvider = "stripe-test";
    household.paymentMode = "test";
    household.planUpdatedAt = new Date();
    household.planUpdatedByPaymentAttemptId = attempt._id.toString();
    await household.save();

    console.log("[payments][dev] apply-latest-subscription: ==== SUBSCRIPTION ACTIVATED ====", {
      householdId: household._id.toString(),
      oldPlan,
      newPlan: household.subscriptionPlan,
      subscriptionStatus: household.subscriptionStatus,
      isPro: household.isPro,
      planKey: normalizedPlanKey
    });

    return res.json({
      ok: true,
      applied: oldPlan !== household.subscriptionPlan,
      household: {
        id: household._id.toString(),
        ...buildHouseholdSubscriptionResponse(household)
      }
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

// ─── POST /api/payments/cancel-subscription ──────────────────────────────────
// Schedules a downgrade to Basic at end of the current billing period.
// Optionally sets cancel_at_period_end on Stripe to prevent auto-renewal.

router.post("/cancel-subscription", requireAuth, async (req, res) => {
  try {
    const { reason = "", details = "" } = req.body || {};
    const effectiveHouseholdId = getEffectiveHouseholdId(req.user);

    const household = await Household.findById(effectiveHouseholdId);
    if (!household) {
      return res.status(404).json({ ok: false, error: "Hogar no encontrado." });
    }

    const planKey = normalizeSubscriptionPlan(household.subscriptionPlan);
    if (!["pro", "premium"].includes(planKey) || household.subscriptionStatus !== "active") {
      return res.status(400).json({
        ok: false,
        code: "NOT_ON_PAID_PLAN",
        error: "Solo puedes cancelar una suscripción de pago activa."
      });
    }

    if (household.pendingDowngradeAt) {
      return res.status(409).json({
        ok: false,
        code: "DOWNGRADE_ALREADY_PENDING",
        error: "Ya tienes una cancelación programada."
      });
    }

    // Schedule at end of billing period, or 24 h from now as a safe fallback
    const downgradeAt = household.subscriptionEndsAt
      ? new Date(household.subscriptionEndsAt)
      : new Date(Date.now() + 24 * 60 * 60 * 1000);

    household.pendingDowngradeAt = downgradeAt;
    household.pendingDowngradeReason = `${String(reason || "").slice(0, 100)}${details ? ` — ${String(details).slice(0, 200)}` : ""}`.trim();

    // Try to set cancel_at_period_end on Stripe — non-fatal if it fails
    if (household.stripeSubscriptionId) {
      const stripe = buildStripeClient();
      if (stripe) {
        try {
          await stripe.subscriptions.update(household.stripeSubscriptionId, {
            cancel_at_period_end: true
          });
          console.log("[payments] cancel-subscription: Stripe cancel_at_period_end=true", {
            householdId: effectiveHouseholdId,
            stripeSubscriptionId: household.stripeSubscriptionId
          });
        } catch (stripeErr) {
          console.warn("[payments] cancel-subscription: Stripe update failed (non-fatal)", {
            error: stripeErr.message,
            stripeSubscriptionId: household.stripeSubscriptionId
          });
        }
      }
    }

    await household.save({ validateBeforeSave: false });

    console.log("[payments] cancel-subscription: downgrade scheduled", {
      householdId: effectiveHouseholdId,
      plan: planKey,
      downgradeAt,
      reason: household.pendingDowngradeReason
    });

    return res.json({
      ok: true,
      household: { id: household._id.toString(), ...buildHouseholdSubscriptionResponse(household) }
    });
  } catch (error) {
    const handled = handleHouseholdError(res, error);
    if (handled) return handled;
    console.error("[payments] cancel-subscription error", { error: error?.message });
    return res.status(500).json({ ok: false, error: "No se pudo programar la cancelación." });
  }
});

// ─── POST /api/payments/undo-cancel-subscription ─────────────────────────────
// Reverts a pending downgrade. Clears cancel_at_period_end on Stripe if set.

router.post("/undo-cancel-subscription", requireAuth, async (req, res) => {
  try {
    const effectiveHouseholdId = getEffectiveHouseholdId(req.user);

    const household = await Household.findById(effectiveHouseholdId);
    if (!household) {
      return res.status(404).json({ ok: false, error: "Hogar no encontrado." });
    }

    if (!household.pendingDowngradeAt) {
      return res.status(400).json({
        ok: false,
        code: "NO_PENDING_DOWNGRADE",
        error: "No tienes ninguna cancelación programada."
      });
    }

    if (household.stripeSubscriptionId) {
      const stripe = buildStripeClient();
      if (stripe) {
        try {
          await stripe.subscriptions.update(household.stripeSubscriptionId, {
            cancel_at_period_end: false
          });
          console.log("[payments] undo-cancel-subscription: Stripe cancel_at_period_end=false", {
            householdId: effectiveHouseholdId,
            stripeSubscriptionId: household.stripeSubscriptionId
          });
        } catch (stripeErr) {
          console.warn("[payments] undo-cancel-subscription: Stripe update failed (non-fatal)", {
            error: stripeErr.message,
            stripeSubscriptionId: household.stripeSubscriptionId
          });
        }
      }
    }

    household.pendingDowngradeAt = null;
    household.pendingDowngradeReason = "";
    await household.save({ validateBeforeSave: false });

    console.log("[payments] undo-cancel-subscription: downgrade cancelled", {
      householdId: effectiveHouseholdId
    });

    return res.json({
      ok: true,
      household: { id: household._id.toString(), ...buildHouseholdSubscriptionResponse(household) }
    });
  } catch (error) {
    const handled = handleHouseholdError(res, error);
    if (handled) return handled;
    console.error("[payments] undo-cancel-subscription error", { error: error?.message });
    return res.status(500).json({ ok: false, error: "No se pudo revertir la cancelación." });
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
    // Apply subscription directly — same pattern as packs. The webhook signature has
    // already been verified by Stripe, so no extra env-var gate is needed here.
    // For test attempts, require allowTestEntitlements (same guard packs use).
    const isTestAttempt = attempt.mode === "test";
    const planKey = normalizeSubscriptionPlan(attempt.planKey);
    const isValidPlan = planKey === "pro" || planKey === "premium";

    console.log("[payments][webhook] checkout.session.completed — subscription", {
      attemptId: attempt._id.toString(),
      planKey,
      originalPlanKey: attempt.planKey,
      isValidPlan,
      isTestAttempt,
      paymentsEnabled: config.stripe.paymentsEnabled,
      allowTestEntitlements: config.stripe.allowTestEntitlements,
      householdId: attempt.householdId
    });

    if (!config.stripe.paymentsEnabled) {
      console.warn("[payments][webhook] subscription entitlement skipped — PAYMENTS_ENABLED is not true");
    } else if (isTestAttempt && !config.stripe.allowTestEntitlements) {
      console.warn("[payments][webhook] subscription entitlement skipped — ALLOW_TEST_PAYMENT_ENTITLEMENTS is not true");
    } else if (!isValidPlan) {
      console.warn("[payments][webhook] subscription entitlement skipped — planKey not pro/premium", { planKey, raw: attempt.planKey });
    } else if (!attempt.householdId || !mongoose.isValidObjectId(String(attempt.householdId))) {
      console.warn("[payments][webhook] subscription entitlement skipped — invalid householdId", { householdId: attempt.householdId });
    } else {
      const household = await Household.findById(attempt.householdId);
      if (!household) {
        console.error("[payments][webhook] subscription entitlement failed — household not found", { householdId: attempt.householdId });
      } else {
        const oldPlan = household.subscriptionPlan;
        applyAdminSubscriptionActivation(household, planKey);
        household.stripeCustomerId = attempt.stripeCustomerId || household.stripeCustomerId || "";
        household.stripeSubscriptionId = attempt.stripeSubscriptionId || household.stripeSubscriptionId || "";
        household.paymentProvider = isTestAttempt ? "stripe-test" : "stripe";
        household.paymentMode = attempt.mode;
        household.planUpdatedAt = new Date();
        household.planUpdatedByPaymentAttemptId = attempt._id.toString();
        await household.save();
        console.log("[payments][webhook] ==== SUBSCRIPTION ACTIVATED ====", {
          householdId: household._id.toString(),
          oldPlan,
          newPlan: household.subscriptionPlan,
          subscriptionStatus: household.subscriptionStatus,
          isPro: household.isPro,
          planKey,
          mode: attempt.mode
        });
      }
    }
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

async function resolvePlanFromPriceId(priceId) {
  if (!priceId) return null;
  // Check env vars first (fast path)
  if (config.stripe.proPriceId && priceId === config.stripe.proPriceId) return "pro";
  if (config.stripe.premiumPriceId && priceId === config.stripe.premiumPriceId) return "premium";
  // Fall back to DB-stored price IDs (PlansConfig admin panel)
  try {
    const plansConfig = await getPlansConfig();
    if (plansConfig.pro?.stripePriceId && priceId === plansConfig.pro.stripePriceId) return "pro";
    if (plansConfig.premium?.stripePriceId && priceId === plansConfig.premium.stripePriceId) return "premium";
  } catch (err) {
    console.warn("[payments][webhook] resolvePlanFromPriceId DB lookup failed", { error: err.message });
  }
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

  // created or updated — resolve plan from price IDs (env vars + DB PlansConfig)
  const items = subscription.items?.data || [];
  const priceId = items[0]?.price?.id || "";
  let planKey = await resolvePlanFromPriceId(priceId);

  if (!planKey) {
    // For renewals (subscription.updated, same sub ID, already on a paid plan), fall back
    // to the household's current plan so subscriptionEndsAt is still refreshed even when
    // STRIPE_PRO_PRICE_ID / STRIPE_PREMIUM_PRICE_ID are not configured.
    const isRenewal =
      eventType === "customer.subscription.updated" &&
      household.stripeSubscriptionId === subscription.id &&
      (household.subscriptionPlan === "pro" || household.subscriptionPlan === "premium");

    if (isRenewal) {
      planKey = household.subscriptionPlan;
      console.warn("[payments][webhook] resolvePlanFromPriceId returned null — using existing plan for renewal (configure price IDs to remove this warning)", {
        priceId,
        subscriptionId: subscription.id,
        fallbackPlan: planKey
      });
    } else {
      console.warn("[payments][webhook] Could not resolve planKey from subscription price — configure STRIPE_PRO_PRICE_ID / STRIPE_PREMIUM_PRICE_ID or add price IDs in PlansConfig", {
        priceId,
        subscriptionId: subscription.id,
        eventType
      });
      return;
    }
  }

  const status = subscription.status;
  if (status === "active" || status === "trialing") {
    // checkout.session.completed already activates the plan for new subscriptions.
    // Skip re-activation on subscription.created to avoid the dual-write race.
    if (
      eventType === "customer.subscription.created" &&
      household.subscriptionStatus === "active" &&
      household.stripeSubscriptionId === subscription.id
    ) {
      console.log("[payments][webhook] Subscription already activated by checkout.session.completed — skipping duplicate", {
        householdId: household._id.toString(),
        subscriptionId: subscription.id,
        eventType
      });
      return;
    }
    applyAdminSubscriptionActivation(household, planKey);
    // Override the mock 30-day offset with Stripe's actual billing period end
    if (subscription.current_period_end) {
      household.subscriptionEndsAt = new Date(subscription.current_period_end * 1000);
    }
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
      eventType,
      subscriptionEndsAt: household.subscriptionEndsAt
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

async function handleInvoicePaymentSucceeded(invoice) {
  // Safety net for subscription renewals: refreshes subscriptionEndsAt using
  // the invoice period end in case customer.subscription.updated didn't fire.
  if (!invoice.subscription || invoice.billing_reason !== "subscription_cycle") return;

  const customerId = typeof invoice.customer === "string" ? invoice.customer : invoice.customer?.id;
  if (!customerId) return;

  const periodEnd = invoice.lines?.data?.[0]?.period?.end;
  if (!periodEnd) return;

  const household = await Household.findOne({ stripeCustomerId: customerId });
  if (!household || household.subscriptionStatus !== "active") return;

  household.subscriptionEndsAt = new Date(periodEnd * 1000);
  household.planUpdatedAt = new Date();
  await household.save();

  console.log("[payments][webhook] subscriptionEndsAt refreshed via invoice.payment_succeeded", {
    householdId: household._id.toString(),
    customerId,
    subscriptionEndsAt: household.subscriptionEndsAt
  });
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
  // Log immediately before any guard — this fires even if paymentsEnabled=false or sig missing.
  // If this log never appears in Render, the Stripe webhook URL is wrong.
  console.log("==== WEBHOOK HIT ====", {
    path: req.path,
    method: req.method,
    hasSig: Boolean(req.headers["stripe-signature"]),
    contentType: req.headers["content-type"] || "",
    paymentsEnabled: config.stripe.paymentsEnabled,
    hasWebhookSecret: Boolean(config.stripe.webhookSecret)
  });

  if (!config.stripe.paymentsEnabled) {
    console.warn("[payments][webhook] BLOCKED — PAYMENTS_ENABLED is not true");
    return res.status(403).json({ error: "Payments not enabled." });
  }
  if (!config.stripe.webhookSecret) {
    console.error("[payments][webhook] STRIPE_WEBHOOK_SECRET not set");
    return res.status(500).json({ error: "Webhook secret not configured." });
  }

  const sig = req.headers["stripe-signature"];
  if (!sig) {
    console.error("[payments][webhook] Missing stripe-signature header");
    return res.status(400).json({ error: "Missing stripe-signature header." });
  }

  let event;
  try {
    const stripe = new Stripe(config.stripe.secretKey, { apiVersion: STRIPE_API_VERSION });
    event = stripe.webhooks.constructEvent(req.body, sig, config.stripe.webhookSecret);
  } catch (err) {
    console.error("[payments][webhook] Signature verification FAILED — check STRIPE_WEBHOOK_SECRET matches Stripe dashboard", { error: err.message });
    return res.status(400).json({ error: `Webhook signature invalid: ${err.message}` });
  }

  console.log("==== STRIPE WEBHOOK RECEIVED ====", {
    type: event.type,
    id: event.id,
    livemode: event.livemode,
    mode: config.stripe.mode,
    paymentsEnabled: config.stripe.paymentsEnabled,
    allowTestEntitlements: config.stripe.allowTestEntitlements
  });

  // Reject if the event's live/test mode doesn't match the configured STRIPE_MODE.
  // Prevents test webhooks from activating live entitlements and vice-versa.
  const expectedLivemode = config.stripe.mode === "live";
  if (event.livemode !== expectedLivemode) {
    console.error("[payments][webhook] REJECTED — event.livemode mismatch", {
      eventLivemode: event.livemode,
      expectedLivemode,
      configuredMode: config.stripe.mode,
      eventId: event.id,
      eventType: event.type
    });
    return res.status(400).json({
      error: `Webhook mode mismatch: event is ${event.livemode ? "live" : "test"} but server is configured for ${config.stripe.mode} mode.`
    });
  }

  // S-5: Idempotency — deduplicate by event ID before processing.
  try {
    await StripeWebhookEvent.create({ eventId: event.id, eventType: event.type });
  } catch (dupErr) {
    if (dupErr.code === 11000) {
      console.log("[payments][webhook] Duplicate event — already processed, skipping", { eventId: event.id, eventType: event.type });
      return res.status(200).json({ received: true, duplicate: true });
    }
    // Can't write dedup record — still process to avoid silently dropping events.
    console.warn("[payments][webhook] Could not write to dedup store — proceeding anyway", { error: dupErr.message });
  }

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
        await handleInvoicePaymentSucceeded(event.data.object);
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
    // O-2: Return 500 so Stripe retries. Delete the dedup record first so the retry isn't blocked.
    await StripeWebhookEvent.deleteOne({ eventId: event.id }).catch(() => {});
    console.error("[payments][webhook] Handler threw unexpectedly", {
      type: event.type,
      error: handlerError?.message,
      stack: handlerError?.stack
    });
    return res.status(500).json({ error: "Internal error processing webhook." });
  }

  return res.status(200).json({ received: true });
}

export default router;
