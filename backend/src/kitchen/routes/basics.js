/**
 * /api/kitchen/basics
 * Household "Básicos de compra" — recurring shopping items.
 * Pro / Premium only (Basic users see teaser via frontend gating).
 */
import express from "express";
import { requireAuth } from "../middleware.js";
import { getEffectiveHouseholdId, handleHouseholdError } from "../householdScope.js";
import { HouseholdBasic } from "../models/HouseholdBasic.js";
import { KitchenShoppingList } from "../models/KitchenShoppingList.js";
import { Category } from "../models/Category.js";
import { Household } from "../models/Household.js";
import { normalizeIngredientName } from "../utils/normalize.js";
import { canUseBasicsFeature } from "../subscriptionService.js";
import { ensureShoppingList } from "../shoppingService.js";
import { getWeekStart, parseISODate } from "../utils/dates.js";
import {
  DEFAULT_CATEGORY_COLOR_BG,
  DEFAULT_CATEGORY_COLOR_TEXT,
  DEFAULT_CATEGORY_NAME,
  DEFAULT_CATEGORY_SLUG,
  ensureDefaultCategory
} from "../utils/categoryMatching.js";
import mongoose from "mongoose";

const router = express.Router();

// ─── Default seed items ───────────────────────────────────────────────────────
const DEFAULT_BASICS = [
  { name: "Huevos", emoji: "🥚", order: 0 },
  { name: "Leche entera", emoji: "🥛", order: 1 },
  { name: "Leche semidesnatada", emoji: "🥛", order: 2 },
  { name: "Pan de molde", emoji: "🍞", order: 3 },
  { name: "Café", emoji: "☕", order: 4 },
  { name: "Papel de cocina", emoji: "🧻", order: 5 },
  { name: "Papel higiénico", emoji: "🧻", order: 6 }
];

// ─── Helpers ──────────────────────────────────────────────────────────────────

function isValidObjectId(value) {
  return Boolean(value) && mongoose.isValidObjectId(value);
}

/**
 * Seed default basics for a household if they have none yet.
 * Safe to call multiple times — uses upsert per canonicalName.
 */
export async function seedDefaultBasics(householdId) {
  const existing = await HouseholdBasic.countDocuments({ householdId });
  if (existing > 0) return;
  const docs = DEFAULT_BASICS.map((b) => ({
    householdId,
    name: b.name,
    canonicalName: normalizeIngredientName(b.name),
    emoji: b.emoji || "",
    active: true,
    order: b.order
  }));
  await HouseholdBasic.insertMany(docs, { ordered: false }).catch(() => {});
}

async function resolveBasicsAccess(effectiveHouseholdId) {
  const household = await Household.findById(effectiveHouseholdId).select("subscriptionPlan").lean();
  const plan = household?.subscriptionPlan || "basic";
  return {
    household,
    basicsFeatureEnabled: canUseBasicsFeature(plan),
    plan
  };
}

// ─── Routes ───────────────────────────────────────────────────────────────────

/**
 * GET /api/kitchen/basics
 * Returns all basics for the current household (ordered by order, name).
 * Works for all plans — frontend decides gating/teaser rendering.
 */
router.get("/", requireAuth, async (req, res) => {
  try {
    const effectiveHouseholdId = getEffectiveHouseholdId(req.user);
    const { basicsFeatureEnabled, plan } = await resolveBasicsAccess(effectiveHouseholdId);

    if (basicsFeatureEnabled) {
      // Auto-seed on first access
      await seedDefaultBasics(effectiveHouseholdId);
    }

    const basics = await HouseholdBasic.find({ householdId: effectiveHouseholdId })
      .sort({ order: 1, name: 1 })
      .lean();

    return res.json({
      ok: true,
      basicsFeatureEnabled,
      plan,
      basics: basics.map((b) => ({
        id: String(b._id),
        name: b.name,
        canonicalName: b.canonicalName,
        categoryId: b.categoryId ? String(b.categoryId) : null,
        emoji: b.emoji || "",
        active: b.active !== false,
        order: b.order ?? 0
      }))
    });
  } catch (err) {
    const handled = handleHouseholdError(res, err);
    if (handled) return handled;
    return res.status(500).json({ ok: false, error: "No se pudieron cargar los básicos." });
  }
});

/**
 * POST /api/kitchen/basics
 * Create a new basic item.
 */
