import express from "express";
import Stripe from "stripe";
import { config } from "../config.js";
import { requireAuth } from "../kitchen/middleware.js";
import { PurchaseAttempt } from "../kitchen/models/PurchaseAttempt.js";
import { getEffectiveHouseholdId, handleHouseholdError } from "../kitchen/householdScope.js";

const router = express.Router();

const VALID_TYPES = ["pack", "subscription", "bites"];
const STRIPE_API_VERSION = "2024-04-10";

function buildStripeClient() {
  if (!config.stripe.secretKey) {
    return null;
  }
  return new Stripe(config.stripe.secretKey, { apiVersion: STRIPE_API_VERSION });
}

// ─── POST /api/payments/checkout-session ─────────────────────────────────────

router.post("/checkout-session", requireAuth, async (req, res) => {
  try {
    if (!config.stripe.paymentsEnabled) {
      return res.status(403).json({
        ok: false,
        code: "PAYMENTS_DISABLED",
        error: "Los pagos no están activados en este entorno."
      });
    }

    const stripe = buildStripeClient();
    if (!stripe) {
      console.error("[payments] Stripe not configured — STRIPE_SECRET_KEY missing");
      return res.status(503).json({
        ok: false,
        code: "STRIPE_NOT_CONFIGURED",
        error: "El servicio de pago no está configurado. Contacta al administrador."
      });
    }

    const { type, targetId, targetName, stripePriceId, planKey } = req.body || {};

    if (!type || !VALID_TYPES.includes(type)) {
      return res.status(400).json({
        ok: false,
        error: `Tipo de pago inválido. Valores permitidos: ${VALID_TYPES.join(", ")}.`
      });
    }
    if (!stripePriceId || typeof stripePriceId !== "string" || !stripePriceId.startsWith("price_")) {
      return res.status(400).json({
        ok: false,
        error: "stripePriceId es obligatorio y debe ser un Stripe price ID válido."
      });
    }

    const effectiveHouseholdId = getEffectiveHouseholdId(req.user);
    const userId = req.user.id;
    const email = req.kitchenUser?.email || "";
    const appEnv = process.env.APP_ENV || config.nodeEnv || "development";

    const attempt = await PurchaseAttempt.create({
      userId,
      householdId: effectiveHouseholdId,
      email,
      type,
      targetId: targetId || "",
      targetName: targetName || "",
      planKey: planKey || null,
      stripePriceId,
      status: "created",
      mode: config.stripe.mode,
      metadata: { appEnv }
    });

    const checkoutMode = type === "subscription" ? "subscription" : "payment";
    const frontendUrl = String(config.frontendUrl || "").replace(/\/$/, "");

    const session = await stripe.checkout.sessions.create({
      mode: checkoutMode,
      line_items: [{ price: stripePriceId, quantity: 1 }],
      success_url: `${frontendUrl}/payments/success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${frontendUrl}/payments/cancelled`,
      customer_email: email || undefined,
      metadata: {
        userId,
        householdId: effectiveHouseholdId,
        type,
        targetId: targetId || "",
        planKey: planKey || "",
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
      planKey: planKey || null,
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

// ─── Webhook handler (exported separately — needs raw body, registered in index.js) ──

async function handleCheckoutCompleted(session) {
  const attemptId = session.metadata?.purchaseAttemptId;
  const sessionId = session.id;

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
    mode: attempt.mode
  });

  // FUTURE PRODUCTION ACTIVATION:
  // Once entitlement logic is production-ready, add activation here:
  //   - For "subscription": call subscriptionService.applyAdminSubscriptionActivation(household, attempt.planKey)
  //   - For "pack": update HouseholdCatalogPack to acquiredVia="purchase", paymentStatus="paid"
  //   - Guard with: if (attempt.mode === "live") { ... }
  // For now (test mode), we only log purchase intent — no plan or pack changes.
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
      default:
        console.log("[payments][webhook] Unhandled event type — ignored", { type: event.type });
    }
  } catch (handlerError) {
    // Log but still return 200 — Stripe retries on non-2xx, which could cause duplicate processing
    console.error("[payments][webhook] Handler threw unexpectedly", {
      type: event.type,
      error: handlerError?.message,
      stack: handlerError?.stack
    });
  }

  return res.status(200).json({ received: true });
}

export default router;
