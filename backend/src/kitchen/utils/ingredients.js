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

export function combineDayIngredients({ mainDish, sideDish, overrides }) {
  const baseIngredients = normalizeIngredientList([
    ...(mainDish?.ingredients || []),
    ...(sideDish?.ingredients || [])
  ]);
  const extraIngredients = normalizeIngredientList(overrides || []);
  return mergeIngredientLists(baseIngredients, extraIngredients);
}
