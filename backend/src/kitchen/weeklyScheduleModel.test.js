import test from "node:test";
import assert from "node:assert/strict";
import mongoose from "mongoose";
import { Household } from "./models/Household.js";

function buildHousehold(weeklySchedule) {
  return new Household({
    name: "Hogar de prueba",
    ownerUserId: new mongoose.Types.ObjectId(),
    weeklySchedule
  });
}

function hasErrorForPrefix(error, prefix) {
  return Object.keys(error?.errors || {}).some((path) => path === prefix || path.startsWith(`${prefix}.`));
}

test("legacy households may omit the optional schedule and empty days remain explicit", () => {
  const legacy = buildHousehold(undefined);
  assert.equal(legacy.weeklySchedule, undefined);

  const explicitNone = buildHousehold({ version: 1, lunchDays: [], dinnerDays: [] });
  assert.equal(explicitNone.validateSync(), undefined);
  assert.deepEqual(explicitNone.weeklySchedule.lunchDays, []);
  assert.deepEqual(explicitNone.weeklySchedule.dinnerDays, []);
});

test("Mongoose rejects duplicate days, unsupported identifiers, and versions", () => {
  const duplicate = buildHousehold({ version: 1, lunchDays: ["mon", "mon"] }).validateSync();
  assert.ok(hasErrorForPrefix(duplicate, "weeklySchedule.lunchDays"));

  const unknownDay = buildHousehold({ version: 1, dinnerDays: ["monday"] }).validateSync();
  assert.ok(hasErrorForPrefix(unknownDay, "weeklySchedule.dinnerDays"));

  const unsupportedVersion = buildHousehold({ version: 2, lunchDays: ["mon"] }).validateSync();
  assert.ok(hasErrorForPrefix(unsupportedVersion, "weeklySchedule.version"));
});
