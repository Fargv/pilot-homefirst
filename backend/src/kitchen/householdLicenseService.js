import { KitchenUser } from "./models/KitchenUser.js";
import { normalizeSubscriptionPlan } from "./subscriptionService.js";
import { resolveHouseholdCapabilities } from "./capabilityResolver.js";
import { LICENSE_LIMIT_UNLIMITED, buildEffectiveLicenseState } from "./householdLicenseCore.js";

export { LICENSE_LIMIT_UNLIMITED } from "./householdLicenseCore.js";

function isUnlimited(limit) {
  return limit === LICENSE_LIMIT_UNLIMITED;
}

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

export async function buildHouseholdLicenseSummary(household, usage = null, { subscriptionsEnabled } = {}) {
  const plan = normalizeSubscriptionPlan(household?.subscriptionPlan);
  const access = await resolveHouseholdCapabilities(household, { subscriptionsEnabled });
  const resolvedUsage = usage || await countHouseholdLicenseUsage(household?._id);
  const effectiveLicense = buildEffectiveLicenseState({
    limits: getPlanLimits(plan),
    usage: resolvedUsage,
    subscriptionsEnabled: access.subscriptionsEnabled
  });

  return {
    plan,
    ...effectiveLicense
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
  const access = await resolveHouseholdCapabilities(household);
  if (access.subscriptionsEnabled && !canAddUser(household?.subscriptionPlan, usage.users)) {
    throw buildUserLimitError();
  }
  return usage;
}

export async function assertCanAddNonUserDinerToHousehold(household) {
  const usage = await countHouseholdLicenseUsage(household?._id || household?.id || household);
  const access = await resolveHouseholdCapabilities(household);
  if (access.subscriptionsEnabled && !canAddNonUserDiner(household?.subscriptionPlan, usage.nonUserDiners)) {
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
