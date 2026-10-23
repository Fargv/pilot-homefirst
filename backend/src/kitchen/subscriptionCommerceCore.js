export const SUBSCRIPTIONS_DISABLED_CODE = "SUBSCRIPTIONS_DISABLED";

export function isSubscriptionCheckoutBlocked(type, subscriptionsEnabled) {
  return type === "subscription" && subscriptionsEnabled === false;
}

export function buildSubscriptionsDisabledPayload() {
  return {
    ok: false,
    code: SUBSCRIPTIONS_DISABLED_CODE,
    error: "Las suscripciones no están disponibles en este momento."
  };
}
