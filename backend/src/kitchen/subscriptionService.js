const ACTIVE_PLANS = new Set(["pro", "premium"]);
const BUDGET_ENABLED_PLANS = new Set(["pro", "premium"]);
const FULL_WEEK_RANDOMIZATION_PLANS = new Set(["pro", "premium"]);
const DIET_RANDOMIZATION_PLANS = new Set(["pro", "premium"]);
const DINNER_PLANS = new Set(["pro", "premium"]);
const BASICS_PLANS = new Set(["pro", "premium"]);

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

function isPlanString(value) {
  return typeof value === "string" || value == null;
}

function isActiveBetaProGrant(household, now = new Date()) {
  if (!household || typeof household !== "object") return false;
  const betaPro = household.betaPro || {};
  const betaProActive = betaPro.active === true || household.betaProActive === true;
  const planSource = String(household.planSource || "").toLowerCase();
  if (!betaProActive && planSource !== "beta_pro") return false;
  if (betaPro.expiredAt) return false;
  if (betaPro.expiresAt && new Date(betaPro.expiresAt).getTime() <= now.getTime()) return false;
  return betaProActive;
}

export function isProLikeHousehold(household, now = new Date()) {
  if (isPlanString(household)) {
    return ACTIVE_PLANS.has(normalizeSubscriptionPlan(household));
  }

  const plan = normalizeSubscriptionPlan(household?.subscriptionPlan);
  if (plan === "premium") return true;
  if (String(household?.planSource || "").toLowerCase() === "beta_pro") {
    return isActiveBetaProGrant(household, now);
  }
  if (plan === "pro") return true;
  return isActiveBetaProGrant(household, now);
}

export function isRequestableSubscriptionPlan(plan) {
  return REQUESTABLE_SUBSCRIPTION_PLANS.includes(String(plan || "").toLowerCase());
}

export function canUseBudgetFeature(householdOrPlan) {
  return isPlanString(householdOrPlan)
    ? BUDGET_ENABLED_PLANS.has(normalizeSubscriptionPlan(householdOrPlan))
    : isProLikeHousehold(householdOrPlan);
}

export function canRandomizeFullWeek(householdOrPlan) {
  return isPlanString(householdOrPlan)
    ? FULL_WEEK_RANDOMIZATION_PLANS.has(normalizeSubscriptionPlan(householdOrPlan))
    : isProLikeHousehold(householdOrPlan);
}

export function canRandomizeSingleDay(plan) {
  return ["basic", "pro", "premium"].includes(normalizeSubscriptionPlan(plan));
}

export function canUseDietRandomization(householdOrPlan) {
  return isPlanString(householdOrPlan)
    ? DIET_RANDOMIZATION_PLANS.has(normalizeSubscriptionPlan(householdOrPlan))
    : isProLikeHousehold(householdOrPlan);
}

export function canUseDinnersFeature(householdOrPlan) {
  return isPlanString(householdOrPlan)
    ? DINNER_PLANS.has(normalizeSubscriptionPlan(householdOrPlan))
    : isProLikeHousehold(householdOrPlan);
}

export function canUseBasicsFeature(householdOrPlan) {
  return isPlanString(householdOrPlan)
    ? BASICS_PLANS.has(normalizeSubscriptionPlan(householdOrPlan))
    : isProLikeHousehold(householdOrPlan);
}

export function buildHouseholdFeatureAvailability(household) {
  return {
    budget: canUseBudgetFeature(household),
    fullWeekRandomization: canRandomizeFullWeek(household),
    singleDayRandomization: canRandomizeSingleDay(household?.subscriptionPlan),
    dietRandomization: canUseDietRandomization(household),
    dinners: canUseDinnersFeature(household),
    basics: canUseBasicsFeature(household)
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
    pendingDowngradeAt: household?.pendingDowngradeAt || null,
    pendingDowngradeReason: household?.pendingDowngradeReason || "",
    isPro: Boolean(household?.isPro),
    assignedByAdmin: Boolean(household?.assignedByAdmin),
    planSource: household?.planSource || "manual",
    betaProActive: isActiveBetaProGrant(household)
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
  if (!SUBSCRIPTION_PLANS.includes(normalizedPlan)) {
    const error = new Error("El plan indicado no es válido.");
    error.code = "SUBSCRIPTION_PLAN_INVALID";
    throw error;
  }

  household.subscriptionPlan = normalizedPlan;
  household.subscriptionStatus = "active";
  household.subscriptionRequestedPlan = null;
  household.trialEndsAt = null;
  household.subscriptionEndsAt = addDays(now, SUBSCRIPTION_MOCK_BILLING_DAYS);
  household.isPro = ACTIVE_PLANS.has(normalizedPlan);
  household.assignedByAdmin = true;
  return household;
}

export function applyAdminSubscriptionDeactivation(household) {
  household.subscriptionPlan = "basic";
  household.subscriptionStatus = "inactive";
  household.subscriptionRequestedPlan = null;
  household.trialEndsAt = null;
  household.subscriptionEndsAt = null;
  household.pendingDowngradeAt = null;
  household.pendingDowngradeReason = "";
  household.isPro = false;
  household.assignedByAdmin = false;
  return household;
}

export function isHouseholdOnPaidSubscription(household) {
  return ACTIVE_PLANS.has(normalizeSubscriptionPlan(household?.subscriptionPlan))
    && String(household?.subscriptionStatus || "").toLowerCase() === "active";
}
