import { KitchenShoppingList } from "./models/KitchenShoppingList.js";
import { KitchenWeekPlan } from "./models/KitchenWeekPlan.js";
import { KitchenDish } from "./models/KitchenDish.js";
import { KitchenIngredient } from "./models/KitchenIngredient.js";
import { Category } from "./models/Category.js";
import { buildScopedFilter } from "./householdScope.js";
import { combineDayIngredients } from "./utils/ingredients.js";
import { normalizeIngredientName } from "./utils/normalize.js";
import { CATALOG_SCOPES } from "./utils/catalogScopes.js";
import { ensureDefaultCategory } from "./utils/categoryMatching.js";
import { resolveDishCatalogForHousehold } from "./utils/dishCatalog.js";
import mongoose from "mongoose";

const INGREDIENT_SCOPE_PRIORITY = {
  [CATALOG_SCOPES.OVERRIDE]: 0,
  [CATALOG_SCOPES.HOUSEHOLD]: 1,
  [CATALOG_SCOPES.MASTER]: 2
};

function compareByScopePriority(a, b) {
  const left = INGREDIENT_SCOPE_PRIORITY[a.scope] ?? 99;
  const right = INGREDIENT_SCOPE_PRIORITY[b.scope] ?? 99;
  return left - right;
}

function buildIngredientVisibilityFilter(effectiveHouseholdId, extraFilter = {}) {
  return {
    ...extraFilter,
    isArchived: { $ne: true },
    $or: [
      { scope: CATALOG_SCOPES.MASTER },
      { scope: CATALOG_SCOPES.HOUSEHOLD, householdId: effectiveHouseholdId },
      { scope: CATALOG_SCOPES.OVERRIDE, householdId: effectiveHouseholdId }
    ]
  };
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

export async function ensureShoppingList(weekStartDate, effectiveHouseholdId) {
  return KitchenShoppingList.findOneAndUpdate(
    buildScopedFilter(effectiveHouseholdId, { weekStart: weekStartDate }),
    {
      $setOnInsert: {
        weekStart: weekStartDate,
        householdId: effectiveHouseholdId,
        items: []
      }
    },
    { new: true, upsert: true, setDefaultsOnInsert: true }
  );
}

function deriveCanonicalName(item, fallbackSeed = "") {
  const normalized = normalizeIngredientName(
    item?.canonicalName || item?.displayName || fallbackSeed || ""
  );
  if (normalized) return normalized;
  if (item?.ingredientId) return `item-${String(item.ingredientId).toLowerCase()}`;
  return `item-${fallbackSeed || "sin-nombre"}`;
}

function ensureValidShoppingItemShape(item, index, fallbackCategoryId = null) {
  const next = { ...(item || {}) };
  const canonicalName = deriveCanonicalName(next, String(index + 1));
  const displayName = String(
    next.displayName || next.name || canonicalName || `Ingrediente ${index + 1}`
  ).trim();

  return {
    ...next,
    itemId: next.itemId || new mongoose.Types.ObjectId(),
    displayName,
    canonicalName,
    categoryId: next.categoryId || fallbackCategoryId || null
  };
}

function filterValidShoppingItems(items = [], context = "unknown") {
  const valid = [];
  let filteredCount = 0;

  items.forEach((rawItem, index) => {
    const item = rawItem || {};
    if (!item.displayName || !item.canonicalName) {
      filteredCount += 1;
      console.warn("[kitchen][shopping] filtering invalid item before save", {
        context,
        index,
        displayName: item.displayName,
        canonicalName: item.canonicalName,
        ingredientId: item.ingredientId ? String(item.ingredientId) : null
      });
      return;
    }
    valid.push(item);
  });

  return { valid, filteredCount };
}

export async function resolveShoppingItemIngredientData(items, effectiveHouseholdId, options = {}) {
  const fallbackCategoryId = options.fallbackCategoryId || null;
  const byId = new Map();
  const byCanonical = new Map();

  for (const item of items) {
    if (item?.ingredientId) byId.set(String(item.ingredientId), true);
    const canonical = normalizeIngredientName(item?.canonicalName || item?.displayName || "");
    if (canonical) byCanonical.set(canonical, true);
  }

  const ingredientFilters = [];
  const ids = Array.from(byId.keys()).filter((id) => mongoose.isValidObjectId(id));
  const canonicalNames = Array.from(byCanonical.keys());
  if (ids.length) ingredientFilters.push({ _id: { $in: ids } });
  if (canonicalNames.length) ingredientFilters.push({ canonicalName: { $in: canonicalNames } });
  if (!ingredientFilters.length) {
    const resolvedWithoutLookup = items.map((item) => {
      if (item?.categoryId || !fallbackCategoryId) return item;
      return { ...item, categoryId: fallbackCategoryId };
    });
    return { changed: resolvedWithoutLookup.some((item, index) => item !== items[index]), resolvedItems: resolvedWithoutLookup };
  }

  const ingredientDocs = await KitchenIngredient.find(
    buildIngredientVisibilityFilter(effectiveHouseholdId, { $or: ingredientFilters })
  )
    .select("_id canonicalName categoryId name scope")
    .lean();

  const sortedIngredients = ingredientDocs.sort(compareByScopePriority);
  const ingredientById = new Map(sortedIngredients.map((doc) => [String(doc._id), doc]));
  const ingredientByCanonical = new Map();
  sortedIngredients.forEach((doc) => {
    if (doc.canonicalName && !ingredientByCanonical.has(doc.canonicalName)) {
      ingredientByCanonical.set(doc.canonicalName, doc);
    }
  });

  let changed = false;
  const resolvedItems = items.map((item, index) => {
    const normalizedCanonical = normalizeIngredientName(item?.canonicalName || item?.displayName || "");
    const byExistingId = item?.ingredientId ? ingredientById.get(String(item.ingredientId)) : null;
    const byName = normalizedCanonical ? ingredientByCanonical.get(normalizedCanonical) : null;
    const resolved = byExistingId || byName || null;
    if (!resolved) {
      const ensuredItem = ensureValidShoppingItemShape(item, index, fallbackCategoryId);
      const previousCanonical = String(item?.canonicalName || "").trim();
      const previousDisplayName = String(item?.displayName || "").trim();
      if (!item?.categoryId || previousCanonical !== ensuredItem.canonicalName || previousDisplayName !== ensuredItem.displayName) {
        changed = true;
      }
      return ensuredItem;
    }

    const next = { ...item };
    if (!next.ingredientId || String(next.ingredientId) !== String(resolved._id)) {
      next.ingredientId = resolved._id;
      changed = true;
    }
    if (next.canonicalName !== resolved.canonicalName) {
      next.canonicalName = resolved.canonicalName;
      changed = true;
    }
    if (!next.displayName) {
      next.displayName = resolved.name;
      changed = true;
    }
    if (!next.canonicalName) {
      next.canonicalName = deriveCanonicalName(next, String(index + 1));
      changed = true;
    }
    const resolvedCategoryId = resolved.categoryId || fallbackCategoryId || null;
    if (!next.categoryId || String(next.categoryId) !== String(resolvedCategoryId || "")) {
      next.categoryId = resolvedCategoryId;
      changed = true;
    }
    return ensureValidShoppingItemShape(next, index, fallbackCategoryId);
  });

  return { changed, resolvedItems };
}

async function buildAggregatedFromWeek(weekStartDate, effectiveHouseholdId) {
  const plan = await KitchenWeekPlan.findOne(
    buildScopedFilter(effectiveHouseholdId, { weekStart: weekStartDate })
  );
  if (!plan) return [];

  const dishIds = plan.days.flatMap((day) => [day.mainDishId, day.sideDishId]).filter(Boolean);
  const dishes = await resolveDishCatalogForHousehold({
    Model: KitchenDish,
    householdId: effectiveHouseholdId,
    ids: dishIds
  });
  const dishMap = new Map(dishes.map((dish) => [dish._id.toString(), dish]));

  const merged = new Map();
  for (const day of plan.days) {
    if (day?.isLeftovers) {
      continue;
    }
    const main = day.mainDishId ? dishMap.get(day.mainDishId.toString()) : null;
    const side = day.sideDishId ? dishMap.get(day.sideDishId.toString()) : null;
    const ingredients = combineDayIngredients({
      mainDish: main,
      sideDish: side,
      overrides: day.ingredientOverrides,
      baseExclusions: day.baseIngredientExclusions,
      includeMain: shouldIncludeMainInShopping(day),
      includeSide: shouldIncludeSideInShopping(day)
    });
    if (process.env.NODE_ENV !== "production") {
      const baseDishIngredients = [
        ...(main?.ingredients || []),
        ...(side?.ingredients || [])
      ].map((item) => String(item?.ingredientId || item?.canonicalName || "").trim().toLowerCase()).filter(Boolean);
      const excludedIngredientIds = (Array.isArray(day.baseIngredientExclusions) ? day.baseIngredientExclusions : [])
        .map((item) => String(item || "").trim().toLowerCase())
        .filter(Boolean);
      const extraIngredientIds = (Array.isArray(day.ingredientOverrides) ? day.ingredientOverrides : [])
        .map((item) => String(item?.ingredientId || item?.canonicalName || "").trim().toLowerCase())
        .filter(Boolean);
      const effectiveIngredientIds = ingredients
        .map((item) => String(item?.ingredientId || item?.canonicalName || "").trim().toLowerCase())
        .filter(Boolean);
      console.debug("[kitchen][shopping][effective-ingredients]", {
        day: day?.date ? new Date(day.date).toISOString().slice(0, 10) : null,
        baseDishIngredientIds: baseDishIngredients,
        excludedIngredientIds,
        extraIngredientIds,
        effectiveIngredientIds
      });
    }

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
  const fallbackCategory = await ensureDefaultCategory({ Category, householdId: effectiveHouseholdId });
  const list = await ensureShoppingList(weekStartDate, effectiveHouseholdId);
  const builtItems = await buildAggregatedFromWeek(weekStartDate, effectiveHouseholdId);
  const resolvedBuiltItems = await resolveShoppingItemIngredientData(builtItems, effectiveHouseholdId, {
    fallbackCategoryId: fallbackCategory?._id || null
  });

  const previousMap = new Map(list.items.map((item) => [item.ingredientId ? String(item.ingredientId) : item.canonicalName, item]));
  const rebuiltItems = resolvedBuiltItems.resolvedItems.map((item, index) => {
    const normalizedItem = ensureValidShoppingItemShape(item, index, fallbackCategory?._id || null);
    const previous = previousMap.get(item.ingredientId ? String(item.ingredientId) : item.canonicalName);
    const nextStatus = previous?.status === "purchased" ? "purchased" : "pending";
    return {
      ...normalizedItem,
      categoryId: normalizedItem.categoryId || fallbackCategory?._id || null,
      fromDishes: normalizedItem.fromDishes,
      status: nextStatus,
      purchasedBy: nextStatus === "purchased" ? previous?.purchasedBy || null : null,
      purchasedAt: nextStatus === "purchased" ? previous?.purchasedAt || null : null,
      storeId: nextStatus === "purchased" ? previous?.storeId || null : null,
      purchaseSessionId: nextStatus === "purchased" ? previous?.purchaseSessionId || null : null
    };
  });

  const { valid } = filterValidShoppingItems(rebuiltItems, "rebuildShoppingList");
  const updatedList = await KitchenShoppingList.findOneAndUpdate(
    buildScopedFilter(effectiveHouseholdId, { weekStart: weekStartDate }),
    {
      $set: { items: valid },
      $setOnInsert: {
        weekStart: weekStartDate,
        householdId: effectiveHouseholdId
      }
    },
    { new: true, upsert: true, setDefaultsOnInsert: true }
  );

  return updatedList || list;
}

export async function repairShoppingListItems(list, effectiveHouseholdId, options = {}) {
  const fallbackCategory = options.fallbackCategory || null;
  const resolved = await resolveShoppingItemIngredientData(
    (list.items || []).map((item) => (item?.toObject ? item.toObject() : item)),
    effectiveHouseholdId,
    { fallbackCategoryId: fallbackCategory?._id || null }
  );

  const normalizedItems = resolved.resolvedItems.map((item, index) =>
    ensureValidShoppingItemShape(item, index, fallbackCategory?._id || null)
  );
  const { valid, filteredCount } = filterValidShoppingItems(normalizedItems, options.context || "repairShoppingListItems");

  const changedByCount = valid.length !== (list.items || []).length;
  const changed = resolved.changed || filteredCount > 0 || changedByCount;
  if (changed) {
    await KitchenShoppingList.findOneAndUpdate(
      buildScopedFilter(effectiveHouseholdId, { weekStart: list.weekStart }),
      { $set: { items: valid } },
      { new: true }
    );
    list.items = valid;
  }

  return { changed, filteredCount };
}
