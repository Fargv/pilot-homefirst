import express from "express";
import mongoose from "mongoose";
import { KitchenDish } from "../models/KitchenDish.js";
import { KitchenDishCategory } from "../models/KitchenDishCategory.js";
import { normalizeIngredientList } from "../utils/normalize.js";
import { combineDayIngredients } from "../utils/ingredients.js";
import { KitchenWeekPlan } from "../models/KitchenWeekPlan.js";
import { KitchenShoppingList } from "../models/KitchenShoppingList.js";
import { getWeekStart } from "../utils/dates.js";
import { requireAuth } from "../middleware.js";
import { getEffectiveHouseholdId, getOptionalHouseholdId, handleHouseholdError } from "../householdScope.js";
import {
  CATALOG_SCOPES,
  clearHiddenMasterForHousehold,
  hideMasterForHousehold,
  isDiodUser
} from "../utils/catalogScopes.js";
import { getDishHiddenMasterType, resolveDishCatalogForHousehold } from "../utils/dishCatalog.js";

const router = express.Router();
const GUARNICIONES_FALLBACK_ID = "69ac7016c0755cd97c6a9b63";

function parseBooleanField(value, fallback = false) {
  if (typeof value === "boolean") return value;
  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase();
    if (normalized === "true") return true;
    if (normalized === "false") return false;
  }
  return fallback;
}

async function resolveDishCategoryId(rawValue) {
  if (rawValue === undefined) return undefined;
  if (rawValue === null) return null;
  const normalized = String(rawValue || "").trim();
  if (!normalized) return null;
  if (!mongoose.isValidObjectId(normalized)) {
    throw new Error("Categoría de plato no válida.");
  }
  const category = await KitchenDishCategory.findOne({ _id: normalized, active: { $ne: false } })
    .select("_id")
    .lean();
  if (!category) {
    throw new Error("La categoría de plato seleccionada no existe.");
  }
  return category._id;
}

async function resolveGuarnicionesCategoryId() {
  const byCode = await KitchenDishCategory.findOne({ code: "guarniciones", active: { $ne: false } })
    .select("_id")
    .lean();
  if (byCode?._id) return byCode._id;
  if (mongoose.isValidObjectId(GUARNICIONES_FALLBACK_ID)) {
    const byFallbackId = await KitchenDishCategory.findOne({ _id: GUARNICIONES_FALLBACK_ID, active: { $ne: false } })
      .select("_id")
      .lean();
    if (byFallbackId?._id) return byFallbackId._id;
  }
  throw new Error("La categoría 'Guarniciones' no existe o está inactiva.");
}

function shouldIncludeMainInShopping(day) {
  if (day?.isLeftovers) return false;
  if (typeof day?.includeMainIngredients === "boolean") return day.includeMainIngredients;
  return day?.mealType === "dinner" ? false : true;
}

function shouldIncludeSideInShopping(day) {
  if (day?.isLeftovers) return false;
  if (typeof day?.includeSideIngredients === "boolean") return day.includeSideIngredients;
  return day?.mealType === "dinner" ? false : true;
}

async function rebuildFutureShoppingListsSafe({ householdId, dishId, context }) {
  try {
    await rebuildFutureShoppingLists({ householdId, dishId });
    return null;
  } catch (error) {
    console.error(`[kitchen/dishes] ${context} rebuild shopping list failed`, {
      householdId: String(householdId || ""),
      dishId: String(dishId || ""),
      message: error?.message,
      stack: error?.stack
    });
    return "El plato se guardo, pero no se pudo actualizar la lista de compra.";
  }
}

