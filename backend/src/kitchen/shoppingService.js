import { KitchenShoppingList } from "./models/KitchenShoppingList.js";
import { KitchenWeekPlan } from "./models/KitchenWeekPlan.js";
import { KitchenDish } from "./models/KitchenDish.js";
import { KitchenIngredient } from "./models/KitchenIngredient.js";
import { buildScopedFilter } from "./householdScope.js";
import { combineDayIngredients } from "./utils/ingredients.js";
import { normalizeIngredientName } from "./utils/normalize.js";

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

export async function resolveShoppingItemIngredientData(items, effectiveHouseholdId) {
  const byId = new Map();
  const byCanonical = new Map();

  for (const item of items) {
    if (item?.ingredientId) byId.set(String(item.ingredientId), true);
    const canonical = normalizeIngredientName(item?.canonicalName || item?.displayName || "");
    if (canonical) byCanonical.set(canonical, true);
  }

  const ingredientFilters = [];
  const ids = Array.from(byId.keys());
  const canonicalNames = Array.from(byCanonical.keys());
  if (ids.length) ingredientFilters.push({ _id: { $in: ids } });
  if (canonicalNames.length) ingredientFilters.push({ canonicalName: { $in: canonicalNames } });
  if (!ingredientFilters.length) return { changed: false, resolvedItems: items };

  const ingredientDocs = await KitchenIngredient.find(
    buildScopedFilter(effectiveHouseholdId, { $or: ingredientFilters })
  ).select("_id canonicalName categoryId name");

  const ingredientById = new Map(ingredientDocs.map((doc) => [String(doc._id), doc]));
  const ingredientByCanonical = new Map(ingredientDocs.map((doc) => [doc.canonicalName, doc]));

  let changed = false;
  const resolvedItems = items.map((item) => {
    const normalizedCanonical = normalizeIngredientName(item?.canonicalName || item?.displayName || "");
    const byExistingId = item?.ingredientId ? ingredientById.get(String(item.ingredientId)) : null;
    const byName = normalizedCanonical ? ingredientByCanonical.get(normalizedCanonical) : null;
    const resolved = byExistingId || byName || null;
    if (!resolved) return item;

    const next = { ...item };
    if (!next.ingredientId || String(next.ingredientId) !== String(resolved._id)) {
      next.ingredientId = resolved._id;
      changed = true;
    }
    if (next.canonicalName !== resolved.canonicalName) {
      next.canonicalName = resolved.canonicalName;
      changed = true;
    }
    if (!next.categoryId || String(next.categoryId) !== String(resolved.categoryId || "")) {
      next.categoryId = resolved.categoryId || null;
      changed = true;
    }
    return next;
  });

  return { changed, resolvedItems };
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
      const normalizedCanonical = normalizeIngredientName(ingredient.canonicalName || ingredient.displayName);
      const key = ingredient.ingredientId ? String(ingredient.ingredientId) : normalizedCanonical;
      if (!key) continue;
      const current = merged.get(key) || {
        ingredientId: ingredient.ingredientId || null,
        categoryId: null,
        displayName: ingredient.displayName,
        canonicalName: normalizedCanonical,
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

  const unresolved = await resolveShoppingItemIngredientData(Array.from(merged.values()), effectiveHouseholdId);
  return unresolved.resolvedItems;
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
      storeId: nextStatus === "purchased" ? previous?.storeId || null : null
    };
  });

  await list.save();
  return list;
}
