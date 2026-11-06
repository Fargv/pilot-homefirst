import { normalizeIngredientName } from "./normalize.js";

export function recipeIngredientKey(item) {
  return item?.ingredientId
    ? `id:${item.ingredientId}`
    : `name:${normalizeIngredientName(item?.name || item?.displayName || "")}`;
}

export function applyRecipePurchaseToggles(currentIngredients = [], recipeIngredients = [], toggles = []) {
  const next = [...currentIngredients];
  for (const toggle of toggles) {
    const key = recipeIngredientKey(toggle);
    const recipeItem = recipeIngredients.find((item) => recipeIngredientKey(item) === key);
    if (!recipeItem) continue;
    const existingIndex = next.findIndex((item) => recipeIngredientKey(item) === key);
    if (toggle.buy === true && existingIndex === -1) {
      next.push({
        ingredientId: recipeItem.ingredientId,
        displayName: recipeItem.name,
        canonicalName: normalizeIngredientName(recipeItem.name)
      });
    } else if (toggle.buy !== true && existingIndex !== -1) {
      next.splice(existingIndex, 1);
    }
  }
  return next;
}
