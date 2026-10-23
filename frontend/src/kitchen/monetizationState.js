export function applySubscriptionsEnabled(previousValue, nextValue) {
  return typeof nextValue === "boolean" ? nextValue : previousValue;
}

export function isSubscriptionsFlagResolved(value) {
  return typeof value === "boolean";
}
