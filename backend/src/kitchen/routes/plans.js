import express from "express";
import { requireAuth, requireDiod } from "../middleware.js";
import { config } from "../../config.js";
import { getPlansConfig, PlansConfig } from "../models/PlansConfig.js";

const router = express.Router();

const PLAN_KEYS = ["basic", "pro", "premium"];

// ─── GET /api/kitchen/plans/admin/config ──────────────────────────────────────

router.get("/admin/config", requireAuth, requireDiod, async (req, res) => {
  try {
    const cfg = await getPlansConfig();

    // Merge env-var fallbacks so the UI shows a price ID even if only env is set
    const toEntry = (key, entry) => ({
      displayPrice: entry?.displayPrice || "",
      isPaid: Boolean(entry?.isPaid),
      paymentMode: entry?.paymentMode || "none",
      stripePriceId: entry?.stripePriceId || "",
      // Env-var fallback (read-only hint for the UI)
      envStripePriceId: key === "pro"
        ? (config.stripe.proPriceId || "")
        : key === "premium"
          ? (config.stripe.premiumPriceId || "")
          : ""
    });

    return res.json({
      ok: true,
      config: {
        basic: toEntry("basic", cfg.basic),
        pro: toEntry("pro", cfg.pro),
        premium: toEntry("premium", cfg.premium)
      },
      // Surface env-level flags so the UI can show the current runtime state
      env: {
        paymentsEnabled: config.stripe.paymentsEnabled,
        stripeMode: config.stripe.mode,
        allowTestEntitlements: config.stripe.allowTestEntitlements,
        portalEnabled: config.stripe.portalEnabled
      }
    });
  } catch (error) {
    console.error("[plans] admin/config GET error", { error: error.message });
    return res.status(500).json({ ok: false, error: error.message || "Error." });
  }
});

// ─── PUT /api/kitchen/plans/admin/config ──────────────────────────────────────

router.put("/admin/config", requireAuth, requireDiod, async (req, res) => {
  try {
    const { plans } = req.body || {};
    if (!plans || typeof plans !== "object") {
      return res.status(400).json({ ok: false, error: "Body debe contener un objeto 'plans'." });
    }

    let cfg = await getPlansConfig();

    for (const key of PLAN_KEYS) {
      const entry = plans[key];
      if (!entry || typeof entry !== "object") continue;

      if (entry.displayPrice !== undefined) cfg[key].displayPrice = String(entry.displayPrice).trim();
      if (entry.isPaid !== undefined) cfg[key].isPaid = Boolean(entry.isPaid);
      if (entry.paymentMode !== undefined) {
        if (!["none", "stripe"].includes(entry.paymentMode)) {
          return res.status(400).json({
            ok: false,
            error: `paymentMode inválido para ${key}: debe ser 'none' o 'stripe'.`
          });
        }
        cfg[key].paymentMode = entry.paymentMode;
      }
      if (entry.stripePriceId !== undefined) {
        const pid = String(entry.stripePriceId || "").trim();
        if (pid && !pid.startsWith("price_")) {
          return res.status(400).json({
            ok: false,
            error: `stripePriceId inválido para ${key}: debe comenzar con 'price_'.`
          });
        }
        cfg[key].stripePriceId = pid;
      }
    }

    cfg.updatedBy = req.kitchenUser._id;
    cfg.markModified("basic");
    cfg.markModified("pro");
    cfg.markModified("premium");
    await cfg.save();

    console.log("[plans] admin/config saved", {
      updatedBy: req.kitchenUser._id,
      pro: { isPaid: cfg.pro.isPaid, paymentMode: cfg.pro.paymentMode, hasPriceId: Boolean(cfg.pro.stripePriceId) },
      premium: { isPaid: cfg.premium.isPaid, paymentMode: cfg.premium.paymentMode, hasPriceId: Boolean(cfg.premium.stripePriceId) }
    });

    return res.json({ ok: true, config: cfg.toObject() });
  } catch (error) {
    console.error("[plans] admin/config PUT error", { error: error.message });
    return res.status(500).json({ ok: false, error: error.message || "Error." });
  }
});

export default router;
