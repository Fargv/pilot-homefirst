/**
 * guidedTourService.js — thin API layer for the guided tour.
 * All calls are non-fatal: the tour must never break app navigation.
 */

import { apiRequest } from "../../api.js";

export async function startTourApi() {
  try {
    return await apiRequest("/api/kitchen/onboarding/guided-tour/start", { method: "POST" });
  } catch {
    return null;
  }
}

// Persists resume position; when stepId matches a rewarded step key the backend
// grants bites (once per household, ever) and reports { awarded, amount }.
export async function progressTourApi({ stepIndex, stepId } = {}) {
  try {
    return await apiRequest("/api/kitchen/onboarding/guided-tour/progress", {
      method: "POST",
      body: JSON.stringify({ stepIndex, stepId })
    });
  } catch {
    return null;
  }
}

export async function completeTourApi() {
  try {
    return await apiRequest("/api/kitchen/onboarding/guided-tour/complete", { method: "POST" });
  } catch {
    return null;
  }
}

export async function skipTourApi() {
  try {
    return await apiRequest("/api/kitchen/onboarding/guided-tour/skip", { method: "POST" });
  } catch {
    return null;
  }
}

export async function fetchWalletApi() {
  try {
    const data = await apiRequest("/api/kitchen/bites/wallet");
    return data?.wallet ?? null;
  } catch {
    return null;
  }
}

// Picks a demo-worthy recipe for the "recipe" step: structured steps, a timer
// and ingredients. Returns the dish or null (the step copy degrades gracefully).
export async function findDemoRecipeApi() {
  try {
    const data = await apiRequest("/api/kitchen/dishes");
    const dishes = data?.dishes || data || [];
    if (!Array.isArray(dishes)) return null;
    return (
      dishes.find((d) => {
        const steps = d?.recipe?.steps;
        if (!Array.isArray(steps) || steps.length < 2) return false;
        const hasTimer = steps.some((s) => s?.hasTimer || Number(s?.durationSeconds) > 0);
        const hasIngredients =
          (Array.isArray(d?.ingredients) && d.ingredients.length > 0) ||
          (Array.isArray(d?.recipe?.ingredients) && d.recipe.ingredients.length > 0);
        return hasTimer && hasIngredients;
      }) ?? null
    );
  } catch {
    return null;
  }
}
