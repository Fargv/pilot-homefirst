/**
 * /api/kitchen/basics
 * Household "Básicos de compra" — recurring shopping items.
 *
 * Every Basic MUST be linked to a real KitchenIngredient.
 * The ingredient provides name, canonicalName, and category;
 * these are cached on HouseholdBasic for display performance.
 *
 * Pro / Premium only (Basic users see teaser via frontend gating).
 */
import express from "express";
import { requireAuth } from "../middleware.js";
import { getEffectiveHouseholdId, handleHouseholdError } from "../householdScope.js";
import { HouseholdBasic } from "../models/HouseholdBasic.js";
import { KitchenIngredient } from "../models/KitchenIngredient.js";
import { Category } from "../models/Category.js";
import { Household } from "../models/Household.js";
import { canUseBasicsFeature } from "../subscriptionService.js";
import { ensureShoppingList } from "../shoppingService.js";
import { getWeekStart, parseISODate } from "../utils/dates.js";
import { ensureDefaultCategory } from "../utils/categoryMatching.js";
import { CATALOG_SCOPES } from "../utils/catalogScopes.js";
import mongoose from "mongoose";

const router = express.Router();

// ─── Helpers ──────────────────────────────────────────────────────────────────

function isValidObjectId(value) {
  return Boolean(value) && mongoose.isValidObjectId(value);
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

/**
 * Build the visibility filter for ingredients visible to a household.
 */
function buildIngredientVisibilityFilter(effectiveHouseholdId, extra = {}) {
  return {
    ...extra,
    isArchived: { $ne: true },
    active: true,
    $or: [
      { scope: CATALOG_SCOPES.MASTER, householdId: null },
      { scope: CATALOG_SCOPES.HOUSEHOLD, householdId: effectiveHouseholdId },
      { scope: CATALOG_SCOPES.OVERRIDE, householdId: effectiveHouseholdId }
    ]
  };
}

function serializeBasic(basic) {
  return {
    id: String(basic._id),
    ingredientId: basic.ingredientId ? String(basic.ingredientId) : null,
    name: basic.name,
    canonicalName: basic.canonicalName,
    categoryId: basic.categoryId ? String(basic.categoryId) : null,
    emoji: basic.emoji || "",
    active: basic.active !== false,
    order: basic.order ?? 0
  };
}

// ─── Routes ───────────────────────────────────────────────────────────────────

/**
 * GET /api/kitchen/basics
 * Returns all basics for the current household that have a valid ingredientId.
 * Legacy free-text basics (no ingredientId) are silently excluded.
 * Works for all plans — frontend decides gating/teaser rendering.
 */
router.get("/", requireAuth, async (req, res) => {
  try {
    const effectiveHouseholdId = getEffectiveHouseholdId(req.user);
    const { basicsFeatureEnabled, plan } = await resolveBasicsAccess(effectiveHouseholdId);

    // Only return basics linked to real ingredients
    const basics = await HouseholdBasic.find({
      householdId: effectiveHouseholdId,
      ingredientId: { $ne: null }
    })
      .sort({ order: 1, name: 1 })
      .lean();

    return res.json({
      ok: true,
      basicsFeatureEnabled,
      plan,
      basics: basics.map(serializeBasic)
    });
  } catch (err) {
    const handled = handleHouseholdError(res, err);
    if (handled) return handled;
    return res.status(500).json({ ok: false, error: "No se pudieron cargar los básicos." });
  }
});

/**
 * POST /api/kitchen/basics
 * Create a new basic linked to a real ingredient.
 * Body: { ingredientId: string, emoji?: string }
 */
router.post("/", requireAuth, async (req, res) => {
  try {
    const effectiveHouseholdId = getEffectiveHouseholdId(req.user);
    const { basicsFeatureEnabled } = await resolveBasicsAccess(effectiveHouseholdId);
    if (!basicsFeatureEnabled) {
      return res.status(403).json({
        ok: false,
        code: "BASICS_NOT_AVAILABLE",
        error: "Los básicos requieren plan Pro o Premium."
      });
    }

    const { ingredientId, emoji, order } = req.body || {};

    if (!isValidObjectId(ingredientId)) {
      return res.status(400).json({ ok: false, error: "Debes seleccionar un ingrediente válido." });
    }

    // Validate ingredient is visible to this household
    const ingredient = await KitchenIngredient.findOne(
      buildIngredientVisibilityFilter(effectiveHouseholdId, { _id: ingredientId })
    ).select("_id name canonicalName categoryId").lean();

    if (!ingredient) {
      return res.status(404).json({ ok: false, error: "Ingrediente no encontrado." });
    }

    // Prevent duplicate basics for the same ingredient
    const existing = await HouseholdBasic.findOne({
      householdId: effectiveHouseholdId,
      ingredientId: ingredient._id
    }).lean();
    if (existing) {
      // Return the existing one (idempotent — useful when user adds from popup)
      return res.status(200).json({ ok: true, basic: serializeBasic(existing), alreadyExists: true });
    }

    const lastBasic = await HouseholdBasic.findOne({ householdId: effectiveHouseholdId })
      .sort({ order: -1 })
      .lean();
    const nextOrder = typeof order === "number" ? order : ((lastBasic?.order ?? -1) + 1);

    const basic = await HouseholdBasic.create({
      householdId: effectiveHouseholdId,
      ingredientId: ingredient._id,
      name: ingredient.name,
      canonicalName: ingredient.canonicalName,
      categoryId: ingredient.categoryId || null,
      emoji: String(emoji || "").slice(0, 8),
      active: true,
      order: nextOrder
    });

    return res.status(201).json({ ok: true, basic: serializeBasic(basic) });
  } catch (err) {
    // Duplicate key (race condition) — treat as already exists
    if (err?.code === 11000) {
      try {
        const existing = await HouseholdBasic.findOne({
          householdId: getEffectiveHouseholdId(req.user),
          ingredientId: req.body?.ingredientId
        }).lean();
        if (existing) return res.json({ ok: true, basic: serializeBasic(existing), alreadyExists: true });
      } catch { /* fall through */ }
    }
    const handled = handleHouseholdError(res, err);
    if (handled) return handled;
    return res.status(500).json({ ok: false, error: "No se pudo crear el básico." });
  }
});

/**
 * PUT /api/kitchen/basics/:id
 * Update a basic's display preferences (active, order, emoji).
 * Name and category are owned by the ingredient and cannot be overridden here.
 */
router.put("/:id", requireAuth, async (req, res) => {
  try {
    const effectiveHouseholdId = getEffectiveHouseholdId(req.user);
    const { basicsFeatureEnabled } = await resolveBasicsAccess(effectiveHouseholdId);
    if (!basicsFeatureEnabled) {
      return res.status(403).json({
        ok: false,
        code: "BASICS_NOT_AVAILABLE",
        error: "Los básicos requieren plan Pro o Premium."
      });
    }

    if (!isValidObjectId(req.params.id)) {
      return res.status(400).json({ ok: false, error: "ID inválido." });
    }

    const basic = await HouseholdBasic.findOne({ _id: req.params.id, householdId: effectiveHouseholdId });
    if (!basic) {
      return res.status(404).json({ ok: false, error: "Básico no encontrado." });
    }

    const { emoji, active, order } = req.body || {};
    if (emoji !== undefined) basic.emoji = String(emoji || "").slice(0, 8);
    if (active !== undefined) basic.active = Boolean(active);
    if (typeof order === "number") basic.order = order;

    await basic.save();
    return res.json({ ok: true, basic: serializeBasic(basic) });
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
      return res.status(403).json({
        ok: false,
        code: "BASICS_NOT_AVAILABLE",
        error: "Los básicos requieren plan Pro o Premium."
      });
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
 * Uses ingredientId for accurate deduplication against the existing list.
 *
 * Body: { weekStart: "YYYY-MM-DD", selectedIds: ["basicId1", "basicId2", ...] }
 * Returns: { ok, addedCount, skippedCount }
 */
router.post("/apply", requireAuth, async (req, res) => {
  try {
    const effectiveHouseholdId = getEffectiveHouseholdId(req.user);
    const { basicsFeatureEnabled } = await resolveBasicsAccess(effectiveHouseholdId);
    if (!basicsFeatureEnabled) {
      return res.status(403).json({
        ok: false,
        code: "BASICS_NOT_AVAILABLE",
        error: "Los básicos requieren plan Pro o Premium."
      });
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

    const ids = Array.isArray(selectedIds)
      ? selectedIds.filter((id) => isValidObjectId(id))
      : [];
    if (ids.length === 0) {
      return res.json({ ok: true, addedCount: 0, skippedCount: 0 });
    }

    // Fetch selected basics (must have a real ingredientId)
    const basics = await HouseholdBasic.find({
      _id: { $in: ids },
      householdId: effectiveHouseholdId,
      active: true,
      ingredientId: { $ne: null }
    }).lean();

    if (basics.length === 0) {
      return res.json({ ok: true, addedCount: 0, skippedCount: 0 });
    }

    const list = await ensureShoppingList(monday, effectiveHouseholdId);

    // Build fast-lookup sets from the current pending items
    const pendingIngredientIds = new Set(
      list.items
        .filter((item) => item.status === "pending" && item.ingredientId)
        .map((item) => String(item.ingredientId))
    );
    const pendingCanonicals = new Set(
      list.items
        .filter((item) => item.status === "pending")
        .map((item) => String(item.canonicalName || "").trim().toLowerCase())
    );

    const fallbackCategory = await ensureDefaultCategory({ Category, householdId: effectiveHouseholdId });
    const fallbackCategoryId = fallbackCategory?._id || null;

    let addedCount = 0;
    let skippedCount = 0;

    for (const basic of basics) {
      const ingIdStr = String(basic.ingredientId);
      const canonical = String(basic.canonicalName || "").trim().toLowerCase();

      // Skip if already pending (by ingredientId or canonicalName)
      if (pendingIngredientIds.has(ingIdStr) || pendingCanonicals.has(canonical)) {
        skippedCount++;
        continue;
      }

      // Resolve best category: from the basic cache (synced from ingredient), else fallback
      let resolvedCategoryId = fallbackCategoryId;
      if (basic.categoryId) {
        const catExists = await Category.findOne({
          _id: basic.categoryId,
          active: true,
          isArchived: { $ne: true }
        })
          .select("_id")
          .lean();
        resolvedCategoryId = catExists ? basic.categoryId : fallbackCategoryId;
      }

      list.items.push({
        ingredientId: basic.ingredientId,
        categoryId: resolvedCategoryId,
        displayName: basic.name,
        canonicalName: canonical,
        occurrences: 1,
        status: "pending",
        fromDishes: []
      });

      pendingIngredientIds.add(ingIdStr);
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
