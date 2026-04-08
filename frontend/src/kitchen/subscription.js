import { ApiRequestError } from "./api.js";

export function normalizeSubscriptionPlan(plan) {
  const normalizedPlan = String(plan || "").toLowerCase();
  return normalizedPlan === "pro" || normalizedPlan === "premium" || normalizedPlan === "free"
    ? normalizedPlan
    : "basic";
}

export function canUseBudgetFeature(plan) {
  const normalizedPlan = normalizeSubscriptionPlan(plan);
  return normalizedPlan === "pro" || normalizedPlan === "premium";
}

export function isBudgetFeatureUnavailableError(error) {
  return error instanceof ApiRequestError && error?.body?.code === "BUDGET_FEATURE_NOT_AVAILABLE";
}
