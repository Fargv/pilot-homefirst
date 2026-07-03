/**
 * onboardingRecipe.js — pure "Pollo al horno" lookup logic.
 *
 * The onboarding teaches with "Pollo al horno" (a master dish seeded by the
 * backend, so every household should have it). Lookup is robust: normalized
 * accent/case-insensitive contains-match — never class names, never exact
 * string equality. Kept free of API/DOM imports so node:test can pin it.
 */

export const ONBOARDING_RECIPE_NAME = "Pollo al horno";

export function normalizeDishName(name) {
  return String(name || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function describeRecipeCandidate(dish) {
  const steps = dish?.recipe?.steps;
  if (!Array.isArray(steps) || steps.length < 2) return null;
  const hasIngredients =
    (Array.isArray(dish?.ingredients) && dish.ingredients.length > 0) ||
    (Array.isArray(dish?.recipe?.ingredients) && dish.recipe.ingredients.length > 0);
  if (!hasIngredients) return null;
  const hasTimer = steps.some((s) => s?.hasTimer || Number(s?.durationSeconds) > 0);
  return { dish, hasTimer };
}

/**
 * Prefers the preferred-name dish (timer variant first), then any recipe with
 * a timer, then any complete recipe. Returns
 * { dish, hasTimer, matchedPreferred } or null.
 */
export function pickOnboardingRecipe(dishes, { preferredName = ONBOARDING_RECIPE_NAME } = {}) {
  if (!Array.isArray(dishes)) return null;
  const candidates = dishes.map(describeRecipeCandidate).filter(Boolean);
  const target = normalizeDishName(preferredName);
  const preferred = candidates.filter((c) => normalizeDishName(c.dish.name).includes(target));
  const best = (list) => list.find((c) => c.hasTimer) ?? list[0] ?? null;
  const chosen = best(preferred) ?? best(candidates);
  if (!chosen) return null;
  return { ...chosen, matchedPreferred: preferred.includes(chosen) };
}