router.post("/", requireAuth, async (req, res) => {
  try {
    const effectiveHouseholdId = getEffectiveHouseholdId(req.user);
    const { basicsFeatureEnabled } = await resolveBasicsAccess(effectiveHouseholdId);
    if (!basicsFeatureEnabled) {
      return res.status(403).json({ ok: false, code: "BASICS_NOT_AVAILABLE", error: "Los básicos requieren plan Pro o Premium." });
    }

    const { name, emoji, categoryId, order } = req.body || {};
    const trimmedName = String(name || "").trim();
    if (!trimmedName || trimmedName.length > 120) {
      return res.status(400).json({ ok: false, error: "Nombre inválido." });
    }

    const canonicalName = normalizeIngredientName(trimmedName);
    const existing = await HouseholdBasic.findOne({ householdId: effectiveHouseholdId, canonicalName });
    if (existing) {
      return res.status(409).json({ ok: false, code: "ALREADY_EXISTS", error: "Ya existe un básico con ese nombre." });
    }

    const resolvedCategoryId = isValidObjectId(categoryId) ? categoryId : null;
    const lastBasic = await HouseholdBasic.findOne({ householdId: effectiveHouseholdId }).sort({ order: -1 }).lean();
    const nextOrder = typeof order === "number" ? order : ((lastBasic?.order ?? -1) + 1);

    const basic = await HouseholdBasic.create({
      householdId: effectiveHouseholdId,
      name: trimmedName,
      canonicalName,
      emoji: String(emoji || "").slice(0, 8),
      categoryId: resolvedCategoryId,
      active: true,
      order: nextOrder
    });

    return res.status(201).json({
      ok: true,
      basic: {
        id: String(basic._id),
        name: basic.name,
        canonicalName: basic.canonicalName,
        categoryId: basic.categoryId ? String(basic.categoryId) : null,
        emoji: basic.emoji || "",
        active: basic.active,
        order: basic.order
      }
    });
  } catch (err) {
    const handled = handleHouseholdError(res, err);
    if (handled) return handled;
    return res.status(500).json({ ok: false, error: "No se pudo crear el básico." });
  }
});

/**
 * PUT /api/kitchen/basics/:id
 * Update a basic (name, emoji, categoryId, active, order).
 */
router.put("/:id", requireAuth, async (req, res) => {
  try {
    const effectiveHouseholdId = getEffectiveHouseholdId(req.user);
    const { basicsFeatureEnabled } = await resolveBasicsAccess(effectiveHouseholdId);
    if (!basicsFeatureEnabled) {
      return res.status(403).json({ ok: false, code: "BASICS_NOT_AVAILABLE", error: "Los básicos requieren plan Pro o Premium." });
    }

    if (!isValidObjectId(req.params.id)) {
      return res.status(400).json({ ok: false, error: "ID inválido." });
    }

    const basic = await HouseholdBasic.findOne({ _id: req.params.id, householdId: effectiveHouseholdId });
    if (!basic) {
      return res.status(404).json({ ok: false, error: "Básico no encontrado." });
    }

    const { name, emoji, categoryId, active, order } = req.body || {};

    if (name !== undefined) {
      const trimmedName = String(name || "").trim();
      if (!trimmedName || trimmedName.length > 120) {
        return res.status(400).json({ ok: false, error: "Nombre inválido." });
      }
      const newCanonical = normalizeIngredientName(trimmedName);
      // Ensure no duplicate canonical name (excluding current doc)
      const dup = await HouseholdBasic.findOne({
        householdId: effectiveHouseholdId,
        canonicalName: newCanonical,
        _id: { $ne: basic._id }
      });
      if (dup) {
        return res.status(409).json({ ok: false, code: "ALREADY_EXISTS", error: "Ya existe un básico con ese nombre." });
      }
      basic.name = trimmedName;
      basic.canonicalName = newCanonical;
    }
    if (emoji !== undefined) basic.emoji = String(emoji || "").slice(0, 8);
    if (categoryId !== undefined) basic.categoryId = isValidObjectId(categoryId) ? categoryId : null;
    if (active !== undefined) basic.active = Boolean(active);
    if (typeof order === "number") basic.order = order;

    await basic.save();

    return res.json({
      ok: true,
      basic: {
        id: String(basic._id),
        name: basic.name,
        canonicalName: basic.canonicalName,
        categoryId: basic.categoryId ? String(basic.categoryId) : null,
        emoji: basic.emoji || "",
        active: basic.active,
        order: basic.order
      }
    });
  } catch (err) {
    const handled = handleHouseholdError(res, err);
    if (handled) return handled;
    return res.status(500).json({ ok: false, error: "No se pudo actualizar el básico." });
  }
});

/**
 * DELETE /api/kitchen/basics/:id
 * Permanently delete a basic.
 */
