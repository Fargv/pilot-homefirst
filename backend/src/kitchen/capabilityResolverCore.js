import { SUBSCRIPTION_FUNCTIONAL_CAPABILITIES } from "./monetizationConfigCore.js";

export function resolveFunctionalCapabilities(current, subscriptionsEnabled) {
  return subscriptionsEnabled
    ? current
    : Object.fromEntries(SUBSCRIPTION_FUNCTIONAL_CAPABILITIES.map((key) => [key, true]));
}
