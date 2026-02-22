import express from "express";
import { KitchenIngredient } from "../models/KitchenIngredient.js";
import { Category } from "../models/Category.js";
import { requireAuth } from "../middleware.js";
import { normalizeIngredientName } from "../utils/normalize.js";
import { getEffectiveHouseholdId, getOptionalHouseholdId, handleHouseholdError } from "../householdScope.js";
import {
  CATALOG_SCOPES,
  clearHiddenMasterForHousehold,
  hideMasterForHousehold,
  isDiodUser,
  resolveCatalogForHousehold
} from "../utils/catalogScopes.js";
import { ensureDefaultCategory } from "../utils/categoryMatching.js";
import { KitchenDish } from "../models/KitchenDish.js";
import { KitchenWeekPlan } from "../models/KitchenWeekPlan.js";
import { getWeekStart } from "../utils/dates.js";

const router = express.Router();
const MAX_RESULTS = 15;
const escapeRegex = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const ACCENT_CHAR_MAP = {
  a: "aàáâäãå",
  e: "eèéêë",
  i: "iìíîï",
  o: "oòóôöõ",
  u: "uùúûü",
  n: "nñ",
  c: "cç"
};

const buildAccentInsensitiveRegex = (value) => {
  const escaped = escapeRegex(value);
  const pattern = escaped
    .split("")
    .map((char) => {
      const lower = char.toLowerCase();
      if (ACCENT_CHAR_MAP[lower]) {
        return `[${ACCENT_CHAR_MAP[lower]}]`;
      }
      return char;
    })
    .join("");
  return new RegExp(pattern, "i");
};

async function ensureCategoryScope({ categoryId, effectiveHouseholdId, isMasterWrite = false }) {
  if (!categoryId) {
    return ensureDefaultCategory({
      Category,
      householdId: effectiveHouseholdId,
      scope: isMasterWrite ? CATALOG_SCOPES.MASTER : CATALOG_SCOPES.HOUSEHOLD
    });
  }

  const scopeFilters = [{ scope: CATALOG_SCOPES.MASTER }];
  if (effectiveHouseholdId) {
    scopeFilters.push({ householdId: effectiveHouseholdId });
  }

  const category = await Category.findOne({
    _id: categoryId,
    isArchived: { $ne: true },
    $or: scopeFilters
  });

  return category;
}

async function syncIngredientReferences({ ingredientId, name, canonicalName, householdId }) {
  const dishFilter = {
    "ingredients.ingredientId": ingredientId,
    isArchived: { $ne: true }
  };

  if (householdId) {
    dishFilter.$or = [
      { scope: CATALOG_SCOPES.MASTER },
      { householdId },
      { scope: CATALOG_SCOPES.OVERRIDE, householdId }
    ];
  }

  await KitchenDish.updateMany(
    dishFilter,
    {
      $set: {
        "ingredients.$[entry].displayName": name,
        "ingredients.$[entry].canonicalName": canonicalName
      }
    },
    {
      arrayFilters: [{ "entry.ingredientId": ingredientId }]
    }
  );

  const todayWeekStart = getWeekStart(new Date());
  const weekFilter = {
    weekStart: { $gte: todayWeekStart },
    "days.ingredientOverrides.ingredientId": ingredientId
  };
  if (householdId) weekFilter.householdId = householdId;

  await KitchenWeekPlan.updateMany(
    weekFilter,
    {
      $set: {
        "days.$[].ingredientOverrides.$[entry].displayName": name,
        "days.$[].ingredientOverrides.$[entry].canonicalName": canonicalName
      }
    },
    {
      arrayFilters: [{ "entry.ingredientId": ingredientId }]
    }
  );
}

function buildSearchFilter(q) {
  if (!q) return {};

  const trimmed = String(q).trim();
  const normalized = normalizeIngredientName(trimmed);
  const normalizedRegex = normalized ? new RegExp(escapeRegex(normalized), "i") : null;
  const normalizedFallback =
    normalized && normalized.length > 4 ? new RegExp(escapeRegex(normalized.slice(0, -1)), "i") : null;
  const nameRegex = trimmed ? buildAccentInsensitiveRegex(trimmed) : null;
  const orFilters = [];
  if (normalizedRegex) orFilters.push({ canonicalName: normalizedRegex });
  if (normalizedFallback) orFilters.push({ canonicalName: normalizedFallback });
  if (nameRegex) orFilters.push({ name: nameRegex });
  if (!orFilters.length) return {};

  return { $or: orFilters };
}

