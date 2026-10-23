import test from "node:test";
import assert from "node:assert/strict";
import { isEligibleForHardRestrictions, validatePersonalization } from "./personalizationContract.js";

const evidence = { source: "recipe-review", sourceVersion: "v1", contentHash: `sha256:${"a".repeat(64)}`, assessedAt: "2026-10-24T12:00:00.000Z" };
const valid = {
  schemaVersion: 1,
  mealSlots: ["lunch"],
  ingredientsComplete: "unknown",
  baseServings: null,
  provenance: { source: "catalog", sourceVersion: "v1", contentHash: `sha256:${"b".repeat(64)}` },
  assessments: { allergens: { peanuts: { status: "compatible", evidence } }, diets: { vegan: { status: "unknown" } } }
};

test("accepts valid extensible metadata and explicitly incomplete ingredients", () => {
  assert.deepEqual(validatePersonalization(valid), { valid: true, errors: [] });
  assert.deepEqual(validatePersonalization({ ...valid, ingredientsComplete: "incomplete" }), { valid: true, errors: [] });
  const { baseServings: _unused, ...withoutServings } = valid;
  assert.equal(validatePersonalization(withoutServings).valid, false);
});

test("rejects malformed contracts, missing known-status evidence, and unknown versions", () => {
  assert.equal(validatePersonalization({ ...valid, schemaVersion: 9 }).valid, false);
  assert.equal(validatePersonalization({ ...valid, mealSlots: ["brunch"] }).valid, false);
  assert.equal(validatePersonalization({ ...valid, assessments: { allergens: { peanuts: { status: "compatible" } } } }).valid, false);
  assert.equal(validatePersonalization({ ...valid, ingredientsComplete: true }).valid, false);
  assert.equal(validatePersonalization({ ...valid, provenance: { ...valid.provenance, contentHash: "not-a-hash" } }).valid, false);
});

test("hard restrictions exclude unknown and incompatible, admit only verified compatible", () => {
  assert.deepEqual(isEligibleForHardRestrictions(undefined, {}), { eligible: true, reason: "no-hard-restrictions" });
  assert.equal(isEligibleForHardRestrictions(undefined, { allergens: ["peanuts"] }).reason, "unknown");
  assert.equal(isEligibleForHardRestrictions({ ...valid, assessments: { allergens: { peanuts: { status: "unknown" } } } }, { allergens: ["peanuts"] }).reason, "unknown");
  assert.equal(isEligibleForHardRestrictions({ ...valid, assessments: { allergens: { peanuts: { status: "incompatible", evidence } } } }, { allergens: ["peanuts"] }).reason, "incompatible");
  assert.equal(isEligibleForHardRestrictions(valid, { allergens: ["peanuts"] }).reason, "verified-compatible");
  assert.equal(isEligibleForHardRestrictions({ ...valid, schemaVersion: 2 }, { allergens: ["peanuts"] }).eligible, false);
});
