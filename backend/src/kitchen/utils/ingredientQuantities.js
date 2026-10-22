import { normalizeIngredientName } from "./normalize.js";

const MASS_UNITS = new Map([
  ["g", { family: "mass", factor: 1, baseUnit: "g" }],
  ["kg", { family: "mass", factor: 1000, baseUnit: "g" }]
]);

const VOLUME_UNITS = new Map([
  ["ml", { family: "volume", factor: 1, baseUnit: "ml" }],
  ["l", { family: "volume", factor: 1000, baseUnit: "ml" }]
]);

const UNIT_ALIASES = new Map([
  ["unidad", "unidad"],
  ["unidades", "unidad"],
  ["ud", "unidad"],
  ["uds", "unidad"],
  ["diente", "diente"],
  ["dientes", "diente"],
  ["rama", "rama"],
  ["ramas", "rama"]
]);

function asFiniteAmount(value) {
  const amount = Number(value);
  return Number.isFinite(amount) ? amount : null;
}

export function normalizeQuantityUnit(unit) {
  const value = String(unit || "").trim().toLowerCase();
  if (!value) return null;
  return UNIT_ALIASES.get(value) || value;
}

function unitDescriptor(unit) {
  const normalized = normalizeQuantityUnit(unit);
  return MASS_UNITS.get(normalized) || VOLUME_UNITS.get(normalized) || (
    normalized ? { family: `exact:${normalized}`, factor: 1, baseUnit: normalized } : null
  );
}

function quantityBucket(unit) {
  const descriptor = unitDescriptor(unit);
  return descriptor ? descriptor.family : "none";
}

function identityParts(item) {
  const ingredientId = item?.ingredientId ? String(item.ingredientId).toLowerCase() : null;
  const canonicalName = normalizeIngredientName(item?.canonicalName || item?.displayName || item?.name || "");
  return {
    ingredientId,
    canonicalName,
    key: ingredientId ? `id:${ingredientId}` : `name:${canonicalName}`
  };
}

export function getIngredientIdentityKey(item) {
  return identityParts(item).key;
}

function recipeMatchesIngredient(recipeIngredient, ingredient) {
  const recipeIdentity = identityParts(recipeIngredient);
  const ingredientIdentity = identityParts(ingredient);
  if (recipeIdentity.ingredientId && ingredientIdentity.ingredientId) {
    return recipeIdentity.ingredientId === ingredientIdentity.ingredientId;
  }
  return Boolean(recipeIdentity.canonicalName && recipeIdentity.canonicalName === ingredientIdentity.canonicalName);
}

function getRecipeBaseServings(dish) {
  const recipe = dish?.recipe || {};
  const baseServings = asFiniteAmount(recipe.baseServings ?? recipe.servings);
  return baseServings !== null && baseServings > 0 ? baseServings : null;
}

function scaleAmount(amount, dish, day) {
  const servings = asFiniteAmount(day?.servings);
  const baseServings = getRecipeBaseServings(dish);
  if (amount === null || servings === null || servings <= 0 || !baseServings) return amount;
  return amount * (servings / baseServings);
}

export function readScaledIngredientQuantity(recipeIngredient, dish, day) {
  const raw = recipeIngredient?.quantity;
  if (!raw || typeof raw !== "object") return null;

  const amount = asFiniteAmount(raw.amount);
  const unit = normalizeQuantityUnit(raw.unit);
  if (amount === null || !unit) return null;

  return {
    amount: raw.scalable === false ? amount : scaleAmount(amount, dish, day),
    unit
  };
}

function applyQuantityToBaseUnit(quantity) {
  const descriptor = unitDescriptor(quantity.unit);
  return {
    amount: quantity.amount * descriptor.factor,
    unit: descriptor.baseUnit,
    family: descriptor.family
  };
}

export function quantitiesAreCompatible(left, right) {
  if (!left || !right) return false;
  return quantityBucket(left.unit) === quantityBucket(right.unit);
}

export function mergeCompatibleQuantities(current, next) {
  if (!current) return { ...next };
  if (!quantitiesAreCompatible(current, next)) return null;

  const left = applyQuantityToBaseUnit(current);
  const right = applyQuantityToBaseUnit(next);
  return {
    amount: left.amount + right.amount,
    unit: left.unit
  };
}

function contributionKey(identityKey, quantity) {
  return `${identityKey}|${quantity ? quantityBucket(quantity.unit) : "none"}`;
}

