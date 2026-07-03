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

// Persists resume position + stall telemetry; when stepId matches a rewarded
// action key the backend grants bites (once per household, ever) and reports
// { awarded, amount }. currentStepId/completedStepId/missingTarget feed the
// admin-visible debug info about where users stall.
export async function progressTourApi({ stepIndex, stepId, currentStepId, completedStepId, missingTarget } = {}) {
  try {
    return await apiRequest("/api/kitchen/onboarding/guided-tour/progress", {
      method: "POST",
      body: JSON.stringify({ stepIndex, stepId, currentStepId, completedStepId, missingTarget })
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

export async function skipTourApi({ stalledStepId } = {}) {
  try {
    return await apiRequest("/api/kitchen/onboarding/guided-tour/skip", {
      method: "POST",
      body: JSON.stringify({ stalledStepId })
    });
  } catch {
    return null;
  }
}

// ─── Onboarding recipe lookup ────────────────────────────────────────────────
// Pure logic lives in onboardingRecipe.js (node:test-able, no api import).

export { ONBOARDING_RECIPE_NAME, normalizeDishName, pickOnboardingRecipe } from "./onboardingRecipe.js";
import { pickOnboardingRecipe as _pickOnboardingRecipe } from "./onboardingRecipe.js";

export async function findOnboardingRecipeApi({ preferredName } = {}) {
  try {
    const data = await apiRequest("/api/kitchen/dishes");
    return _pickOnboardingRecipe(data?.dishes || data || [], { preferredName });
  } catch {
    return null;
  }
}
