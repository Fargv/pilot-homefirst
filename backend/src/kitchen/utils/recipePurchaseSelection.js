import { normalizeIngredientName } from "./normalize.js";

export function recipeIngredientKey(item) {
  return item?.ingredientId
    ? `id:${item.ingredientId}`
    : `name:${normalizeIngredientName(item?.name || item?.displayName || "")}`;
}

export function applyRecipePurchaseSelection(currentIngredients = [], recipeIngredients = [], hasExplicitSelection = false) {
  if (!hasExplicitSelection) return currentIngredients;
  const recipeKeys = new Set(recipeIngredients.map(recipeIngredientKey));
  const next = currentIngredients.filter((item) => !recipeKeys.has(recipeIngredientKey(item)));
  for (const item of recipeIngredients.filter((entry) => entry.buy === true)) {
    const existing = currentIngredients.find((entry) => recipeIngredientKey(entry) === recipeIngredientKey(item));
    next.push(existing || {
      ingredientId: item.ingredientId,
      displayName: item.name,
      canonicalName: normalizeIngredientName(item.name)
    });
  }
  return next;
}
