import express from "express";
import mongoose from "mongoose";
import { requireAuth, requireDiod } from "../middleware.js";
import { getEffectiveHouseholdId, handleHouseholdError } from "../householdScope.js";
import { Household } from "../models/Household.js";
import { BitesTransaction } from "../models/BitesTransaction.js";
import { BitesConfig } from "../models/BitesConfig.js";
import {
  getBitesConfig,
  getWalletFromHousehold,
  getMonthlyGrant,
  getMaxCarryOver,
  daysUntilNextGrant,
  grantMonthlyBites,
  adminGrantBites
} from "../bitesService.js";
import { normalizeSubscriptionPlan } from "../subscriptionService.js";

const router = express.Router();

// ─── User wallet ─────────────────────────────────────────────────────────────

router.get("/wallet", requireAuth, async (req, res) => {
  try {
    const householdId = getEffectiveHouseholdId(req.user);
    const household = await Household.findById(householdId).lean();
    if (!household) return res.status(404).json({ ok: false, error: "Hogar no encontrado." });

    const config = await getBitesConfig();
    const plan = normalizeSubscriptionPlan(household.subscriptionPlan);
    const wallet = getWalletFromHousehold(household);
    const days = daysUntilNextGrant();

    return res.json({
      ok: true,
      wallet: { ...wallet, daysUntilNextGrant: days },
      plan,
      config: {
        monthlyGrant: getMonthlyGrant(config, plan),
        maxCarryOver: getMaxCarryOver(config, plan),
        bundles: (config.bundles || [])
          .filter((b) => b.active)
          .sort((a, b) => a.sortOrder - b.sortOrder)
      }
    });
  } catch (error) {
    if (handleHouseholdError(res, error)) return;
    return res.status(500).json({ ok: false, error: error.message || "Error." });
  }
});

// ─── Admin: config ────────────────────────────────────────────────────────────

router.get("/admin/config", requireAuth, requireDiod, async (req, res) => {
  try {
    const config = await getBitesConfig();
    return res.json({ ok: true, config });
  } catch (error) {
    return res.status(500).json({ ok: false, error: error.message || "Error." });
  }
});

router.put("/admin/config", requireAuth, requireDiod, async (req, res) => {
  try {
    const { monthlyGrantByPlan, maxFreeCarryOverByPlan, baseBitePrice } = req.body;

    let config = await BitesConfig.findOne({ key: "bitesEconomy" });
    if (!config) {
      await getBitesConfig();
      config = await BitesConfig.findOne({ key: "bitesEconomy" });
    }

    if (monthlyGrantByPlan && typeof monthlyGrantByPlan === "object") {
      for (const plan of ["basic", "pro", "premium"]) {
        if (typeof monthlyGrantByPlan[plan] === "number") {
          config.monthlyGrantByPlan[plan] = monthlyGrantByPlan[plan];
        }
      }
    }
    if (maxFreeCarryOverByPlan && typeof maxFreeCarryOverByPlan === "object") {
      for (const plan of ["basic", "pro", "premium"]) {
        if (typeof maxFreeCarryOverByPlan[plan] === "number") {
          config.maxFreeCarryOverByPlan[plan] = maxFreeCarryOverByPlan[plan];
        }
      }
    }
    if (baseBitePrice !== undefined) {
      const bbp = Number(baseBitePrice);
      if (!Number.isFinite(bbp) || bbp <= 0) {
        return res.status(400).json({ ok: false, error: "baseBitePrice debe ser un número positivo." });
      }
      config.baseBitePrice = bbp;
    }

    config.updatedBy = req.kitchenUser._id;
    config.markModified("monthlyGrantByPlan");
    config.markModified("maxFreeCarryOverByPlan");
    await config.save();

    return res.json({ ok: true, config: config.toObject() });
  } catch (error) {
    return res.status(500).json({ ok: false, error: error.message || "Error." });
  }
});

// ─── Admin: bundles CRUD ──────────────────────────────────────────────────────