router.get("/", requireAuth, async (req, res) => {
  try {
    const { q, includeInactive, limit, mode } = req.query;
    const effectiveHouseholdId = getOptionalHouseholdId(req.user);
    const shouldIncludeInactive = String(includeInactive || "").toLowerCase() === "true";

    const ingredients = await resolveCatalogForHousehold({
      Model: KitchenIngredient,
      householdId: effectiveHouseholdId,
      type: "ingredient",
      baseFilter: buildSearchFilter(q),
      masterFilter: shouldIncludeInactive ? {} : { active: true },
      householdFilter: shouldIncludeInactive ? {} : { active: true },
      overrideFilter: shouldIncludeInactive ? {} : { active: true },
      populate: { path: "categoryId", select: "name slug colorBg colorText" },
      sort: { name: 1 }
    });

    let filteredIngredients = ingredients;
    if (String(mode || "").toLowerCase() === "recipe") {
      const allowedCategories = await resolveCatalogForHousehold({
        Model: Category,
        householdId: effectiveHouseholdId,
        type: "category",
        masterFilter: { active: true, forRecipes: true },
        householdFilter: { active: true, forRecipes: true },
        overrideFilter: { active: true, forRecipes: true },
        sort: { order: 1, name: 1 }
      });
      const allowedIds = new Set(allowedCategories.map((category) => String(category._id)));
      filteredIngredients = ingredients.filter((ingredient) => {
        const categoryValue = ingredient?.categoryId?._id || ingredient?.categoryId;
        return categoryValue && allowedIds.has(String(categoryValue));
      });
    }

    const limitValue = Number.parseInt(limit, 10);
    const resolvedIngredients =
      !Number.isNaN(limitValue) && limitValue > 0
        ? filteredIngredients.slice(0, limitValue)
        : !limit
          ? filteredIngredients.slice(0, MAX_RESULTS)
          : filteredIngredients;

    return res.json({ ok: true, ingredients: resolvedIngredients });
  } catch (error) {
    const handled = handleHouseholdError(res, error);
    if (handled) return handled;
    return res.status(500).json({ ok: false, error: "No se pudieron cargar los ingredientes." });
  }
});

router.post("/", requireAuth, async (req, res) => {
  try {
    const { name, categoryId, canonicalName: canonicalInput, scope } = req.body;
    if (!name) return res.status(400).json({ ok: false, error: "El nombre del ingrediente es obligatorio." });

    const isDiod = isDiodUser(req.kitchenUser);
    const requestedMasterWrite = scope === CATALOG_SCOPES.MASTER;
    const isMasterWrite = isDiod && requestedMasterWrite;
    if (requestedMasterWrite && !isDiod) {
      return res.status(403).json({ ok: false, error: "Solo DIOD puede crear ingredientes master." });
    }

    const effectiveHouseholdId = isMasterWrite ? getOptionalHouseholdId(req.user) : getEffectiveHouseholdId(req.user);
    const category = await ensureCategoryScope({ categoryId, effectiveHouseholdId });
    if (!category) {
      return res.status(404).json({ ok: false, error: "Categoría no encontrada para el hogar actual." });
    }

    const trimmedName = String(name).trim();
    const canonicalName = normalizeIngredientName(canonicalInput || trimmedName);
    if (!canonicalName)
      return res.status(400).json({ ok: false, error: "El nombre del ingrediente no es válido." });

    const duplicateFilter = {
      canonicalName: new RegExp(`^${escapeRegex(canonicalName)}$`, "i"),
      scope: isMasterWrite ? CATALOG_SCOPES.MASTER : CATALOG_SCOPES.HOUSEHOLD,
      isArchived: { $ne: true }
    };
    if (!isMasterWrite) duplicateFilter.householdId = effectiveHouseholdId;

    const existing = await KitchenIngredient.findOne(duplicateFilter).populate("categoryId", "name slug colorBg colorText");

    if (existing) return res.json({ ok: true, ingredient: existing, created: false });

    const ingredient = await KitchenIngredient.create({
      name: trimmedName,
      canonicalName,
      categoryId: category._id,
      scope: isMasterWrite ? CATALOG_SCOPES.MASTER : CATALOG_SCOPES.HOUSEHOLD,
      householdId: isMasterWrite ? undefined : effectiveHouseholdId
    });

    const populatedIngredient = await KitchenIngredient.findById(ingredient._id).populate(
      "categoryId",
      "name slug colorBg colorText"
    );

    if (!isMasterWrite) {
      await clearHiddenMasterForHousehold({ householdId: effectiveHouseholdId, type: "ingredient", masterId: ingredient._id });
    }

    return res.status(201).json({ ok: true, ingredient: populatedIngredient, created: true });
  } catch (error) {
    const handled = handleHouseholdError(res, error);
    if (handled) return handled;
    return res.status(500).json({ ok: false, error: "No se pudo crear el ingrediente." });
  }
});

