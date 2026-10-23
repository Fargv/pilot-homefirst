import assert from "node:assert/strict";
import test from "node:test";
import { resolveFunctionalCapabilities } from "./capabilityResolverCore.js";
import { createSubscriptionsConfigReader } from "./monetizationConfigCore.js";

const basic = { subscriptionPlan: "basic", subscriptionStatus: "inactive" };

test("missing configuration defaults to ON without a write", async () => {
  let reads = 0;
  const reader = createSubscriptionsConfigReader({ read: async () => { reads += 1; return null; } });
  assert.equal(await reader.getSubscriptionsEnabled(), true);
  assert.equal(reads, 1);
});

test("failed configuration reads default to ON", async () => {
  const reader = createSubscriptionsConfigReader({ read: async () => { throw new Error("offline"); }, logger: { error() {} } });
  assert.equal(await reader.getSubscriptionsEnabled(), true);
});

test("coalesces concurrent reads, caches, and supports invalidation", async () => {
  let reads = 0;
  const reader = createSubscriptionsConfigReader({
    read: async () => { reads += 1; await new Promise((resolve) => setTimeout(resolve, 1)); return { subscriptionsEnabled: false }; }
  });
  assert.deepEqual(await Promise.all([reader.getSubscriptionsEnabled(), reader.getSubscriptionsEnabled()]), [false, false]);
  assert.equal(reads, 1);
  assert.equal(await reader.getSubscriptionsEnabled(), false);
  assert.equal(reads, 1);
  reader.reset();
  assert.equal(await reader.getSubscriptionsEnabled(), false);
  assert.equal(reads, 2);
});

test("ON preserves Basic and OFF grants only the explicit functional allowlist", async () => {
  const current = { budget: false, fullWeekRandomization: false, singleDayRandomization: true, dietRandomization: false, dinners: false, basics: false, futureField: false };
  const on = resolveFunctionalCapabilities(current, true);
  assert.equal(on.budget, false);
  const off = resolveFunctionalCapabilities(current, false);
  assert.deepEqual(Object.keys(off).sort(), ["basics", "budget", "dietRandomization", "dinners", "fullWeekRandomization", "singleDayRandomization"].sort());
  assert.ok(Object.values(off).every(Boolean));
  assert.equal(basic.subscriptionPlan, "basic");
  assert.equal(basic.subscriptionStatus, "inactive");
});

test("ON preserves Pro capabilities and does not create catalog entitlements", async () => {
  const result = resolveFunctionalCapabilities({ budget: true }, true);
  assert.equal(result.budget, true);
  assert.equal(result.catalogIncludedPacks, undefined);
});
