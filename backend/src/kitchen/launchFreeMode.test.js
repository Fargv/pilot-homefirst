import assert from "node:assert/strict";
import test from "node:test";
import { getHouseholdCurriculum } from "./weeklyEngine.js";

test("OFF exposes the Pro weekly curriculum to Basic and Free households", () => {
  assert.equal(getHouseholdCurriculum({ subscriptionPlan: "basic" }, false), "pro");
  assert.equal(getHouseholdCurriculum({ subscriptionPlan: "free" }, false), "pro");
});

test("ON preserves the existing plan-based weekly curriculum", () => {
  assert.equal(getHouseholdCurriculum({ subscriptionPlan: "basic" }, true), "basic");
  assert.equal(getHouseholdCurriculum({ subscriptionPlan: "free" }, true), "basic");
  assert.equal(getHouseholdCurriculum({ subscriptionPlan: "pro" }, true), "pro");
  assert.equal(getHouseholdCurriculum({ subscriptionPlan: "premium" }, true), "pro");
});

test("OFF does not make the curriculum resolver mutate subscription state", () => {
  const household = {
    subscriptionPlan: "basic",
    planSource: "manual",
    subscriptionStatus: "inactive",
    stripeSubscriptionId: "",
    freeBitesBalance: 12,
    purchasedBitesBalance: 4
  };
  const before = structuredClone(household);

  assert.equal(getHouseholdCurriculum(household, false), "pro");
  assert.deepEqual(household, before);
});
