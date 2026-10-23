import test from "node:test";
import assert from "node:assert/strict";
import { Household } from "./models/Household.js";
import { KitchenUser } from "./models/KitchenUser.js";
import { KitchenWeekPlan } from "./models/KitchenWeekPlan.js";
import { createOrGetWeekPlan } from "./weekPlanService.js";
import { getWeekStart } from "./utils/dates.js";

const monday = getWeekStart(new Date("2026-10-26T12:00:00.000Z"));
const isoDays = (plan, mealType) => plan.days
  .filter((day) => day.mealType === mealType)
  .map((day) => day.date.toISOString().slice(0, 10));

function mockFindQuery(t, members, household) {
  t.mock.method(KitchenUser, "find", () => ({
    select() {
      return { lean: async () => members };
    }
  }));
  t.mock.method(Household, "findById", () => ({
    select() {
      return { lean: async () => household };
    }
  }));
  t.mock.method(KitchenWeekPlan, "create", async (value) => value);
}

test("new week uses distinct household lunch and dinner days and existing participation fields", async (t) => {
  const members = [
    { _id: "member-a", active: true, dinnerActive: true },
    { _id: "member-b", active: true, dinnerActive: false },
    { _id: "member-c", active: false, dinnerActive: true }
  ];
  mockFindQuery(t, members, {
    dinnersEnabled: true,
    dinnersIncludeInShopping: true,
    weeklySchedule: { version: 1, lunchDays: ["mon", "wed"], dinnerDays: ["sat"] }
  });
  t.mock.method(KitchenWeekPlan, "findOne", async () => null);

  const { plan, created } = await createOrGetWeekPlan(monday, "house-1");
  assert.equal(created, true);
  assert.deepEqual(isoDays(plan, "lunch"), ["2026-10-26", "2026-10-28"]);
  assert.deepEqual(isoDays(plan, "dinner"), ["2026-10-31"]);
  assert.deepEqual(plan.days.find((day) => day.mealType === "lunch").attendeeIds, ["member-a", "member-b"]);
  assert.deepEqual(plan.days.find((day) => day.mealType === "dinner").attendeeIds, ["member-a"]);
  assert.equal(plan.days.find((day) => day.mealType === "dinner").includeMainIngredients, true);
});

test("new week preserves legacy weekdays when a meal schedule is unconfigured", async (t) => {
  mockFindQuery(t, [{ _id: "member-a", active: true, dinnerActive: true }], { dinnersEnabled: true });
  t.mock.method(KitchenWeekPlan, "findOne", async () => null);

  const { plan } = await createOrGetWeekPlan(monday, "house-legacy");
  assert.deepEqual(isoDays(plan, "lunch"), ["2026-10-26", "2026-10-27", "2026-10-28", "2026-10-29", "2026-10-30"]);
  assert.deepEqual(isoDays(plan, "dinner"), ["2026-10-26", "2026-10-27", "2026-10-28", "2026-10-29", "2026-10-30"]);
});

test("an explicit empty list creates no slots, and disabled dinners remain disabled", async (t) => {
  mockFindQuery(t, [{ _id: "member-a", active: true, dinnerActive: true }], {
    dinnersEnabled: false,
    weeklySchedule: { version: 1, lunchDays: [], dinnerDays: ["sat"] }
  });
  t.mock.method(KitchenWeekPlan, "findOne", async () => null);

  const { plan } = await createOrGetWeekPlan(monday, "house-empty");
  assert.deepEqual(plan.days, []);
});

test("looking up an existing week never changes its days or attendees", async (t) => {
  const existingPlan = {
    weekStart: monday,
    days: [{ date: monday, mealType: "lunch", attendeeIds: ["manual-member"], servings: 7 }],
    saveCount: 0,
    async save() { this.saveCount += 1; }
  };
  t.mock.method(KitchenWeekPlan, "findOne", async () => existingPlan);
  const findMembers = t.mock.method(KitchenUser, "find", () => {
    throw new Error("existing plans must not re-read participation");
  });
  const findHousehold = t.mock.method(Household, "findById", () => {
    throw new Error("existing plans must not re-read schedule preferences");
  });

  const result = await createOrGetWeekPlan(monday, "house-existing");
  assert.equal(result.plan, existingPlan);
  assert.equal(result.created, false);
  assert.equal(existingPlan.days.length, 1);
  assert.deepEqual(existingPlan.days[0].attendeeIds, ["manual-member"]);
  assert.equal(existingPlan.days[0].servings, 7);
  assert.equal(existingPlan.saveCount, 0);
  assert.equal(findMembers.mock.callCount(), 0);
  assert.equal(findHousehold.mock.callCount(), 0);
});
