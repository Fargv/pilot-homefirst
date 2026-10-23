import { getSubscriptionsEnabled } from "./monetizationConfigService.js";
import { buildHouseholdFeatureAvailability } from "./subscriptionService.js";
import { resolveFunctionalCapabilities } from "./capabilityResolverCore.js";

// Functional capabilities are intentionally distinct from catalog entitlements.
// `catalogIncludedPacks` is never widened by this resolver.
export async function resolveHouseholdCapabilities(household, { subscriptionsEnabled, readSubscriptionsEnabled = getSubscriptionsEnabled } = {}) {
  const enabled = subscriptionsEnabled === undefined
    ? await readSubscriptionsEnabled()
    : Boolean(subscriptionsEnabled);
  const current = buildHouseholdFeatureAvailability(household);

  return {
    subscriptionsEnabled: enabled,
    functional: resolveFunctionalCapabilities(current, enabled),
    catalogIncludedPacks: null
  };
}