async function rebuildShoppingListForPlan(plan, householdId) {
  const dishIds = plan.days.flatMap((day) => [day.mainDishId, day.sideDishId]).filter(Boolean);
  const dishes = await resolveDishCatalogForHousehold({
    Model: KitchenDish,
    householdId,
    ids: dishIds
  });
  const dishMap = new Map(dishes.map((entry) => [String(entry._id), entry]));

  const merged = new Map();
  plan.days.forEach((day) => {
    if (day?.isLeftovers) return;
    const ingredients = combineDayIngredients({
      mainDish: day.mainDishId ? dishMap.get(String(day.mainDishId)) : null,
      sideDish: day.sideDishId ? dishMap.get(String(day.sideDishId)) : null,
      overrides: day.ingredientOverrides,
      baseExclusions: day.baseIngredientExclusions,
      includeMain: shouldIncludeMainInShopping(day),
      includeSide: shouldIncludeSideInShopping(day)
    });

    ingredients.forEach((item) => {
      if (!item.canonicalName || merged.has(item.canonicalName)) return;
      merged.set(item.canonicalName, {
        displayName: item.displayName,
        canonicalName: item.canonicalName,
        status: "need"
      });
    });
  });

  const list = await KitchenShoppingList.findOneAndUpdate(
    { householdId, weekStart: plan.weekStart },
    { $setOnInsert: { householdId, weekStart: plan.weekStart, items: [] } },
    { new: true, upsert: true }
  );

  const previousByCanonical = new Map((list.items || []).map((item) => [item.canonicalName, item.status]));
  list.items = Array.from(merged.values()).map((item) => ({
    ...item,
    status: previousByCanonical.get(item.canonicalName) || "need"
  }));
  await list.save();
}

async function unassignDishFromCurrentAndFutureWeeks({ householdId, dishId }) {
  if (!householdId || !dishId) return { affectedWeeks: 0, changedDays: 0 };
  const currentWeekStart = getWeekStart(new Date());
  const plans = await KitchenWeekPlan.find({
    householdId,
    weekStart: { $gte: currentWeekStart },
    $or: [{ "days.mainDishId": dishId }, { "days.sideDishId": dishId }, { "days.leftoversSourceDishId": dishId }]
  });

  let affectedWeeks = 0;
  let changedDays = 0;
  for (const plan of plans) {
    let planChanged = false;
    for (const day of plan.days) {
      let dayChanged = false;
      if (day.mainDishId && String(day.mainDishId) === String(dishId)) {
        day.mainDishId = null;
        dayChanged = true;
      }
      if (day.sideDishId && String(day.sideDishId) === String(dishId)) {
        day.sideDishId = null;
        dayChanged = true;
      }
      if (day.leftoversSourceDishId && String(day.leftoversSourceDishId) === String(dishId)) {
        day.isLeftovers = false;
        day.leftoversSourceDishId = null;
        day.leftoversSourceDate = null;
        day.leftoversSourceMealType = null;
        dayChanged = true;
      }
      if (dayChanged) {
        planChanged = true;
        changedDays += 1;
      }
    }
    if (planChanged) {
      await plan.save();
      await rebuildShoppingListForPlan(plan, householdId);
      affectedWeeks += 1;
    }
  }
  return { affectedWeeks, changedDays };
}


async function rebuildFutureShoppingLists({ householdId, dishId }) {
  if (!householdId || !dishId) return;

  const currentWeekStart = getWeekStart(new Date());
  const plans = await KitchenWeekPlan.find({
    householdId,
    weekStart: { $gte: currentWeekStart },
    $or: [{ "days.mainDishId": dishId }, { "days.sideDishId": dishId }]
  });

  for (const plan of plans) {
    const dishIds = plan.days.flatMap((day) => [day.mainDishId, day.sideDishId]).filter(Boolean);
    const dishes = await resolveDishCatalogForHousehold({
      Model: KitchenDish,
      householdId,
      ids: dishIds
    });
    const dishMap = new Map(dishes.map((entry) => [String(entry._id), entry]));

    const merged = new Map();
    plan.days.forEach((day) => {
      if (day?.isLeftovers) return;
      const ingredients = combineDayIngredients({
        mainDish: day.mainDishId ? dishMap.get(String(day.mainDishId)) : null,
        sideDish: day.sideDishId ? dishMap.get(String(day.sideDishId)) : null,
        overrides: day.ingredientOverrides,
        baseExclusions: day.baseIngredientExclusions,
        includeMain: shouldIncludeMainInShopping(day),
        includeSide: shouldIncludeSideInShopping(day)
      });

      ingredients.forEach((item) => {
        if (!item.canonicalName || merged.has(item.canonicalName)) return;
        merged.set(item.canonicalName, {
          displayName: item.displayName,
          canonicalName: item.canonicalName,
          status: "need"
        });
      });
    });

    const list = await KitchenShoppingList.findOneAndUpdate(
      { householdId, weekStart: plan.weekStart },
      { $setOnInsert: { householdId, weekStart: plan.weekStart, items: [] } },
      { new: true, upsert: true }
    );

    const previousByCanonical = new Map((list.items || []).map((item) => [item.canonicalName, item.status]));
    list.items = Array.from(merged.values()).map((item) => ({
      ...item,
      status: previousByCanonical.get(item.canonicalName) || "need"
    }));
    await list.save();
  }
}

