import { KitchenShoppingList } from "./models/KitchenShoppingList.js";
import { KitchenWeekPlan } from "./models/KitchenWeekPlan.js";
import { KitchenDish } from "./models/KitchenDish.js";
import { KitchenIngredient } from "./models/KitchenIngredient.js";
import { buildScopedFilter } from "./householdScope.js";
import { combineDayIngredients } from "./utils/ingredients.js";

export async function ensureShoppingList(weekStartDate, effectiveHouseholdId) {
  const existing = await KitchenShoppingList.findOne(
    buildScopedFilter(effectiveHouseholdId, { weekStart: weekStartDate })
  );
  if (existing) return existing;
  return KitchenShoppingList.create({
    weekStart: weekStartDate,
    items: [],
    householdId: effectiveHouseholdId
  });
}

async function buildAggregatedFromWeek(weekStartDate, effectiveHouseholdId) {
  const plan = await KitchenWeekPlan.findOne(
    buildScopedFilter(effectiveHouseholdId, { weekStart: weekStartDate })
  );
  if (!plan) return [];

  const dishIds = plan.days.flatMap((day) => [day.mainDishId, day.sideDishId]).filter(Boolean);
  const dishes = await KitchenDish.find(buildScopedFilter(effectiveHouseholdId, { _id: { $in: dishIds } }));
  const dishMap = new Map(dishes.map((dish) => [dish._id.toString(), dish]));

  const merged = new Map();
  for (const day of plan.days) {
    const main = day.mainDishId ? dishMap.get(day.mainDishId.toString()) : null;
    const side = day.sideDishId ? dishMap.get(day.sideDishId.toString()) : null;
    const ingredients = combineDayIngredients({
      mainDish: main,
      sideDish: side,
      overrides: day.ingredientOverrides
    });

    for (const ingredient of ingredients) {
      const key = ingredient.ingredientId ? String(ingredient.ingredientId) : ingredient.canonicalName;
      if (!key) continue;
      const current = merged.get(key) || {
        ingredientId: ingredient.ingredientId || null,
        categoryId: null,
        displayName: ingredient.displayName,
        canonicalName: ingredient.canonicalName,
        quantity: null,
        unit: null,
        occurrences: 0,
        fromDishes: []
      };

      current.occurrences += 1;
      const dayDishIds = [day.mainDishId, day.sideDishId].filter(Boolean).map(String);
      current.fromDishes = Array.from(new Set([...current.fromDishes.map(String), ...dayDishIds]));
      merged.set(key, current);
    }
  }

  const ingredientIds = Array.from(merged.values()).map((item) => item.ingredientId).filter(Boolean);
  const unresolvedByCanonical = Array.from(merged.values())
    .filter((item) => !item.ingredientId && item.canonicalName)
    .map((item) => item.canonicalName);

  const ingredientFilters = [
    ...(ingredientIds.length ? [{ _id: { $in: ingredientIds } }] : []),
    ...(unresolvedByCanonical.length ? [{ canonicalName: { $in: unresolvedByCanonical } }] : [])
  ];
  const ingredientDocs = ingredientFilters.length
    ? await KitchenIngredient.find(buildScopedFilter(effectiveHouseholdId, { $or: ingredientFilters }))
        .select("_id canonicalName categoryId")
    : [];

  const categoryByIngredientId = new Map(ingredientDocs.map((item) => [String(item._id), item.categoryId || null]));
  const ingredientByCanonical = new Map(ingredientDocs.map((item) => [item.canonicalName, item]));

  for (const item of merged.values()) {
    if (!item.ingredientId && item.canonicalName) {
      const resolved = ingredientByCanonical.get(item.canonicalName) || null;
      if (resolved) {
        item.ingredientId = resolved._id;
      } else {
        console.warn(`[shopping] ingredientId no resuelto para canonicalName="${item.canonicalName}" household=${effectiveHouseholdId}`);
      }
    }

    if (item.ingredientId) {
      item.categoryId = categoryByIngredientId.get(String(item.ingredientId)) || null;
    }
  }

  return Array.from(merged.values());
}

export async function rebuildShoppingList(weekStartDate, effectiveHouseholdId) {
  const list = await ensureShoppingList(weekStartDate, effectiveHouseholdId);
  const builtItems = await buildAggregatedFromWeek(weekStartDate, effectiveHouseholdId);

  const previousMap = new Map(list.items.map((item) => [item.ingredientId ? String(item.ingredientId) : item.canonicalName, item]));
  list.items = builtItems.map((item) => {
    const previous = previousMap.get(item.ingredientId ? String(item.ingredientId) : item.canonicalName);
    const nextStatus = previous?.status === "purchased" ? "purchased" : "pending";
    return {
      ...item,
      fromDishes: item.fromDishes,
      status: nextStatus,
      purchasedBy: nextStatus === "purchased" ? previous?.purchasedBy || null : null,
      purchasedAt: nextStatus === "purchased" ? previous?.purchasedAt || null : null,
      tripId: nextStatus === "purchased" ? previous?.tripId || null : null
    };
  });

  await list.save();
  return list;
}
