import { normalizeIngredientList, normalizeIngredientName } from "./normalize.js";

export function mergeIngredientLists(...lists) {
  const merged = new Map();

  lists
    .flat()
    .filter(Boolean)
    .forEach((item) => {
      const displayName = String(item?.displayName || "").trim();
      const canonicalName = String(
        item?.canonicalName || normalizeIngredientName(displayName)
      ).trim();
      if (!displayName || !canonicalName) return;
      const key = item?.ingredientId || canonicalName;
      if (!merged.has(key)) {
        merged.set(key, {
          ...item,
          displayName,
          canonicalName
        });
      }
    });

  return Array.from(merged.values());
}

export function combineDayIngredients({
  mainDish,
  sideDish,
  overrides,
  baseExclusions = [],
  includeMain = true,
  includeSide = true
}) {
  const baseIngredients = normalizeIngredientList([
    ...(includeMain ? (mainDish?.ingredients || []) : []),
    ...(includeSide ? (sideDish?.ingredients || []) : [])
  ]);
  const exclusionSet = new Set(
    (Array.isArray(baseExclusions) ? baseExclusions : [])
      .map((value) => String(value || "").trim().toLowerCase())
      .filter(Boolean)
  );
  const filteredBase = exclusionSet.size
    ? baseIngredients.filter((item) => {
      const canonicalKey = String(item?.canonicalName || "").trim().toLowerCase();
      const ingredientKey = item?.ingredientId ? String(item.ingredientId).trim().toLowerCase() : "";
      return !exclusionSet.has(canonicalKey) && !exclusionSet.has(ingredientKey);
    })
    : baseIngredients;
  const extraIngredients = normalizeIngredientList(overrides || []);
  return mergeIngredientLists(filteredBase, extraIngredients);
}