router.get("/", requireAuth, async (req, res) => {
  try {
    const { sidedish, includeInactive, isDinner } = req.query;
    const optionalHouseholdId = getOptionalHouseholdId(req.user);
    const shouldIncludeInactive = String(includeInactive || "").toLowerCase() === "true";
    const activeFilter = shouldIncludeInactive ? {} : { active: true };
    const hasIsDinnerFilter = isDinner === "true" || isDinner === "false";
    const isDinnerFilter = hasIsDinnerFilter ? { isDinner: isDinner === "true" } : {};

    if (sidedish === "true") {
      const dishes = await resolveDishCatalogForHousehold({
        Model: KitchenDish,
        householdId: optionalHouseholdId,
        filter: { sidedish: true, ...isDinnerFilter, ...activeFilter },
        sort: { createdAt: -1 }
      });
      return res.json({ ok: true, dishes });
    }

    const dishes = optionalHouseholdId
      ? await resolveDishCatalogForHousehold({
          Model: KitchenDish,
          householdId: optionalHouseholdId,
          filter: {
            sidedish: { $ne: true },
            ...isDinnerFilter,
            ...activeFilter
          },
          sort: { createdAt: -1 }
        })
      : await KitchenDish.find({
          scope: CATALOG_SCOPES.MASTER,
          sidedish: { $ne: true },
          isArchived: { $ne: true },
          ...isDinnerFilter,
          ...activeFilter
        }).sort({ createdAt: -1 });

    res.json({ ok: true, dishes });
  } catch (error) {
    const handled = handleHouseholdError(res, error);
    if (handled) return handled;
    return res.status(500).json({ ok: false, error: "No se pudieron cargar los platos." });
  }
});

router.post("/", requireAuth, async (req, res) => {
  try {
    const body = req.body || {};
    const { name, ingredients, sidedish, special, isDinner, scope, active, isArchived, allowRandom } = body;
    const dishCategoryId = body?.dishCategoryId ?? null;
    if (!name) return res.status(400).json({ ok: false, error: "El nombre del plato es obligatorio." });

    const normalizedIngredients = normalizeIngredientList(ingredients || []);
    const isSideDish = parseBooleanField(sidedish, false);
    const isSpecial = parseBooleanField(special, false);
    const dinnerDish = parseBooleanField(isDinner, false);
    const randomAllowed = parseBooleanField(allowRandom, true);
    const isActive = parseBooleanField(active, true);
    const nextIsArchived = parseBooleanField(isArchived, false);
    const isDiod = isDiodUser(req.kitchenUser);
    const isMasterWrite = scope === CATALOG_SCOPES.MASTER;
    const effectiveHouseholdId = isMasterWrite ? getOptionalHouseholdId(req.user) : getEffectiveHouseholdId(req.user);

    if (isMasterWrite && !isDiod) {
      return res.status(403).json({ ok: false, error: "Solo DIOD puede crear platos master." });
    }
    const resolvedDishCategoryId = dishCategoryId
      ? await resolveDishCategoryId(dishCategoryId)
      : null;
    const guarnicionesCategoryId = isSideDish ? await resolveGuarnicionesCategoryId() : null;

    const dish = await KitchenDish.create({
      name: String(name).trim(),
      ingredients: normalizedIngredients,
      dishCategoryId: isSideDish ? guarnicionesCategoryId : (resolvedDishCategoryId ?? null),
      sidedish: isSideDish,
      isDinner: dinnerDish,
      special: isSpecial,
      allowRandom: randomAllowed,
      active: isActive,
      isArchived: nextIsArchived,
      deletedAt: null,
      scope: isMasterWrite ? CATALOG_SCOPES.MASTER : CATALOG_SCOPES.HOUSEHOLD,
      createdBy: req.kitchenUser._id,
      householdId: isMasterWrite ? undefined : effectiveHouseholdId
    });

    if (!isMasterWrite && isSideDish) {
      await clearHiddenMasterForHousehold({ householdId: effectiveHouseholdId, type: "side", masterId: dish._id });
    }

    return res.status(201).json({ ok: true, dish });
  } catch (error) {
    if (
      error?.message === "Categoría de plato no válida."
      || error?.message === "La categoría de plato seleccionada no existe."
      || error?.message === "La categoría 'Guarniciones' no existe o está inactiva."
    ) {
      return res.status(400).json({ ok: false, error: error.message });
    }
    const handled = handleHouseholdError(res, error);
    if (handled) return handled;
    return res.status(500).json({ ok: false, error: "No se pudo guardar el plato." });
  }
});

