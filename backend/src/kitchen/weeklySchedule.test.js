import test from "node:test";
import assert from "node:assert/strict";
import { getWeekStart } from "./utils/dates.js";
import {
  buildWeeklyScheduleAtomicUpdate,
  clearRemovedPlanSlot,
  getScheduledWeekDates,
  isActualHouseholdOwner,
  isRemovedPlanSlot,
  recordRemovedPlanSlot,
  validateWeeklyScheduleDays
} from "./weeklySchedule.js";

const monday = getWeekStart(new Date("2026-10-26T12:00:00.000Z"));
const dates = (values) => values.map((date) => date.toISOString().slice(0, 10));

test("an unset schedule inherits Monday to Friday; an explicit empty schedule selects no days", () => {
  assert.deepEqual(dates(getScheduledWeekDates(monday, undefined)), [
    "2026-10-26", "2026-10-27", "2026-10-28", "2026-10-29", "2026-10-30"
  ]);
  assert.deepEqual(getScheduledWeekDates(monday, []), []);
});

test("configured stable day identifiers select dates chronologically, including weekends", () => {
  assert.deepEqual(dates(getScheduledWeekDates(monday, ["sun", "wed", "sat"])), [
    "2026-10-28", "2026-10-31", "2026-11-01"
  ]);
});

test("schedule validation accepts empty arrays and rejects unknown or duplicate days", () => {
  assert.equal(validateWeeklyScheduleDays([]), null);
  assert.equal(validateWeeklyScheduleDays(["mon", "fri"]), null);
  assert.match(validateWeeklyScheduleDays(["mon", "monday"]), /no válido/);
  assert.match(validateWeeklyScheduleDays(["mon", "mon"]), /duplicados/);
  assert.match(validateWeeklyScheduleDays("mon"), /lista/);
});

test("partial updates write only the requested field, preserving sibling fields atomically", () => {
  assert.deepEqual(buildWeeklyScheduleAtomicUpdate({ lunchDays: ["mon"] }), {
    $set: { "weeklySchedule.version": 1, "weeklySchedule.lunchDays": ["mon"] }
  });
  assert.deepEqual(buildWeeklyScheduleAtomicUpdate({ dinnerDays: [] }), {
    $set: { "weeklySchedule.version": 1, "weeklySchedule.dinnerDays": [] }
  });
  assert.deepEqual(buildWeeklyScheduleAtomicUpdate({ lunchDays: null }), {
    $set: { "weeklySchedule.version": 1 },
    $unset: { "weeklySchedule.lunchDays": "" }
  });
});

test("removed slots stay suppressed until explicitly re-added", () => {
  const plan = { removedSlots: [] };
  const saturday = new Date("2026-10-31T00:00:00.000Z");
  recordRemovedPlanSlot(plan, saturday, "dinner");
  recordRemovedPlanSlot(plan, saturday, "dinner");
  assert.equal(plan.removedSlots.length, 1);
  assert.equal(isRemovedPlanSlot(plan, saturday, "dinner"), true);
  assert.equal(isRemovedPlanSlot(plan, saturday, "lunch"), false);
  clearRemovedPlanSlot(plan, saturday, "dinner");
  assert.equal(isRemovedPlanSlot(plan, saturday, "dinner"), false);
});

test("only the actual owner of the effective household passes the write guard", () => {
  const household = { ownerUserId: "owner-1" };
  assert.equal(isActualHouseholdOwner({ _id: "owner-1", role: "owner" }, household), true);
  assert.equal(isActualHouseholdOwner({ _id: "member-1", role: "member" }, household), false);
  assert.equal(isActualHouseholdOwner({ _id: "owner-2", role: "owner" }, household), false);
  assert.equal(isActualHouseholdOwner({ _id: "diod-1", role: "admin", globalRole: "diod" }, household), false);
});