router.put("/:id", requireAuth, async (req, res) => {
  try {
    const { id } = req.params;
    const { name, categoryId, active, canonicalName: canonicalInput } = req.body;
    if (!name) return res.status(400).json({ ok: false, error: "El nombre del ingrediente es obligatorio." });
    if (typeof active !== "boolean")
      return res.status(400).json({ ok: false, error: "Indica si el ingrediente está activo." });

    const optionalHouseholdId = getOptionalHouseholdId(req.user);
    const isDiod = isDiodUser(req.kitchenUser);

    const target = await KitchenIngredient.findById(id);
    if (!target || target.isArchived) {
      return res.status(404).json({ ok: false, error: "Ingrediente no encontrado." });
    }

    const effectiveHouseholdId = target.scope === CATALOG_SCOPES.MASTER ? optionalHouseholdId : getEffectiveHouseholdId(req.user);
    const category = await ensureCategoryScope({ categoryId, effectiveHouseholdId });
    if (!category) {
      return res.status(404).json({ ok: false, error: "Categoría no encontrada para el hogar actual." });
    }

    const trimmedName = String(name).trim();
    const canonicalName = normalizeIngredientName(canonicalInput || trimmedName);
    if (!canonicalName)
      return res.status(400).json({ ok: false, error: "El nombre del ingrediente no es válido." });

    const nextData = {
      name: trimmedName,
      canonicalName,
      categoryId: category._id,
      active
    };

    if (target.scope === CATALOG_SCOPES.MASTER) {
      if (isDiod) {
        Object.assign(target, nextData);
        await target.save();
        await syncIngredientReferences({ ingredientId: target._id, name: trimmedName, canonicalName, householdId: optionalHouseholdId });
        const ingredient = await KitchenIngredient.findById(target._id).populate("categoryId", "name slug colorBg colorText");
        return res.json({ ok: true, ingredient });
      }

      const requiredHouseholdId = getEffectiveHouseholdId(req.user);
      const ingredient = await KitchenIngredient.findOneAndUpdate(
        {
          householdId: requiredHouseholdId,
          scope: CATALOG_SCOPES.OVERRIDE,
          masterId: target._id
        },
        {
          ...nextData,
          householdId: requiredHouseholdId,
          scope: CATALOG_SCOPES.OVERRIDE,
          masterId: target._id,
          isArchived: false
        },
        { upsert: true, new: true, setDefaultsOnInsert: true }
      ).populate("categoryId", "name slug colorBg colorText");

      await syncIngredientReferences({ ingredientId: ingredient._id, name: trimmedName, canonicalName, householdId: requiredHouseholdId });

      await clearHiddenMasterForHousehold({ householdId: requiredHouseholdId, type: "ingredient", masterId: target._id });
      return res.json({ ok: true, ingredient, overridden: true });
    }

    if (!target.householdId || String(target.householdId) !== String(getEffectiveHouseholdId(req.user))) {
      return res.status(403).json({ ok: false, error: "No tienes permisos para modificar este ingrediente." });
    }

    Object.assign(target, nextData);
    await target.save();
    await syncIngredientReferences({ ingredientId: target._id, name: trimmedName, canonicalName, householdId: getEffectiveHouseholdId(req.user) });
    const ingredient = await KitchenIngredient.findById(target._id).populate("categoryId", "name slug colorBg colorText");

    return res.json({ ok: true, ingredient });
  } catch (error) {
    const handled = handleHouseholdError(res, error);
    if (handled) return handled;
    return res.status(500).json({ ok: false, error: "No se pudo actualizar el ingrediente." });
  }
});

router.delete("/:id", requireAuth, async (req, res) => {
  try {
    const { id } = req.params;
    getOptionalHouseholdId(req.user);
    const isDiod = isDiodUser(req.kitchenUser);
    const target = await KitchenIngredient.findById(id);

    if (!target || target.isArchived) {
      return res.status(404).json({ ok: false, error: "Ingrediente no encontrado." });
    }

    if (target.scope === CATALOG_SCOPES.MASTER) {
      if (isDiod) {
        target.isArchived = true;
        await target.save();
      } else {
        await hideMasterForHousehold({ householdId: getEffectiveHouseholdId(req.user), type: "ingredient", masterId: target._id });
      }
      return res.json({ ok: true });
    }

    if (!target.householdId || String(target.householdId) !== String(getEffectiveHouseholdId(req.user))) {
      return res.status(403).json({ ok: false, error: "No tienes permisos para eliminar este ingrediente." });
    }

    target.isArchived = true;
    await target.save();
    return res.json({ ok: true });
  } catch (error) {
    const handled = handleHouseholdError(res, error);
    if (handled) return handled;
    return res.status(500).json({ ok: false, error: "No se pudo eliminar el ingrediente." });
  }
});

export default router;
