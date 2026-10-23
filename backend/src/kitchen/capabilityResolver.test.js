import assert from "node:assert/strict";
import test from "node:test";
import { resolveHouseholdCapabilities } from "./capabilityResolver.js";
import { getSubscriptionsEnabled, resetMonetizationConfigCache } from "./monetizationConfigService.js";

const basic = { subscriptionPlan: "basic", subscriptionStatus: "inactive" };
const pro = { subscriptionPlan: "pro", subscriptionStatus: "active" };
const betaPro = { subscriptionPlan: "pro", planSource: "beta_pro", betaPro: { active: true } };

test("subscriptions ON preserves real plan capabilities and no catalog entitlement", async () => {
  const result = await resolveHouseholdCapabilities(pro, { subscriptionsEnabled: true });
  assert.equal(result.subscriptionsEnabled, true);
  assert.equal(result.functional.budget, true);
  assert.equal(result.catalogIncludedPacks, null);
});

test("subscriptions OFF enables functional capabilities without changing household data", async () => {
  const result = await resolveHouseholdCapabilities(basic, { subscriptionsEnabled: false });
  assert.deepEqual(result.functional, {
    budget: true, fullWeekRandomization: true, singleDayRandomization: true,
    dietRandomization: true, dinners: true, basics: true
  });
  assert.equal(basic.subscriptionPlan, "basic");
  assert.equal(basic.subscriptionStatus, "inactive");
  assert.equal(result.catalogIncludedPacks, null);
});

test("Beta Pro remains functional and catalog-independent", async () => {
  const result = await resolveHouseholdCapabilities(betaPro, { subscriptionsEnabled: false });
  assert.equal(result.functional.dinners, true);
  assert.equal(result.catalogIncludedPacks, null);
});

test("config reader coalesces concurrent reads and fails conservatively", async () => {
  resetMonetizationConfigCache();
  const first = getSubscriptionsEnabled();
  const second = getSubscriptionsEnabled();
  assert.deepEqual(await Promise.all([first, second]), [true, true]);
});
