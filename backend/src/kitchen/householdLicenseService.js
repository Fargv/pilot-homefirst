import { KitchenUser } from "./models/KitchenUser.js";
import { normalizeSubscriptionPlan } from "./subscriptionService.js";

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

const REAL_USER_FILTER = {
  $and: [
    {
      $or: [
        { isPlaceholder: { $exists: false } },
        { isPlaceholder: false }
      ]
    },
    {
      $or: [
        { type: { $exists: false } },
        { type: { $ne: "placeholder" } }
      ]
    }
  ]
};

const NON_USER_DINER_FILTER = {
  $or: [
    { isPlaceholder: true },
    { type: "placeholder" }
  ]
};

function isUnlimited(limit) {
  return limit === LICENSE_LIMIT_UNLIMITED;
}

export function getPlanLimits(plan) {
  const normalizedPlan = normalizeSubscriptionPlan(plan);
  return PLAN_LIMITS[normalizedPlan] || PLAN_LIMITS.basic;
}

export function canAddUser(plan, currentUsersCount) {
  const { maxUsers } = getPlanLimits(plan);
  return isUnlimited(maxUsers) || Number(currentUsersCount || 0) < maxUsers;
}

export function canAddNonUserDiner(plan, currentNonUserDinersCount) {
  const { maxNonUserDiners } = getPlanLimits(plan);
  return isUnlimited(maxNonUserDiners) || Number(currentNonUserDinersCount || 0) < maxNonUserDiners;
}

export async function countHouseholdLicenseUsage(householdId) {
  if (!householdId) {
    return {
      users: 0,
      nonUserDiners: 0
    };
  }

  const [users, nonUserDiners] = await Promise.all([
    KitchenUser.countDocuments({ householdId, ...REAL_USER_FILTER }),
    KitchenUser.countDocuments({ householdId, ...NON_USER_DINER_FILTER })
  ]);

  return {
    users: Number(users || 0),
    nonUserDiners: Number(nonUserDiners || 0)
  };
}

export function buildHouseholdLicenseSummary(household, usage = null) {
  const plan = normalizeSubscriptionPlan(household?.subscriptionPlan);
  const limits = getPlanLimits(plan);
  const resolvedUsage = usage || { users: 0, nonUserDiners: 0 };

  return {
    plan,
    limits: {
      maxUsers: limits.maxUsers,
      maxNonUserDiners: limits.maxNonUserDiners
    },
    usage: {
      users: Number(resolvedUsage.users || 0),
      nonUserDiners: Number(resolvedUsage.nonUserDiners || 0)
    },
    capabilities: {
      canAddUser: canAddUser(plan, resolvedUsage.users),
      canAddNonUserDiner: canAddNonUserDiner(plan, resolvedUsage.nonUserDiners)
    }
  };
}

export function buildUserLimitError() {
  const error = new Error("Your current license has reached the maximum number of users for this household.");
  error.statusCode = 403;
  error.code = "USER_LIMIT_REACHED";
  return error;
}

export function buildNonUserDinerLimitError() {
  const error = new Error("Your current license has reached the maximum number of non-user diners for this household.");
  error.statusCode = 403;
  error.code = "NON_USER_DINER_LIMIT_REACHED";
  return error;
}

export async function assertCanAddUserToHousehold(household) {
  const usage = await countHouseholdLicenseUsage(household?._id || household?.id || household);
  if (!canAddUser(household?.subscriptionPlan, usage.users)) {
    throw buildUserLimitError();
  }
  return usage;
}

export async function assertCanAddNonUserDinerToHousehold(household) {
  const usage = await countHouseholdLicenseUsage(household?._id || household?.id || household);
  if (!canAddNonUserDiner(household?.subscriptionPlan, usage.nonUserDiners)) {
    throw buildNonUserDinerLimitError();
  }
  return usage;
}

export function sendHouseholdLicenseError(res, error) {
  if (!error?.code || !String(error.code).endsWith("_LIMIT_REACHED")) {
    return false;
  }
  return res.status(Number(error.statusCode || 403)).json({
    ok: false,
    code: error.code,
    message: error.message
  });
}