router.put("/:id", requireAuth, async (req, res) => {
  try {
    const body = req.body || {};
    const { name, ingredients, sidedish, special, isDinner, active, isArchived, allowRandom } = body;
    const hasDishCategoryInput = Object.prototype.hasOwnProperty.call(body, "dishCategoryId");
    const dishCategoryId = hasDishCategoryInput ? body.dishCategoryId : undefined;
    const optionalHouseholdId = getOptionalHouseholdId(req.user);
    const isDiod = isDiodUser(req.kitchenUser);
    const dish = await KitchenDish.findById(req.params.id);
    if (!dish || dish.isArchived) return res.status(404).json({ ok: false, error: "Plato no encontrado." });

    const nextData = {
      scope: dish.scope,
      active: parseBooleanField(active, dish.active !== false),
      special: parseBooleanField(special, Boolean(dish.special)),
      isDinner: parseBooleanField(isDinner, Boolean(dish.isDinner)),
      sidedish: parseBooleanField(sidedish, Boolean(dish.sidedish)),
      allowRandom: parseBooleanField(allowRandom, dish.allowRandom !== false),
      isArchived: parseBooleanField(isArchived, Boolean(dish.isArchived))
    };
    const resolvedDishCategoryId = dishCategoryId === undefined
      ? undefined
      : (dishCategoryId ? await resolveDishCategoryId(dishCategoryId) : null);
    if (name) nextData.name = String(name).trim();
    else nextData.name = dish.name;
    if (Array.isArray(ingredients)) nextData.ingredients = normalizeIngredientList(ingredients);
    else nextData.ingredients = dish.ingredients;
    if (nextData.sidedish) {
      nextData.dishCategoryId = await resolveGuarnicionesCategoryId();
    } else if (resolvedDishCategoryId !== undefined) {
      nextData.dishCategoryId = resolvedDishCategoryId;
    } else if (dish.sidedish && !nextData.sidedish) {
      nextData.dishCategoryId = null;
    } else {
      nextData.dishCategoryId = dish.dishCategoryId || null;
    }

    if (dish.scope === CATALOG_SCOPES.MASTER) {
      if (isDiod) {
        Object.assign(dish, nextData);
        await dish.save();
        const warning = await rebuildFutureShoppingListsSafe({
          householdId: optionalHouseholdId,
          dishId: dish._id,
          context: "update-master-dish"
        });
        return res.json({ ok: true, dish, ...(warning ? { warning } : {}) });
      }

      const requiredHouseholdId = getEffectiveHouseholdId(req.user);
      const override = await KitchenDish.findOneAndUpdate(
        {
          householdId: requiredHouseholdId,
          scope: CATALOG_SCOPES.OVERRIDE,
          masterId: dish._id
        },
        {
          ...nextData,
          scope: CATALOG_SCOPES.OVERRIDE,
          masterId: dish._id,
          householdId: requiredHouseholdId,
          sidedish: nextData.sidedish,
          isDinner: nextData.isDinner,
          dishCategoryId: nextData.dishCategoryId,
          active: nextData.active,
          special: nextData.special,
          isArchived: nextData.isArchived
        },
        { upsert: true, new: true, setDefaultsOnInsert: true, runValidators: true }
      );
      await clearHiddenMasterForHousehold({
        householdId: requiredHouseholdId,
        type: getDishHiddenMasterType(dish),
        masterId: dish._id
      });
      const warning = await rebuildFutureShoppingListsSafe({
        householdId: requiredHouseholdId,
        dishId: override._id,
        context: "update-master-override-dish"
      });
      return res.json({ ok: true, dish: override, overridden: true, ...(warning ? { warning } : {}) });
    }

    if (!dish.householdId || String(dish.householdId) !== String(getEffectiveHouseholdId(req.user))) {
      return res.status(403).json({ ok: false, error: "No tienes permisos para modificar este plato." });
    }

    Object.assign(dish, nextData);
    await dish.save();
    const warning = await rebuildFutureShoppingListsSafe({
      householdId: getEffectiveHouseholdId(req.user),
      dishId: dish._id,
      context: "update-household-dish"
    });
    return res.json({ ok: true, dish, ...(warning ? { warning } : {}) });
  } catch (error) {
    if (
      error?.message === "Categoría de plato no válida."
      || error?.message === "La categoría de plato seleccionada no existe."
      || error?.message === "La categoría 'Guarniciones' no existe o está inactiva."
    ) {
      return res.status(400).json({ ok: false, error: error.message });
    }
    const handled = handleHouseholdError(res, error);
    if (handled) return handled;
    return res.status(500).json({ ok: false, error: "No se pudo actualizar el plato." });
  }
});