router.get("/admin/bundles", requireAuth, requireDiod, async (req, res) => {
  try {
    const config = await getBitesConfig();
    return res.json({ ok: true, bundles: config.bundles || [] });
  } catch (error) {
    return res.status(500).json({ ok: false, error: error.message || "Error." });
  }
});

router.post("/admin/bundles", requireAuth, requireDiod, async (req, res) => {
  try {
    const { name, bitesAmount, price, discountPercent, badge, highlighted, active, sortOrder, stripePriceId } = req.body;
    if (!name || !bitesAmount || price == null) {
      return res.status(400).json({ ok: false, error: "name, bitesAmount y price son obligatorios." });
    }
    const parsedBites = Number(bitesAmount);
    const parsedPrice = Number(price);
    if (!Number.isFinite(parsedBites) || parsedBites < 1) {
      return res.status(400).json({ ok: false, error: "bitesAmount debe ser un entero >= 1." });
    }
    if (!Number.isFinite(parsedPrice) || parsedPrice < 0) {
      return res.status(400).json({ ok: false, error: "price no puede ser negativo." });
    }
    const parsedDiscount = discountPercent !== undefined ? Number(discountPercent) : 0;
    if (!Number.isFinite(parsedDiscount) || parsedDiscount < 0 || parsedDiscount > 95) {
      return res.status(400).json({ ok: false, error: "discountPercent debe estar entre 0 y 95." });
    }
    const priceIdTrimmed = stripePriceId ? String(stripePriceId).trim() : "";
    if (priceIdTrimmed && !priceIdTrimmed.startsWith("price_")) {
      return res.status(400).json({ ok: false, error: "stripePriceId debe comenzar con 'price_'." });
    }

    const config = await BitesConfig.findOne({ key: "bitesEconomy" });
    if (!config) return res.status(500).json({ ok: false, error: "Config no inicializada." });

    config.bundles.push({
      name: String(name).trim(),
      bitesAmount: parsedBites,
      price: parsedPrice,
      discountPercent: parsedDiscount,
      badge: badge ? String(badge).trim() : "",
      highlighted: Boolean(highlighted),
      active: active !== false,
      sortOrder: sortOrder ?? 0,
      stripePriceId: priceIdTrimmed
    });
    config.updatedBy = req.kitchenUser._id;
    await config.save();

    const newBundle = config.bundles[config.bundles.length - 1];
    return res.status(201).json({ ok: true, bundle: newBundle.toObject ? newBundle.toObject() : newBundle });
  } catch (error) {
    return res.status(500).json({ ok: false, error: error.message || "Error." });
  }
});

router.put("/admin/bundles/:bundleId", requireAuth, requireDiod, async (req, res) => {
  try {
    const config = await BitesConfig.findOne({ key: "bitesEconomy" });
    if (!config) return res.status(500).json({ ok: false, error: "Config no inicializada." });

    const bundle = config.bundles.id(req.params.bundleId);
    if (!bundle) return res.status(404).json({ ok: false, error: "Bundle no encontrado." });

    const { name, bitesAmount, price, discountPercent, badge, highlighted, active, sortOrder, stripePriceId } = req.body;
    if (name !== undefined) bundle.name = String(name).trim();
    if (bitesAmount !== undefined) {
      const v = Number(bitesAmount);
      if (!Number.isFinite(v) || v < 1) return res.status(400).json({ ok: false, error: "bitesAmount debe ser un entero >= 1." });
      bundle.bitesAmount = v;
    }
    if (price !== undefined) {
      const v = Number(price);
      if (!Number.isFinite(v) || v < 0) return res.status(400).json({ ok: false, error: "price no puede ser negativo." });
      bundle.price = v;
    }
    if (discountPercent !== undefined) {
      const v = Number(discountPercent);
      if (!Number.isFinite(v) || v < 0 || v > 95) return res.status(400).json({ ok: false, error: "discountPercent debe estar entre 0 y 95." });
      bundle.discountPercent = v;
    }
    if (badge !== undefined) bundle.badge = String(badge).trim();
    if (highlighted !== undefined) bundle.highlighted = Boolean(highlighted);
    if (active !== undefined) bundle.active = Boolean(active);
    if (sortOrder !== undefined) bundle.sortOrder = Number(sortOrder);
    if (stripePriceId !== undefined) {
      const pid = String(stripePriceId || "").trim();
      if (pid && !pid.startsWith("price_")) return res.status(400).json({ ok: false, error: "stripePriceId debe comenzar con 'price_'." });
      bundle.stripePriceId = pid;
    }

    config.updatedBy = req.kitchenUser._id;
    await config.save();

    return res.json({ ok: true, bundle: bundle.toObject ? bundle.toObject() : bundle });
  } catch (error) {
    return res.status(500).json({ ok: false, error: error.message || "Error." });
  }
});