router.delete("/:id", requireAuth, async (req, res) => {
  try {
    const effectiveHouseholdId = getEffectiveHouseholdId(req.user);
    const { basicsFeatureEnabled } = await resolveBasicsAccess(effectiveHouseholdId);
    if (!basicsFeatureEnabled) {
      return res.status(403).json({ ok: false, code: "BASICS_NOT_AVAILABLE", error: "Los básicos requieren plan Pro o Premium." });
    }

    if (!isValidObjectId(req.params.id)) {
      return res.status(400).json({ ok: false, error: "ID inválido." });
    }

    const result = await HouseholdBasic.deleteOne({ _id: req.params.id, householdId: effectiveHouseholdId });
    if (result.deletedCount === 0) {
      return res.status(404).json({ ok: false, error: "Básico no encontrado." });
    }

    return res.json({ ok: true });
  } catch (err) {
    const handled = handleHouseholdError(res, err);
    if (handled) return handled;
    return res.status(500).json({ ok: false, error: "No se pudo eliminar el básico." });
  }
});

/**
 * POST /api/kitchen/basics/apply
 * Add selected basics to the shopping list for a given week.
 * Returns the full updated shopping list payload.
 *
 * Body: { weekStart: "YYYY-MM-DD", selectedIds: ["id1", "id2", ...] }
 */
router.post("/apply", requireAuth, async (req, res) => {
  try {
    const effectiveHouseholdId = getEffectiveHouseholdId(req.user);
    const { basicsFeatureEnabled } = await resolveBasicsAccess(effectiveHouseholdId);
    if (!basicsFeatureEnabled) {
      return res.status(403).json({ ok: false, code: "BASICS_NOT_AVAILABLE", error: "Los básicos requieren plan Pro o Premium." });
    }

    const { weekStart: weekStartParam, selectedIds } = req.body || {};
    if (!weekStartParam) {
      return res.status(400).json({ ok: false, error: "weekStart requerido." });
    }
    const weekStartDate = parseISODate(weekStartParam);
    if (!weekStartDate) {
      return res.status(400).json({ ok: false, error: "Fecha inválida." });
    }
    const monday = getWeekStart(weekStartDate);

    const ids = Array.isArray(selectedIds) ? selectedIds.filter((id) => isValidObjectId(id)) : [];
    if (ids.length === 0) {
      return res.json({ ok: true, addedCount: 0, skippedCount: 0 });
    }

    // Fetch selected basics
    const basics = await HouseholdBasic.find({
      _id: { $in: ids },
      householdId: effectiveHouseholdId,
      active: true
    }).lean();

    if (basics.length === 0) {
      return res.json({ ok: true, addedCount: 0, skippedCount: 0 });
    }

    // Get or create shopping list
    const list = await ensureShoppingList(monday, effectiveHouseholdId);

    // Build set of pending canonical names already in the list
    const pendingCanonicals = new Set(
      list.items
        .filter((item) => item.status === "pending")
        .map((item) => String(item.canonicalName || "").trim().toLowerCase())
    );

    // Ensure a fallback category exists
    const fallbackCategory = await ensureDefaultCategory({ Category, householdId: effectiveHouseholdId });
    const fallbackCategoryId = fallbackCategory?._id || null;

    let addedCount = 0;
    let skippedCount = 0;

    for (const basic of basics) {
      const canonical = String(basic.canonicalName || "").trim().toLowerCase();
      if (pendingCanonicals.has(canonical)) {
        skippedCount++;
        continue;
      }

      // Resolve category: use basic's category if set and valid, else fallback
      let resolvedCategoryId = null;
      if (basic.categoryId) {
        const catExists = await Category.findOne({
          _id: basic.categoryId,
          active: true,
          isArchived: { $ne: true }
        }).select("_id").lean();
        resolvedCategoryId = catExists ? basic.categoryId : fallbackCategoryId;
      } else {
        resolvedCategoryId = fallbackCategoryId;
      }

      list.items.push({
        ingredientId: null,
        categoryId: resolvedCategoryId,
        displayName: basic.name,
        canonicalName: canonical,
        occurrences: 1,
        status: "pending",
        fromDishes: []
      });

      pendingCanonicals.add(canonical);
      addedCount++;
    }

    await list.save();

    return res.json({ ok: true, addedCount, skippedCount });
  } catch (err) {
    const handled = handleHouseholdError(res, err);
    if (handled) return handled;
    console.error("[basics] apply error", err?.message, err?.stack);
    return res.status(500).json({ ok: false, error: "No se pudieron añadir los básicos." });
  }
});

export default router;