router.delete("/:id", requireAuth, async (req, res) => {
  try {
    const isDiod = isDiodUser(req.kitchenUser);
    const dish = await KitchenDish.findById(req.params.id);
    if (!dish || dish.isArchived) return res.status(404).json({ ok: false, error: "Plato no encontrado." });

    if (dish.scope === CATALOG_SCOPES.MASTER) {
      if (isDiod) {
        dish.active = false;
        dish.deletedAt = new Date();
        await dish.save();
      } else {
        await hideMasterForHousehold({
          householdId: getEffectiveHouseholdId(req.user),
          type: getDishHiddenMasterType(dish),
          masterId: dish._id
        });
      }
      return res.json({ ok: true, dishId: String(dish._id), active: false });
    }

    if (!dish.householdId || String(dish.householdId) !== String(getEffectiveHouseholdId(req.user))) {
      return res.status(403).json({ ok: false, error: "No tienes permisos para eliminar este plato." });
    }

    if (!isDiod && !["admin", "owner"].includes(req.kitchenUser.role)) {
      return res.status(403).json({ ok: false, error: "No tienes permisos para esta accion." });
    }

    dish.active = false;
    dish.deletedAt = new Date();
    await dish.save();

    let cascade = { affectedWeeks: 0, changedDays: 0 };
    let warning = null;
    try {
      cascade = await unassignDishFromCurrentAndFutureWeeks({
        householdId: getEffectiveHouseholdId(req.user),
        dishId: dish._id
      });
    } catch (cascadeError) {
      console.error("[kitchen/dishes] delete cascade failed", {
        dishId: String(dish._id),
        householdId: String(getEffectiveHouseholdId(req.user)),
        message: cascadeError?.message,
        stack: cascadeError?.stack
      });
      warning = "El plato se elimino, pero no se pudo completar la limpieza de asignaciones futuras.";
    }

    return res.json({
      ok: true,
      dishId: String(dish._id),
      active: false,
      cascade,
      ...(warning ? { warning } : {})
    });
  } catch (error) {
    const handled = handleHouseholdError(res, error);
    if (handled) return handled;
    return res.status(500).json({ ok: false, error: "No se pudo eliminar el plato." });
  }
});

router.post("/:id/restore", requireAuth, async (req, res) => {
  try {
    const optionalHouseholdId = getOptionalHouseholdId(req.user);
    const isDiod = isDiodUser(req.kitchenUser);
    const dish = await KitchenDish.findById(req.params.id);
    if (!dish || dish.isArchived) return res.status(404).json({ ok: false, error: "Plato no encontrado." });

    if (dish.scope === CATALOG_SCOPES.MASTER) {
      if (!isDiod) {
        return res.status(403).json({ ok: false, error: "No tienes permisos para recuperar este plato." });
      }
      dish.active = true;
      dish.deletedAt = null;
      await dish.save();
      return res.json({ ok: true, dish });
    }

    if (!dish.householdId || String(dish.householdId) !== String(getEffectiveHouseholdId(req.user))) {
      return res.status(403).json({ ok: false, error: "No tienes permisos para recuperar este plato." });
    }
    if (!isDiod && !["admin", "owner"].includes(req.kitchenUser.role)) {
      return res.status(403).json({ ok: false, error: "No tienes permisos para esta accion." });
    }

    dish.active = true;
    dish.deletedAt = null;
    await dish.save();
    const warning = await rebuildFutureShoppingListsSafe({
      householdId: optionalHouseholdId || getEffectiveHouseholdId(req.user),
      dishId: dish._id,
      context: "restore-dish"
    });
    return res.json({ ok: true, dish, ...(warning ? { warning } : {}) });
  } catch (error) {
    const handled = handleHouseholdError(res, error);
    if (handled) return handled;
    return res.status(500).json({ ok: false, error: "No se pudo recuperar el plato." });
  }
});

export default router;