function addContribution(groups, ingredient, quantity, source = null) {
  const identity = identityParts(ingredient);
  if (!identity.canonicalName && !identity.ingredientId) return;

  const key = contributionKey(identity.key, quantity);
  const existing = groups.get(key);
  if (!existing) {
    groups.set(key, {
      ingredientId: ingredient?.ingredientId || null,
      displayName: String(ingredient?.displayName || ingredient?.name || identity.canonicalName).trim(),
      canonicalName: identity.canonicalName,
      quantity: quantity ? { ...quantity } : null,
      unit: quantity?.unit || null,
      occurrences: 1,
      sources: source ? [{ ...source, quantity: quantity ? { ...quantity } : null }] : []
    });
    return;
  }

  existing.occurrences += 1;
  if (source) existing.sources.push({ ...source, quantity: quantity ? { ...quantity } : null });
  if (quantity) {
    existing.quantity = mergeCompatibleQuantities(existing.quantity, quantity);
    existing.unit = existing.quantity?.unit || quantity.unit;
  }
}

function shouldExclude(item, exclusions) {
  const identity = identityParts(item);
  return exclusions.has(identity.ingredientId) || exclusions.has(identity.canonicalName);
}

function sourceIngredients(dish, day, includeIngredients) {
  if (!includeIngredients || !dish) return [];

  const base = Array.isArray(dish.ingredients) ? dish.ingredients : [];
  const recipe = Array.isArray(dish.recipe?.ingredients) ? dish.recipe.ingredients : [];
  const sources = [];
  const sourceKeys = new Set();
  for (const ingredient of base) {
    const key = identityParts(ingredient).key;
    if (sourceKeys.has(key)) continue;
    sourceKeys.add(key);
    sources.push(ingredient);
  }
  for (const recipeIngredient of recipe) {
    if (!sources.some((item) => recipeMatchesIngredient(recipeIngredient, item))) {
      sources.push({
        ingredientId: recipeIngredient.ingredientId || null,
        displayName: recipeIngredient.name,
        canonicalName: normalizeIngredientName(recipeIngredient.name || "")
      });
    }
  }
  return sources.map((ingredient) => ({ ingredient, recipe }));
}

export function consolidateDayIngredients({
  mainDish,
  sideDish,
  day = {},
  includeMain = true,
  includeSide = true,
  overrides = [],
  baseExclusions = [],
  sourceContext = null
} = {}) {
  const exclusions = new Set(
    (Array.isArray(baseExclusions) ? baseExclusions : [])
      .map((value) => String(value || "").trim().toLowerCase())
      .filter(Boolean)
  );
  const groups = new Map();
  const baseIdentityKeys = new Set();

  for (const { dish, include, role, dishId } of [
    { dish: mainDish, include: includeMain, role: "principal", dishId: sourceContext?.mainDishId },
    { dish: sideDish, include: includeSide, role: "acompanamiento", dishId: sourceContext?.sideDishId }
  ]) {
    for (const { ingredient, recipe } of sourceIngredients(dish, day, include)) {
      if (shouldExclude(ingredient, exclusions)) continue;
      baseIdentityKeys.add(identityParts(ingredient).key);
      const matches = recipe.filter((item) => recipeMatchesIngredient(item, ingredient));
      if (!matches.length) {
        addContribution(groups, ingredient, null, { ...sourceContext, role, dishId: dishId ? String(dishId) : null, dishName: dish?.name || "Plato" });
        continue;
      }
      for (const recipeIngredient of matches) {
        const quantity = readScaledIngredientQuantity(recipeIngredient, dish, day);
        addContribution(groups, ingredient, quantity, { ...sourceContext, role, dishId: dishId ? String(dishId) : null, dishName: dish?.name || "Plato" });
      }
    }
  }

  for (const override of Array.isArray(overrides) ? overrides : []) {
    if (baseIdentityKeys.has(identityParts(override).key)) continue;
    addContribution(groups, override, null, { ...sourceContext, role: "extra", dishId: null, dishName: "Ingredientes añadidos" });
  }

  return Array.from(groups.values());
}

export function getQuantityConsolidationKey(item) {
  const identity = getIngredientIdentityKey(item);
  const unit = item?.quantity || item?.unit ? quantityBucket(item.quantity?.unit || item.unit) : "none";
  return `${identity}|${unit}`;
}
