const ACTIVE_PLANS = new Set(["pro", "premium"]);
const BUDGET_ENABLED_PLANS = new Set(["pro", "premium"]);

export const SUBSCRIPTION_PLANS = ["free", "basic", "pro", "premium"];
export const REQUESTABLE_SUBSCRIPTION_PLANS = ["basic", "pro", "premium"];
export const SUBSCRIPTION_STATUSES = ["inactive", "trial", "active", "pending"];
export const SUBSCRIPTION_TRIAL_DAYS = 14;
export const SUBSCRIPTION_MOCK_BILLING_DAYS = 30;

function addDays(baseDate, days) {
  const nextDate = new Date(baseDate);
  nextDate.setDate(nextDate.getDate() + days);
  return nextDate;
}

export function normalizeSubscriptionPlan(plan) {
  const normalizedPlan = String(plan || "").toLowerCase();
  return SUBSCRIPTION_PLANS.includes(normalizedPlan) ? normalizedPlan : "basic";
}

export function isRequestableSubscriptionPlan(plan) {
  return REQUESTABLE_SUBSCRIPTION_PLANS.includes(String(plan || "").toLowerCase());
}

export function canUseBudgetFeature(plan) {
  return BUDGET_ENABLED_PLANS.has(normalizeSubscriptionPlan(plan));
}

export function buildHouseholdFeatureAvailability(household) {
  return {
    budget: canUseBudgetFeature(household?.subscriptionPlan)
  };
}

export function buildHouseholdSubscriptionResponse(household) {
  const subscriptionPlan = normalizeSubscriptionPlan(household?.subscriptionPlan);
  const subscriptionStatus = SUBSCRIPTION_STATUSES.includes(household?.subscriptionStatus)
    ? household.subscriptionStatus
    : "inactive";
  const subscriptionRequestedPlan = isRequestableSubscriptionPlan(household?.subscriptionRequestedPlan)
    ? household.subscriptionRequestedPlan
    : null;

  return {
    subscriptionPlan,
    subscriptionStatus,
    subscriptionRequestedPlan,
    trialEndsAt: household?.trialEndsAt || null,
    subscriptionEndsAt: household?.subscriptionEndsAt || null,
    isPro: Boolean(household?.isPro),
    assignedByAdmin: Boolean(household?.assignedByAdmin)
  };
}

export function applySubscriptionRequest(household, plan, now = new Date()) {
  const normalizedPlan = String(plan || "").toLowerCase();
  if (!isRequestableSubscriptionPlan(normalizedPlan)) {
    const error = new Error("El plan solicitado no es válido.");
    error.code = "SUBSCRIPTION_PLAN_INVALID";
    throw error;
  }

  household.subscriptionRequestedPlan = normalizedPlan;
  household.subscriptionStatus = "pending";
  household.trialEndsAt = addDays(now, SUBSCRIPTION_TRIAL_DAYS);
  if (!SUBSCRIPTION_PLANS.includes(household.subscriptionPlan)) {
    household.subscriptionPlan = "basic";
  }
  return household;
}

export function applyAdminSubscriptionActivation(household, plan, now = new Date()) {
  const normalizedPlan = String(plan || "").toLowerCase();
  if (!isRequestableSubscriptionPlan(normalizedPlan)) {
    const error = new Error("El plan indicado no es válido.");
    error.code = "SUBSCRIPTION_PLAN_INVALID";
    throw error;
  }

  household.subscriptionPlan = normalizedPlan;
  household.subscriptionStatus = "active";
  household.subscriptionRequestedPlan = null;
  household.trialEndsAt = null;
  household.subscriptionEndsAt = addDays(now, SUBSCRIPTION_MOCK_BILLING_DAYS);
  household.isPro = true;
  household.assignedByAdmin = true;
  return household;
}

export function applyAdminSubscriptionDeactivation(household) {
  household.subscriptionPlan = "basic";
  household.subscriptionStatus = "inactive";
  household.subscriptionRequestedPlan = null;
  household.trialEndsAt = null;
  household.subscriptionEndsAt = null;
  household.isPro = false;
  household.assignedByAdmin = false;
  return household;
}

export function isHouseholdOnPaidSubscription(household) {
  return ACTIVE_PLANS.has(normalizeSubscriptionPlan(household?.subscriptionPlan))
    && String(household?.subscriptionStatus || "").toLowerCase() === "active";
}
