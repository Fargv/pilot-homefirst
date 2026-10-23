import assert from "node:assert/strict";
import test from "node:test";
import {
  buildSubscriptionsDisabledPayload,
  isSubscriptionCheckoutBlocked,
  SUBSCRIPTIONS_DISABLED_CODE
} from "./subscriptionCommerceCore.js";

test("subscription checkout guard blocks only subscriptions when OFF", () => {
  assert.equal(isSubscriptionCheckoutBlocked("subscription", false), true);
  assert.equal(isSubscriptionCheckoutBlocked("subscription", true), false);
  assert.equal(isSubscriptionCheckoutBlocked("pack", false), false);
  assert.equal(isSubscriptionCheckoutBlocked("bites", false), false);
});

test("subscription disabled response does not expose administrative configuration", () => {
  assert.deepEqual(buildSubscriptionsDisabledPayload(), {
    ok: false,
    code: SUBSCRIPTIONS_DISABLED_CODE,
    error: "Las suscripciones no están disponibles en este momento."
  });
});
