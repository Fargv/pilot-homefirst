export const LICENSE_LIMIT_UNLIMITED = null;

function isUnlimited(limit) {
  return limit === LICENSE_LIMIT_UNLIMITED;
}

export function buildEffectiveLicenseState({ limits, usage = {}, subscriptionsEnabled }) {
  const effectiveLimits = subscriptionsEnabled
    ? limits
    : { maxUsers: LICENSE_LIMIT_UNLIMITED, maxNonUserDiners: LICENSE_LIMIT_UNLIMITED };
  const users = Number(usage.users || 0);
  const nonUserDiners = Number(usage.nonUserDiners || 0);

  return {
    limits: effectiveLimits,
    usage: { users, nonUserDiners },
    capabilities: {
      canAddUser: isUnlimited(effectiveLimits.maxUsers) || users < effectiveLimits.maxUsers,
      canAddNonUserDiner: isUnlimited(effectiveLimits.maxNonUserDiners) || nonUserDiners < effectiveLimits.maxNonUserDiners
    }
  };
}
