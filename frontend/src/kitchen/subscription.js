import { ApiRequestError } from "./api.js";

export const LICENSE_LIMIT_UNLIMITED = null;

const PLAN_LIMITS = {
  basic: {
    maxUsers: 3,
    maxNonUserDiners: 4
  },
  pro: {
    maxUsers: 8,
    maxNonUserDiners: 12
  },
  premium: {
    maxUsers: LICENSE_LIMIT_UNLIMITED,
    maxNonUserDiners: LICENSE_LIMIT_UNLIMITED
  }
};

export function normalizeSubscriptionPlan(plan) {
  const normalizedPlan = String(plan || "").toLowerCase();
  return normalizedPlan === "pro" || normalizedPlan === "premium" || normalizedPlan === "free"
    ? normalizedPlan
    : "basic";
}

function isPlanString(value) {
  return typeof value === "string" || value == null;
}

function isActiveBetaProGrant(householdOrUser, now = new Date()) {
  if (!householdOrUser || typeof householdOrUser !== "object") return false;
  const betaPro = householdOrUser.betaPro || {};
  const betaProActive = betaPro.active === true || householdOrUser.betaProActive === true;
  const planSource = String(householdOrUser.planSource || "").toLowerCase();
  if (!betaProActive && planSource !== "beta_pro") return false;
  if (betaPro.expiredAt) return false;
  if (betaPro.expiresAt && new Date(betaPro.expiresAt).getTime() <= now.getTime()) return false;
  return betaProActive;
}

export function isProLikeHousehold(householdOrUser, now = new Date()) {
  if (isPlanString(householdOrUser)) {
    const normalizedPlan = normalizeSubscriptionPlan(householdOrUser);
    return normalizedPlan === "pro" || normalizedPlan === "premium";
  }
  const normalizedPlan = normalizeSubscriptionPlan(householdOrUser?.subscriptionPlan);
  if (normalizedPlan === "premium") return true;
  if (String(householdOrUser?.planSource || "").toLowerCase() === "beta_pro") {
    return isActiveBetaProGrant(householdOrUser, now);
  }
  if (normalizedPlan === "pro") return true;
  return isActiveBetaProGrant(householdOrUser, now);
}

export function getPlanLimits(plan) {
  return PLAN_LIMITS[normalizeSubscriptionPlan(plan)] || PLAN_LIMITS.basic;
}

export function canUseBudgetFeature(householdOrPlan) {
  return isProLikeHousehold(householdOrPlan);
}

export function canRandomizeFullWeek(householdOrPlan) {
  return isProLikeHousehold(householdOrPlan);
}

export function canRandomizeSingleDay(plan) {
  const normalizedPlan = normalizeSubscriptionPlan(plan);
  return normalizedPlan === "basic" || normalizedPlan === "pro" || normalizedPlan === "premium";
}

export function canUseDietRandomization(householdOrPlan) {
  return isProLikeHousehold(householdOrPlan);
}

export function canUseDinnersFeature(householdOrPlan) {
  return isProLikeHousehold(householdOrPlan);
}

export function canUseBasicsFeature(householdOrPlan) {
  return isProLikeHousehold(householdOrPlan);
}

export function canAddUser(plan, currentUsersCount) {
  const { maxUsers } = getPlanLimits(plan);
  return maxUsers === LICENSE_LIMIT_UNLIMITED || Number(currentUsersCount || 0) < maxUsers;
}

export function canAddNonUserDiner(plan, currentNonUserDinersCount) {
  const { maxNonUserDiners } = getPlanLimits(plan);
  return maxNonUserDiners === LICENSE_LIMIT_UNLIMITED || Number(currentNonUserDinersCount || 0) < maxNonUserDiners;
}

export function isUnlimitedLicenseLimit(limit) {
  return limit === LICENSE_LIMIT_UNLIMITED;
}

export function countLicenseUsage(members) {
  const list = Array.isArray(members) ? members : [];
  return list.reduce((usage, member) => {
    const isPlaceholder = Boolean(member?.isPlaceholder) || String(member?.type || "").toLowerCase() === "placeholder";
    if (isPlaceholder) {
      usage.nonUserDiners += 1;
    } else {
      usage.users += 1;
    }
    return usage;
  }, { users: 0, nonUserDiners: 0 });
}

export function buildLicenseState(plan, usage = {}) {
  const normalizedPlan = normalizeSubscriptionPlan(plan);
  const limits = getPlanLimits(normalizedPlan);
  const resolvedUsage = {
    users: Number(usage?.users || 0),
    nonUserDiners: Number(usage?.nonUserDiners || 0)
  };

  return {
    plan: normalizedPlan,
    limits,
    usage: resolvedUsage,
    capabilities: {
      canAddUser: canAddUser(normalizedPlan, resolvedUsage.users),
      canAddNonUserDiner: canAddNonUserDiner(normalizedPlan, resolvedUsage.nonUserDiners)
    }
  };
}

export function isBudgetFeatureUnavailableError(error) {
  return error instanceof ApiRequestError && error?.body?.code === "BUDGET_FEATURE_NOT_AVAILABLE";
}

export function isUserLimitReachedError(error) {
  return error instanceof ApiRequestError && error?.body?.code === "USER_LIMIT_REACHED";
}

export function isNonUserDinerLimitReachedError(error) {
  return error instanceof ApiRequestError && error?.body?.code === "NON_USER_DINER_LIMIT_REACHED";
}

export function isWeekRandomizationUnavailableError(error) {
  return error instanceof ApiRequestError && error?.body?.code === "WEEK_RANDOMIZATION_NOT_AVAILABLE";
}
