import express from "express";
import mongoose from "mongoose";
import { KitchenDish } from "../models/KitchenDish.js";
import { Household } from "../models/Household.js";
import { canRandomizeFullWeek, canUseDinnersFeature } from "../subscriptionService.js";
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
import { buildManualPlanningDishFilter, getDishHiddenMasterType, resolveDishCatalogForHousehold } from "../utils/dishCatalog.js";

const router = express.Router();

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
    const { includeInactive, isDinner } = req.query;
    // ?global=1 forces master-only results (DIOD admin catalog view)
    const forceMaster = isDiodUser(req.kitchenUser) && req.query.global === "1";
    const optionalHouseholdId = forceMaster ? null : getOptionalHouseholdId(req.user);
    const shouldIncludeInactive = String(includeInactive || "").toLowerCase() === "true";
    const hasIsDinnerFilter = isDinner === "true" || isDinner === "false";
    const listFilter = shouldIncludeInactive
      ? {
          sidedish: { $ne: true },
          isArchived: { $ne: true },
          deletedAt: null,
          ...(hasIsDinnerFilter ? { isDinner: isDinner === "true" } : {})
        }
      : buildManualPlanningDishFilter({
          isDinner: hasIsDinnerFilter ? isDinner === "true" : null
        });

    const dishes = optionalHouseholdId
      ? await resolveDishCatalogForHousehold({
          Model: KitchenDish,
          householdId: optionalHouseholdId,
          filter: listFilter,
          sort: { createdAt: -1 }
        })
      : await KitchenDish.find({
          scope: CATALOG_SCOPES.MASTER,
          ...listFilter
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
    const { name, ingredients, special, isDinner, scope, active, isArchived, allowRandom } = body;
    const dishCategoryId = body?.dishCategoryId ?? null;
    if (!name) return res.status(400).json({ ok: false, error: "El nombre del plato es obligatorio." });

    const normalizedIngredients = normalizeIngredientList(ingredients || []);
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
    if (dinnerDish && !isDiod) {
      const household = await Household.findById(effectiveHouseholdId).lean();
      if (!canUseDinnersFeature(household)) {
        return res.status(403).json({
          ok: false,
          error: "La creación de platos de cena requiere un plan Pro o Premium.",
          code: "DINNER_FEATURE_NOT_AVAILABLE"
        });
      }
    }
    const resolvedDishCategoryId = dishCategoryId
      ? await resolveDishCategoryId(dishCategoryId)
      : null;

    const dish = await KitchenDish.create({
      name: String(name).trim(),
      ingredients: normalizedIngredients,
      dishCategoryId: resolvedDishCategoryId ?? null,
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

    return res.status(201).json({ ok: true, dish });
  } catch (error) {
    if (
      error?.message === "Categoría de plato no válida."
      || error?.message === "La categoría de plato seleccionada no existe."
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
    const { name, ingredients, special, isDinner, active, isArchived, allowRandom } = body;
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
    if (resolvedDishCategoryId !== undefined) {
      nextData.dishCategoryId = resolvedDishCategoryId;
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
      const overrideSetData = {
        ...nextData,
        scope: CATALOG_SCOPES.OVERRIDE,
        masterId: dish._id,
        householdId: requiredHouseholdId,
        isDinner: nextData.isDinner,
        dishCategoryId: nextData.dishCategoryId,
        active: nextData.active,
        special: nextData.special,
        isArchived: nextData.isArchived
      };
      // On INSERT (new override): inherit the master's recipe so it is not lost.
      // On UPDATE (existing override): recipe is left untouched ($setOnInsert is ignored).
      const override = await KitchenDish.findOneAndUpdate(
        {
          householdId: requiredHouseholdId,
          scope: CATALOG_SCOPES.OVERRIDE,
          masterId: dish._id
        },
        {
          $set: overrideSetData,
          $setOnInsert: { recipe: dish.recipe || null }
        },
        { upsert: true, new: true, setDefaultsOnInsert: true }
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
    if (dish.source === "catalog") {
      dish.userModified = true;
      dish.userModifiedAt = new Date();
    }
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

router.put("/:id/recipe", requireAuth, async (req, res) => {
  try {
    const isDiod = isDiodUser(req.kitchenUser);
    const dish = await KitchenDish.findById(req.params.id);
    if (!dish || dish.isArchived) {
      return res.status(404).json({ ok: false, error: "Plato no encontrado." });
    }

    const { ingredients, steps, servings } = req.body || {};
    const normalizedIngredients = Array.isArray(ingredients)
      ? ingredients
          .filter((item) => item && String(item.name || "").trim())
          .map((item) => ({
            name: String(item.name || "").trim(),
            quantity: String(item.quantity || "").trim(),
            ...(item.ingredientId ? { ingredientId: item.ingredientId } : {})
          }))
      : [];
    const normalizedServings = servings != null && Number.isFinite(Number(servings)) ? Number(servings) : null;
    const recipeData = { ingredients: normalizedIngredients, steps: steps ?? null, servings: normalizedServings };

    if (dish.scope === CATALOG_SCOPES.MASTER) {
      if (isDiod) {
        dish.recipe = recipeData;
        await dish.save();
        return res.json({ ok: true, dish: { id: String(dish._id), recipe: dish.recipe } });
      }

      const requiredHouseholdId = getEffectiveHouseholdId(req.user);
      const household = await Household.findById(requiredHouseholdId).select("subscriptionPlan planSource betaPro").lean();
      if (!household || !canRandomizeFullWeek(household)) {
        return res.status(403).json({ ok: false, error: "Esta funcionalidad requiere un plan PRO o superior.", code: "PRO_REQUIRED" });
      }

      let override = await KitchenDish.findOne({
        householdId: requiredHouseholdId,
        scope: CATALOG_SCOPES.OVERRIDE,
        masterId: dish._id
      });
      if (!override) {
        override = new KitchenDish({
          name: dish.name,
          ingredients: dish.ingredients,
          isDinner: dish.isDinner,
          dishCategoryId: dish.dishCategoryId,
          active: dish.active !== false,
          special: Boolean(dish.special),
          allowRandom: dish.allowRandom !== false,
          isArchived: false,
          scope: CATALOG_SCOPES.OVERRIDE,
          masterId: dish._id,
          householdId: requiredHouseholdId,
          createdBy: req.kitchenUser._id
        });
      }
      override.recipe = recipeData;
      await override.save();
      await clearHiddenMasterForHousehold({ householdId: requiredHouseholdId, type: getDishHiddenMasterType(dish), masterId: dish._id });

      return res.json({ ok: true, overridden: true, dish: { id: String(override._id), recipe: override.recipe } });
    }

    const requiredHouseholdId = getEffectiveHouseholdId(req.user);
    if (!dish.householdId || String(dish.householdId) !== String(requiredHouseholdId)) {
      return res.status(403).json({ ok: false, error: "No tienes permisos para editar la receta de este plato." });
    }
    if (!isDiod) {
      const household = await Household.findById(requiredHouseholdId).select("subscriptionPlan planSource betaPro").lean();
      if (!household || !canRandomizeFullWeek(household)) {
        return res.status(403).json({ ok: false, error: "Esta funcionalidad requiere un plan PRO o superior.", code: "PRO_REQUIRED" });
      }
    }

    dish.recipe = recipeData;
    if (dish.source === "catalog") {
      dish.userModified = true;
      dish.userModifiedAt = new Date();
    }
    await dish.save();
    return res.json({ ok: true, dish: { id: String(dish._id), recipe: dish.recipe } });
  } catch (error) {
    const handled = handleHouseholdError(res, error);
    if (handled) return handled;
    return res.status(500).json({ ok: false, error: "No se pudo guardar la receta." });
  }
});

export default router;
