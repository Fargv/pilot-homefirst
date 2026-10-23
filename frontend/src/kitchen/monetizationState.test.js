import assert from "node:assert/strict";
import test from "node:test";
import { applySubscriptionsEnabled, isSubscriptionsFlagResolved } from "./monetizationState.js";

test("initial monetization state stays unresolved until the public flag arrives", () => {
  assert.equal(applySubscriptionsEnabled(null, undefined), null);
  assert.equal(isSubscriptionsFlagResolved(null), false);
});

test("a fresh OFF flag is applied without relogin and replaces a stale ON value", () => {
  assert.equal(applySubscriptionsEnabled(null, false), false);
  assert.equal(applySubscriptionsEnabled(true, false), false);
  assert.equal(isSubscriptionsFlagResolved(false), true);
});

test("ON remains available when the public flag is ON", () => {
  assert.equal(applySubscriptionsEnabled(false, true), true);
  assert.equal(isSubscriptionsFlagResolved(true), true);
});
