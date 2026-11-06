import test from "node:test";
import assert from "node:assert/strict";
import householdRouter, { getWeeklySchedule, patchWeeklySchedule } from "./household.js";
import { Household } from "../models/Household.js";

function responseStub() {
  return {
    statusCode: 200,
    body: null,
    status(code) { this.statusCode = code; return this; },
    json(body) { this.body = body; return this; }
  };
}

function mockHouseholdLookup(t, household) {
  const calls = [];
  t.mock.method(Household, "findById", (id) => {
    calls.push(String(id));
    return { select: async () => household };
  });
  t.mock.method(Household, "findOneAndUpdate", (filter, update) => {
    assert.equal(String(filter._id), String(household._id));
    assert.equal(String(filter.ownerUserId), String(household.ownerUserId));
    for (const [path, value] of Object.entries(update.$set || {})) {
      const [, field] = path.split(".");
      if (!household.weeklySchedule) household.weeklySchedule = {};
      household.weeklySchedule[field] = Array.isArray(value) ? [...value] : value;
    }
    for (const path of Object.keys(update.$unset || {})) {
      const [, field] = path.split(".");
      if (household.weeklySchedule) delete household.weeklySchedule[field];
    }
    return {
      select() {
        return { lean: async () => household.weeklySchedule ? structuredClone(household) : structuredClone(household) };
      }
    };
  });
  return calls;
}

test("schedule routes use owner authorization middleware", (t) => {
  for (const method of ["get", "patch"]) {
    const routeLayer = householdRouter.stack.find((layer) =>
      layer.route?.path === "/preferences/schedule" && layer.route.methods[method]
    );
    assert.ok(routeLayer, `${method} schedule route is registered`);
    assert.equal(routeLayer.route.stack.length, 3);
    const roleMiddleware = routeLayer.route.stack[1].handle;
    const res = responseStub();
    let nextCalled = false;
    roleMiddleware({ kitchenUser: { role: "member" } }, res, () => { nextCalled = true; });
    assert.equal(res.statusCode, 403);
    assert.equal(nextCalled, false);
  }
});

test("owner read uses effective household and reports an unconfigured agenda", async (t) => {
  const calls = mockHouseholdLookup(t, { _id: "house-a", ownerUserId: "owner-a", weeklySchedule: undefined });
  const res = responseStub();
  await getWeeklySchedule({
    user: { householdId: "house-a" },
    kitchenUser: { _id: "owner-a", role: "owner" },
    query: { householdId: "house-b" }
  }, res);

  assert.deepEqual(calls, ["house-a"]);
  assert.equal(res.statusCode, 200);
  assert.deepEqual(res.body, { ok: true, weeklySchedule: null });
});

test("partial update retains the other meal and changes only the requested meal", async (t) => {
  const household = {
    _id: "house-a",
    ownerUserId: "owner-a",
    weeklySchedule: { version: 1, dinnerDays: ["sat"] },
  };
  const calls = mockHouseholdLookup(t, household);
  const res = responseStub();
  await patchWeeklySchedule({
    user: { householdId: "house-a" },
    kitchenUser: { _id: "owner-a", role: "owner" },
    body: { lunchDays: ["mon", "wed"] }
  }, res);

  assert.deepEqual(calls, ["house-a"]);
  assert.deepEqual(res.body.weeklySchedule, {
    version: 1, lunchDays: ["mon", "wed"], dinnerDays: ["sat"]
  });
});

test("request cannot select a different household in the schedule payload", async (t) => {
  const household = {
    _id: "house-a", ownerUserId: "owner-a", weeklySchedule: undefined,
  };
  const calls = mockHouseholdLookup(t, household);
  const res = responseStub();
  await patchWeeklySchedule({
    user: { householdId: "house-a" },
    kitchenUser: { _id: "owner-a", role: "owner" },
    body: { lunchDays: ["mon"], householdId: "house-b" }
  }, res);

  assert.deepEqual(calls, ["house-a"]);
  assert.equal(res.statusCode, 400);
  assert.equal(household.weeklySchedule, undefined);
});

test("explicit empty days persist as none and null clears one meal back to inheritance", async (t) => {
  const household = {
    _id: "house-a",
    ownerUserId: "owner-a",
    weeklySchedule: { version: 1, dinnerDays: ["sat"] }
  };
  mockHouseholdLookup(t, household);
  const emptyResponse = responseStub();
  await patchWeeklySchedule({
    user: { householdId: "house-a" },
    kitchenUser: { _id: "owner-a", role: "owner" },
    body: { lunchDays: [] }
  }, emptyResponse);
  assert.deepEqual(emptyResponse.body.weeklySchedule.lunchDays, []);

  const clearResponse = responseStub();
  await patchWeeklySchedule({
    user: { householdId: "house-a" },
    kitchenUser: { _id: "owner-a", role: "owner" },
    body: { dinnerDays: null }
  }, clearResponse);
  assert.deepEqual(clearResponse.body.weeklySchedule, { version: 1, lunchDays: [], dinnerDays: null });
});

test("member or owner from another household cannot read or change the schedule", async (t) => {
  const household = { _id: "house-a", ownerUserId: "owner-a", weeklySchedule: { lunchDays: ["mon"] } };
  const calls = mockHouseholdLookup(t, household);
  const memberResponse = responseStub();
  await getWeeklySchedule({
    user: { householdId: "house-a" },
    kitchenUser: { _id: "member-a", role: "member" }
  }, memberResponse);
  const otherOwnerResponse = responseStub();
  await patchWeeklySchedule({
    user: { householdId: "house-a" },
    kitchenUser: { _id: "owner-b", role: "owner" },
    body: { lunchDays: ["fri"] }
  }, otherOwnerResponse);

  assert.deepEqual(calls, ["house-a", "house-a"]);
  assert.equal(memberResponse.statusCode, 403);
  assert.equal(otherOwnerResponse.statusCode, 403);
  assert.deepEqual(household.weeklySchedule, { lunchDays: ["mon"] });
});

test("invalid days and duplicate values return 400 without saving", async (t) => {
  const household = {
    _id: "house-a", ownerUserId: "owner-a", weeklySchedule: undefined,
  };
  mockHouseholdLookup(t, household);
  const res = responseStub();
  await patchWeeklySchedule({
    user: { householdId: "house-a" },
    kitchenUser: { _id: "owner-a", role: "owner" },
    body: { dinnerDays: ["mon", "mon"] }
  }, res);
  assert.equal(res.statusCode, 400);
  assert.equal(household.weeklySchedule, undefined);
});

test("concurrent partial patches retain both meals and other household preferences", async (t) => {
  const household = {
    _id: "house-a",
    ownerUserId: "owner-a",
    weeklySchedule: undefined,
    dinnersEnabled: true,
    monthlyBudget: 240
  };
  mockHouseholdLookup(t, household);
  const makeRequest = (body) => ({
    user: { householdId: "house-a" },
    kitchenUser: { _id: "owner-a", role: "owner" },
    body
  });
  const lunchResponse = responseStub();
  const dinnerResponse = responseStub();

  await Promise.all([
    patchWeeklySchedule(makeRequest({ lunchDays: ["mon", "wed"] }), lunchResponse),
    patchWeeklySchedule(makeRequest({ dinnerDays: ["sat"] }), dinnerResponse)
  ]);

  assert.deepEqual(household.weeklySchedule, {
    version: 1,
    lunchDays: ["mon", "wed"],
    dinnerDays: ["sat"]
  });
  assert.equal(household.dinnersEnabled, true);
  assert.equal(household.monthlyBudget, 240);
});
