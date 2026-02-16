import express from "express";
import { KitchenShoppingList } from "../models/KitchenShoppingList.js";
import { KitchenWeekPlan } from "../models/KitchenWeekPlan.js";
import { KitchenDish } from "../models/KitchenDish.js";
import { requireAuth } from "../middleware.js";
import { formatDateISO, getWeekStart, parseISODate } from "../utils/dates.js";
import { combineDayIngredients } from "../utils/ingredients.js";
import {
  buildScopedFilter,
  getEffectiveHouseholdId,
  handleHouseholdError,
  shouldUseLegacyFallback
} from "../householdScope.js";

const router = express.Router();

async function ensureShoppingList(weekStartDate, effectiveHouseholdId, includeLegacy) {
  const existing = await KitchenShoppingList.findOne(
    buildScopedFilter(effectiveHouseholdId, { weekStart: weekStartDate }, { includeLegacy })
  );
  if (existing) return existing;
  return KitchenShoppingList.create({
    weekStart: weekStartDate,
    items: [],
    ...(effectiveHouseholdId ? { householdId: effectiveHouseholdId } : {})
  });
}

async function buildFromWeek(weekStartDate, effectiveHouseholdId, includeLegacy) {
  const plan = await KitchenWeekPlan.findOne(
    buildScopedFilter(effectiveHouseholdId, { weekStart: weekStartDate }, { includeLegacy })
  );
  if (!plan) return [];

  const dishIds = plan.days.flatMap((day) => [day.mainDishId, day.sideDishId]).filter(Boolean);
  const dishes = await KitchenDish.find(buildScopedFilter(effectiveHouseholdId, { _id: { $in: dishIds } }, { includeLegacy }));
  const dishMap = new Map(dishes.map((dish) => [dish._id.toString(), dish]));

  const ingredients = [];
  plan.days.forEach((day) => {
    const main = day.mainDishId ? dishMap.get(day.mainDishId.toString()) : null;
    const side = day.sideDishId ? dishMap.get(day.sideDishId.toString()) : null;
    ingredients.push(
      ...combineDayIngredients({
        mainDish: main,
        sideDish: side,
        overrides: day.ingredientOverrides
      })
    );
  });

  return ingredients;
}

router.get("/:weekStart", requireAuth, async (req, res) => {
  try {
    const weekStart = parseISODate(req.params.weekStart);
    if (!weekStart) return res.status(400).json({ ok: false, error: "Fecha inválida." });

    const effectiveHouseholdId = getEffectiveHouseholdId(req.user);
    const includeLegacy = shouldUseLegacyFallback(effectiveHouseholdId);
    const monday = getWeekStart(weekStart);
    const list = await ensureShoppingList(monday, effectiveHouseholdId, includeLegacy);

    res.json({ ok: true, weekStart: formatDateISO(monday), list });
  } catch (error) {
    const handled = handleHouseholdError(res, error);
    if (handled) return handled;
    return res.status(500).json({ ok: false, error: "No se pudo cargar la lista de compra." });
  }
});

router.post("/:weekStart/rebuild", requireAuth, async (req, res) => {
  try {
    const weekStart = parseISODate(req.params.weekStart);
    if (!weekStart) return res.status(400).json({ ok: false, error: "Fecha inválida." });

    const effectiveHouseholdId = getEffectiveHouseholdId(req.user);
    const includeLegacy = shouldUseLegacyFallback(effectiveHouseholdId);
    const monday = getWeekStart(weekStart);
    const list = await ensureShoppingList(monday, effectiveHouseholdId, includeLegacy);

    const ingredients = await buildFromWeek(monday, effectiveHouseholdId, includeLegacy);
    const merged = new Map();

    ingredients.forEach((item) => {
      if (!item.canonicalName) return;
      const existing = merged.get(item.canonicalName);
      if (existing) return;
      const previous = list.items.find((oldItem) => oldItem.canonicalName === item.canonicalName);
      merged.set(item.canonicalName, {
        displayName: item.displayName,
        canonicalName: item.canonicalName,
        status: previous?.status || "need"
      });
    });

    list.items = Array.from(merged.values());
    await list.save();

    res.json({ ok: true, list });
  } catch (error) {
    const handled = handleHouseholdError(res, error);
    if (handled) return handled;
    return res.status(500).json({ ok: false, error: "No se pudo reconstruir la lista de compra." });
  }
});

router.put("/:weekStart/item", requireAuth, async (req, res) => {
  try {
    const weekStart = parseISODate(req.params.weekStart);
    if (!weekStart) return res.status(400).json({ ok: false, error: "Fecha inválida." });

    const { canonicalName, status, displayName } = req.body;
    if (!canonicalName) return res.status(400).json({ ok: false, error: "Ingrediente inválido." });

    const effectiveHouseholdId = getEffectiveHouseholdId(req.user);
    const includeLegacy = shouldUseLegacyFallback(effectiveHouseholdId);
    const monday = getWeekStart(weekStart);
    const list = await ensureShoppingList(monday, effectiveHouseholdId, includeLegacy);

    const item = list.items.find((current) => current.canonicalName === canonicalName);
    if (!item) {
      list.items.push({
        canonicalName,
        displayName: displayName || canonicalName,
        status: status || "need"
      });
    } else {
      item.status = status || item.status;
    }

    await list.save();
    res.json({ ok: true, list });
  } catch (error) {
    const handled = handleHouseholdError(res, error);
    if (handled) return handled;
    return res.status(500).json({ ok: false, error: "No se pudo actualizar la lista de compra." });
  }
});

export default router;
