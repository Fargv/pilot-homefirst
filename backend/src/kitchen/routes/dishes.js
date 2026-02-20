import express from "express";
import { KitchenDish } from "../models/KitchenDish.js";
import { normalizeIngredientList } from "../utils/normalize.js";
import { combineDayIngredients } from "../utils/ingredients.js";
import { KitchenWeekPlan } from "../models/KitchenWeekPlan.js";
import { KitchenShoppingList } from "../models/KitchenShoppingList.js";
import { getWeekStart } from "../utils/dates.js";
import { requireAuth } from "../middleware.js";
import { buildScopedFilter, getEffectiveHouseholdId, getOptionalHouseholdId, handleHouseholdError } from "../householdScope.js";
import {
  CATALOG_SCOPES,
  clearHiddenMasterForHousehold,
  hideMasterForHousehold,
  isDiodUser,
  resolveCatalogForHousehold
} from "../utils/catalogScopes.js";

const router = express.Router();


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
    const dishes = await KitchenDish.find(buildScopedFilter(householdId, { _id: { $in: dishIds } }));
    const dishMap = new Map(dishes.map((entry) => [String(entry._id), entry]));

    const merged = new Map();
    plan.days.forEach((day) => {
      const ingredients = combineDayIngredients({
        mainDish: day.mainDishId ? dishMap.get(String(day.mainDishId)) : null,
        sideDish: day.sideDishId ? dishMap.get(String(day.sideDishId)) : null,
        overrides: day.ingredientOverrides
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
    const { sidedish } = req.query;
    const optionalHouseholdId = getOptionalHouseholdId(req.user);

    if (sidedish === "true") {
      const dishes = await resolveCatalogForHousehold({
        Model: KitchenDish,
        householdId: optionalHouseholdId,
        type: "side",
        baseFilter: { sidedish: true },
        sort: { createdAt: -1 }
      });
      return res.json({ ok: true, dishes });
    }

    const dishes = optionalHouseholdId
      ? await KitchenDish.find(buildScopedFilter(optionalHouseholdId, { sidedish: { $ne: true } })).sort({
          createdAt: -1
        })
      : await KitchenDish.find({ scope: CATALOG_SCOPES.MASTER, sidedish: { $ne: true }, isArchived: { $ne: true } }).sort({
          createdAt: -1
        });

    res.json({ ok: true, dishes });
  } catch (error) {
    const handled = handleHouseholdError(res, error);
    if (handled) return handled;
    return res.status(500).json({ ok: false, error: "No se pudieron cargar los platos." });
  }
});

router.post("/", requireAuth, async (req, res) => {
  try {
    const { name, ingredients, sidedish, scope } = req.body;
    if (!name) return res.status(400).json({ ok: false, error: "El nombre del plato es obligatorio." });

    const normalizedIngredients = normalizeIngredientList(ingredients || []);
    const isSideDish = Boolean(sidedish);
    const isDiod = isDiodUser(req.kitchenUser);
    const isMasterWrite = scope === CATALOG_SCOPES.MASTER;
    const effectiveHouseholdId = isMasterWrite ? getOptionalHouseholdId(req.user) : getEffectiveHouseholdId(req.user);

    if (isMasterWrite && !isDiod) {
      return res.status(403).json({ ok: false, error: "Solo DIOD puede crear platos master." });
    }

    const dish = await KitchenDish.create({
      name: String(name).trim(),
      ingredients: normalizedIngredients,
      sidedish: isSideDish,
      scope: isMasterWrite ? CATALOG_SCOPES.MASTER : CATALOG_SCOPES.HOUSEHOLD,
      createdBy: req.kitchenUser._id,
      householdId: isMasterWrite ? undefined : effectiveHouseholdId
    });

    if (!isMasterWrite && isSideDish) {
      await clearHiddenMasterForHousehold({ householdId: effectiveHouseholdId, type: "side", masterId: dish._id });
    }

    return res.status(201).json({ ok: true, dish });
  } catch (error) {
    const handled = handleHouseholdError(res, error);
    if (handled) return handled;
    return res.status(500).json({ ok: false, error: "No se pudo guardar el plato." });
  }
});

router.put("/:id", requireAuth, async (req, res) => {
  try {
    const { name, ingredients, sidedish } = req.body;
    const optionalHouseholdId = getOptionalHouseholdId(req.user);
    const isDiod = isDiodUser(req.kitchenUser);
    const dish = await KitchenDish.findById(req.params.id);
    if (!dish || dish.isArchived) return res.status(404).json({ ok: false, error: "Plato no encontrado." });

    const nextData = {};
    if (name) nextData.name = String(name).trim();
    if (Array.isArray(ingredients)) nextData.ingredients = normalizeIngredientList(ingredients);
    if (typeof sidedish === "boolean") nextData.sidedish = sidedish;

    if (dish.scope === CATALOG_SCOPES.MASTER) {
      if (isDiod) {
        Object.assign(dish, nextData);
        await dish.save();
        await rebuildFutureShoppingLists({ householdId: optionalHouseholdId, dishId: dish._id });
        return res.json({ ok: true, dish });
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
          sidedish: true,
          isArchived: false
        },
        { upsert: true, new: true, setDefaultsOnInsert: true }
      );
      if (dish.sidedish) await clearHiddenMasterForHousehold({ householdId: requiredHouseholdId, type: "side", masterId: dish._id });
      await rebuildFutureShoppingLists({ householdId: requiredHouseholdId, dishId: override._id });
      return res.json({ ok: true, dish: override, overridden: true });
    }

    if (!dish.householdId || String(dish.householdId) !== String(getEffectiveHouseholdId(req.user))) {
      return res.status(403).json({ ok: false, error: "No tienes permisos para modificar este plato." });
    }

    Object.assign(dish, nextData);
    await dish.save();
    await rebuildFutureShoppingLists({ householdId: getEffectiveHouseholdId(req.user), dishId: dish._id });
    return res.json({ ok: true, dish });
  } catch (error) {
    const handled = handleHouseholdError(res, error);
    if (handled) return handled;
    return res.status(500).json({ ok: false, error: "No se pudo actualizar el plato." });
  }
});