router.delete("/admin/bundles/:bundleId", requireAuth, requireDiod, async (req, res) => {
  try {
    const config = await BitesConfig.findOne({ key: "bitesEconomy" });
    if (!config) return res.status(500).json({ ok: false, error: "Config no inicializada." });

    const bundle = config.bundles.id(req.params.bundleId);
    if (!bundle) return res.status(404).json({ ok: false, error: "Bundle no encontrado." });

    bundle.deleteOne();
    config.updatedBy = req.kitchenUser._id;
    await config.save();

    return res.json({ ok: true });
  } catch (error) {
    return res.status(500).json({ ok: false, error: error.message || "Error." });
  }
});

// ─── Admin: manual grant / remove ────────────────────────────────────────────

router.post("/admin/grant", requireAuth, requireDiod, async (req, res) => {
  try {
    const { householdId, amount, bucket, reason } = req.body;

    if (!householdId || !mongoose.isValidObjectId(String(householdId))) {
      return res.status(400).json({ ok: false, error: "householdId inválido." });
    }
    if (typeof amount !== "number" || amount === 0 || !Number.isFinite(amount)) {
      return res.status(400).json({ ok: false, error: "amount debe ser un número no-cero." });
    }
    if (!reason || String(reason).trim().length < 3) {
      return res.status(400).json({ ok: false, error: "reason es obligatorio (mínimo 3 caracteres)." });
    }

    const result = await adminGrantBites(
      String(householdId),
      amount,
      bucket || "free",
      String(reason).trim(),
      req.kitchenUser._id
    );
    return res.json({ ok: true, ...result });
  } catch (error) {
    return res.status(error.statusCode || 500).json({ ok: false, error: error.message || "Error." });
  }
});

// ─── Admin: monthly grant trigger ────────────────────────────────────────────

router.post("/admin/monthly-grant/:householdId", requireAuth, requireDiod, async (req, res) => {
  try {
    if (!mongoose.isValidObjectId(req.params.householdId)) {
      return res.status(400).json({ ok: false, error: "householdId inválido." });
    }
    const result = await grantMonthlyBites(req.params.householdId, req.kitchenUser._id);
    return res.json({ ok: true, ...result });
  } catch (error) {
    return res.status(error.statusCode || 500).json({ ok: false, error: error.message || "Error." });
  }
});

// ─── Admin: transactions ──────────────────────────────────────────────────────

router.get("/admin/transactions", requireAuth, requireDiod, async (req, res) => {
  try {
    const limit = Math.min(parseInt(req.query.limit || "50", 10), 200);
    const filter = {};
    if (req.query.householdId && mongoose.isValidObjectId(req.query.householdId)) {
      filter.householdId = req.query.householdId;
    }

    const transactions = await BitesTransaction.find(filter)
      .sort({ createdAt: -1 })
      .limit(limit)
      .lean();

    return res.json({ ok: true, transactions });
  } catch (error) {
    return res.status(500).json({ ok: false, error: error.message || "Error." });
  }
});

export default router;
