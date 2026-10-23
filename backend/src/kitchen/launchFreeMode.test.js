import assert from "node:assert/strict";
import test from "node:test";
import { getCycleWeekIndex, getHouseholdCurriculum } from "./weeklyEngine.js";

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

test("advanced cycle progress survives ON → OFF → ON resolution", () => {
  const cycleStart = new Date("2026-10-05T00:00:00.000Z");
  const advancedWeek = new Date("2026-10-26T00:00:00.000Z");
  const household = { subscriptionPlan: "basic", weeklyChallengeCycleStartedAt: cycleStart };

  assert.equal(getCycleWeekIndex(advancedWeek, cycleStart), 4);
  assert.equal(getHouseholdCurriculum(household, true), "basic");
  assert.equal(getHouseholdCurriculum(household, false), "pro");
  assert.equal(getHouseholdCurriculum(household, true), "basic");
  assert.equal(household.weeklyChallengeCycleStartedAt, cycleStart);
});