router.delete("/:id", requireAuth, async (req, res) => {
  try {
    const optionalHouseholdId = getOptionalHouseholdId(req.user);
    const isDiod = isDiodUser(req.kitchenUser);
    const dish = await KitchenDish.findById(req.params.id);
    if (!dish || dish.isArchived) return res.status(404).json({ ok: false, error: "Plato no encontrado." });

    if (dish.scope === CATALOG_SCOPES.MASTER) {
      if (isDiod) {
        dish.isArchived = true;
        await dish.save();
      } else {
        if (dish.sidedish) await hideMasterForHousehold({ householdId: getEffectiveHouseholdId(req.user), type: "side", masterId: dish._id });
      }
      return res.json({ ok: true });
    }

    if (dish.sidedish) {
      if (!dish.householdId || String(dish.householdId) !== String(getEffectiveHouseholdId(req.user))) {
        return res.status(403).json({ ok: false, error: "No tienes permisos para eliminar esta guarnición." });
      }
      dish.isArchived = true;
      await dish.save();
      return res.json({ ok: true });
    }

    if (!isDiod && !["admin", "owner"].includes(req.kitchenUser.role)) {
      return res.status(403).json({ ok: false, error: "No tienes permisos para esta acción." });
    }

    if (!dish.householdId || String(dish.householdId) !== String(getEffectiveHouseholdId(req.user))) {
      return res.status(403).json({ ok: false, error: "No tienes permisos para eliminar este plato." });
    }

    await dish.deleteOne();
    return res.json({ ok: true });
  } catch (error) {
    const handled = handleHouseholdError(res, error);
    if (handled) return handled;
    return res.status(500).json({ ok: false, error: "No se pudo eliminar el plato." });
  }
});

export default router;
