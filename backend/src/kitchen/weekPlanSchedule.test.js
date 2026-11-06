import test from "node:test";
import assert from "node:assert/strict";
import { Household } from "./models/Household.js";
import { KitchenUser } from "./models/KitchenUser.js";
import { KitchenDish } from "./models/KitchenDish.js";
import { HiddenMaster } from "./models/HiddenMaster.js";
import { KitchenIngredient } from "./models/KitchenIngredient.js";
import { KitchenWeekPlan } from "./models/KitchenWeekPlan.js";
import { addPendingDinnerSlotsToUpcomingPlans, createOrGetWeekPlan, resetScheduledMealSlots } from "./weekPlanService.js";
import { buildAggregatedFromWeek } from "./shoppingService.js";
import { getWeekStart } from "./utils/dates.js";
import { getScheduledWeekDates } from "./weeklySchedule.js";

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

function mockPlanQueries(t, plans) {
  t.mock.method(KitchenWeekPlan, "find", () => ({
    sort() {
      return {
        select() {
          return { lean: async () => plans };
        }
      };
    }
  }));
  t.mock.method(KitchenWeekPlan, "updateOne", async (filter, update) => {
    const plan = plans.find((entry) => String(entry._id) === String(filter._id));
    if (!plan) return { modifiedCount: 0 };
    const slot = update.$push.days;
    const dateKey = slot.date.toISOString().slice(0, 10);
    const alreadyExists = plan.days.some((day) =>
      day.mealType === slot.mealType && day.date.toISOString().slice(0, 10) === dateKey
    );
    const removed = (plan.removedSlots || []).some((entry) =>
      entry.mealType === slot.mealType && entry.date.toISOString().slice(0, 10) === dateKey
    );
    if (alreadyExists || removed) return { modifiedCount: 0 };
    plan.days.push(slot);
    return { modifiedCount: 1 };
  });
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

test("enabling dinners later fills scheduled slots in existing upcoming plans without restoring removals", async (t) => {
  const existingSaturday = {
    date: new Date("2026-10-31T00:00:00.000Z"),
    mealType: "dinner",
    attendeeIds: ["manual-attendee"],
    servings: 4,
    mainDishId: "manual-dish"
  };
  const plan = {
    _id: "plan-a",
    weekStart: monday,
    days: [existingSaturday],
    removedSlots: [{ date: new Date("2026-11-01T00:00:00.000Z"), mealType: "dinner" }],
  };
  t.mock.method(Household, "findById", () => ({
    select() {
      return { lean: async () => ({
        dinnersEnabled: true,
        dinnersIncludeInShopping: true,
        weeklySchedule: { version: 1, dinnerDays: ["mon", "sat", "sun"] }
      }) };
    }
  }));
  t.mock.method(KitchenUser, "find", () => ({
    select() { return { lean: async () => [{ _id: "member-a", active: true, dinnerActive: true }] }; }
  }));
  mockPlanQueries(t, [plan]);

  const [first, second] = await Promise.all([
    addPendingDinnerSlotsToUpcomingPlans("house-1", { explicitlyActivated: true, fromDate: monday }),
    addPendingDinnerSlotsToUpcomingPlans("house-1", { explicitlyActivated: true, fromDate: monday })
  ]);
  assert.equal(first.createdSlots + second.createdSlots, 1);
  assert.equal(first.updatedPlans + second.updatedPlans, 1);
  assert.equal(plan.days.length, 2);
  assert.deepEqual(isoDays(plan, "dinner").sort(), ["2026-10-26", "2026-10-31"]);
  assert.deepEqual(plan.days.find((day) => day.mainDishId === "manual-dish"), existingSaturday);
});

test("backfilling an old plan inherits Monday to Friday and respects disabled or empty dinner settings", async (t) => {
  const plans = [
    { _id: "plan-a", weekStart: monday, days: [], removedSlots: [] },
    { _id: "plan-b", weekStart: new Date("2026-11-02T00:00:00.000Z"), days: [], removedSlots: [] }
  ];
  let household = { dinnersEnabled: true, weeklySchedule: { version: 1 } };
  t.mock.method(Household, "findById", () => ({
    select() { return { lean: async () => household }; }
  }));
  t.mock.method(KitchenUser, "find", () => ({
    select() { return { lean: async () => [{ _id: "member-a", active: true, dinnerActive: true }] }; }
  }));
  mockPlanQueries(t, plans);

  const inherited = await addPendingDinnerSlotsToUpcomingPlans("house-1", { explicitlyActivated: true, fromDate: monday });
  assert.deepEqual(inherited, { updatedPlans: 2, createdSlots: 10 });
  assert.deepEqual(isoDays(plans[0], "dinner"), ["2026-10-26", "2026-10-27", "2026-10-28", "2026-10-29", "2026-10-30"]);

  household = { dinnersEnabled: true, weeklySchedule: { version: 1, dinnerDays: [] } };
  const empty = await addPendingDinnerSlotsToUpcomingPlans("house-1", { explicitlyActivated: true, fromDate: monday });
  assert.deepEqual(empty, { updatedPlans: 0, createdSlots: 0 });

  household = { dinnersEnabled: false, weeklySchedule: { version: 1, dinnerDays: ["mon"] } };
  const disabled = await addPendingDinnerSlotsToUpcomingPlans("house-1", { explicitlyActivated: true, fromDate: monday });
  assert.deepEqual(disabled, { updatedPlans: 0, createdSlots: 0 });
});

test("changing the agenda does not backfill dinners without an explicit activation", async (t) => {
  let reads = 0;
  const plan = { _id: "plan-a", weekStart: monday, days: [], removedSlots: [] };
  // No household or plan reads should happen on a schedule-only update path.
  t.mock.method(Household, "findById", () => { reads += 1; throw new Error("unexpected backfill"); });
  const result = await addPendingDinnerSlotsToUpcomingPlans("house-1", { fromDate: monday });
  assert.deepEqual(result, { updatedPlans: 0, createdSlots: 0 });
  assert.equal(reads, 0);
  assert.deepEqual(plan.days, []);
});

test("reset of a legacy week clears weekday dishes and keeps manual weekend and other-meal slots", () => {
  const manualSaturday = {
    date: new Date("2026-10-31T00:00:00.000Z"), mealType: "lunch", mainDishId: "manual-sat",
    attendeeIds: ["manual-member"], servings: 4, cookUserId: "manual-cook"
  };
  const mondayLunch = {
    date: monday, mealType: "lunch", mainDishId: "weekday-dish", attendeeIds: ["manual-member"], servings: 3
  };
  const dinnerSlot = { date: monday, mealType: "dinner", mainDishId: "dinner-dish", servings: 2 };
  const plan = { days: [mondayLunch, manualSaturday, dinnerSlot], removedSlots: [] };

  resetScheduledMealSlots(plan, "lunch", getScheduledWeekDates(monday, undefined), ["default-member"]);

  assert.equal(mondayLunch.mainDishId, null);
  assert.deepEqual(mondayLunch.attendeeIds, ["default-member"]);
  assert.equal(plan.days.length, 7);
  assert.equal(plan.days.find((day) => day.mainDishId === "manual-sat"), manualSaturday);
  assert.deepEqual(manualSaturday.attendeeIds, ["manual-member"]);
  assert.equal(plan.days.find((day) => day.mealType === "dinner"), dinnerSlot);
  assert.equal(plan.days.filter((day) => day.mealType === "lunch").length, 6);
});

test("reset follows a custom weekend agenda, dinner shopping preference, and preserves other slots", () => {
  const saturday = new Date("2026-10-31T00:00:00.000Z");
  const sunday = new Date("2026-11-01T00:00:00.000Z");
  const weekdayManual = { date: monday, mealType: "dinner", mainDishId: "manual-weekday", servings: 5 };
  const saturdayDish = { date: saturday, mealType: "dinner", mainDishId: "manual-saturday", servings: 4 };
  const otherMeal = { date: sunday, mealType: "lunch", mainDishId: "other-meal", servings: 2 };
  const plan = { days: [weekdayManual, saturdayDish, otherMeal], removedSlots: [] };

  resetScheduledMealSlots(plan, "dinner", getScheduledWeekDates(monday, ["sat", "sun"]), ["diner"], {
    dinnerIncludeInShopping: true
  });
  assert.equal(saturdayDish.mainDishId, null);
  assert.equal(saturdayDish.includeMainIngredients, true);
  assert.equal(saturdayDish.includeSideIngredients, true);
  const sundayDinner = plan.days.find((day) => day.mealType === "dinner" && day.date.toISOString() === sunday.toISOString());
  assert.ok(sundayDinner);
  assert.equal(sundayDinner.mainDishId, undefined);
  assert.equal(sundayDinner.includeMainIngredients, true);
  assert.equal(sundayDinner.includeSideIngredients, true);
  assert.equal(weekdayManual.mainDishId, "manual-weekday");
  assert.equal(otherMeal.mainDishId, "other-meal");
  assert.equal(otherMeal.includeMainIngredients, undefined);

  const snapshot = structuredClone(plan.days);
  resetScheduledMealSlots(plan, "dinner", getScheduledWeekDates(monday, []), ["diner"]);
  assert.deepEqual(plan.days, snapshot);
});

test("reset disables dinner shopping flags when the household preference is false", () => {
  const mondayDinner = {
    date: monday, mealType: "dinner", mainDishId: "manual-dinner",
    includeMainIngredients: true, includeSideIngredients: true
  };
  const plan = { days: [mondayDinner], removedSlots: [] };

  resetScheduledMealSlots(plan, "dinner", [monday], ["diner"], { dinnerIncludeInShopping: false });

  assert.equal(mondayDinner.includeMainIngredients, false);
  assert.equal(mondayDinner.includeSideIngredients, false);
});

test("shopping aggregation follows dinner ingredient flags after reset for true and false preferences", async (t) => {
  const mainDishId = "507f1f77bcf86cd799439011";
  const sideDishId = "507f1f77bcf86cd799439012";
  const plan = {
    days: [{ date: monday, mealType: "dinner", mainDishId, sideDishId, servings: 1 }]
  };
  t.mock.method(KitchenWeekPlan, "findOne", async () => plan);
  // Return in-memory dish records from the catalog resolver's backing query.
  t.mock.method(KitchenDish, "find", () => ({
    sort() {
      return Promise.resolve([
        { _id: mainDishId, ingredients: [{ canonicalName: "main ingredient", displayName: "Main ingredient", quantity: 1, unit: "unit" }] },
        { _id: sideDishId, ingredients: [{ canonicalName: "side ingredient", displayName: "Side ingredient", quantity: 1, unit: "unit" }] }
      ]);
    }
  }));
  t.mock.method(HiddenMaster, "find", () => ({ select() { return []; } }));
  t.mock.method(KitchenIngredient, "find", () => ({ select() { return { lean: async () => [] }; } }));
  for (const include of [true, false]) {
    resetScheduledMealSlots(plan, "dinner", [monday], [], { dinnerIncludeInShopping: include });
    plan.days[0].mainDishId = mainDishId;
    plan.days[0].sideDishId = sideDishId;
    const items = await buildAggregatedFromWeek(monday, "house-1");
    const names = items.map((item) => item.canonicalName);
    assert.equal(names.includes("main ingredient"), include);
    assert.equal(names.includes("side ingredient"), include);
  }
});
