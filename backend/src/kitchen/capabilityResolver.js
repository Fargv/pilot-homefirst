import { getSubscriptionsEnabled } from "./monetizationConfigService.js";
import { buildHouseholdFeatureAvailability } from "./subscriptionService.js";

// Functional capabilities are intentionally distinct from catalog entitlements.
// `catalogIncludedPacks` is never widened by this resolver.
export async function resolveHouseholdCapabilities(household, { subscriptionsEnabled } = {}) {
  const enabled = subscriptionsEnabled === undefined
    ? await getSubscriptionsEnabled()
    : Boolean(subscriptionsEnabled);
  const current = buildHouseholdFeatureAvailability(household);

  return {
    subscriptionsEnabled: enabled,
    functional: enabled
      ? current
      : Object.fromEntries(Object.keys(current).map((key) => [key, true])),
    catalogIncludedPacks: null
  };
}
