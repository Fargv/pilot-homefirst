import test from "node:test";
import assert from "node:assert/strict";
import { isEligibleForHardRestrictions, validatePersonalization } from "./personalizationContract.js";

const currentContentHash = `sha256:${"c".repeat(64)}`;
const evidence = { assessmentId: "assessment-1", source: "recipe-review", sourceVersion: "v1", contentHash: currentContentHash, assessedAt: "2026-10-24T12:00:00.000Z" };
const valid = {
  schemaVersion: 1,
  mealSlots: ["lunch"],
  ingredientsComplete: "complete",
  baseServings: 2,
  provenance: { source: "catalog", sourceVersion: "v1", contentHash: currentContentHash },
  assessments: {
    allergens: { peanuts: { status: "compatible", evidence, crossContact: { status: "compatible", evidence: { ...evidence, assessmentId: "cross-contact-1" } } } },
    diets: { vegan: { status: "unknown" } }
  }
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

test("hard restrictions admit only complete, current assessments accepted by a trusted verifier", () => {
  assert.deepEqual(isEligibleForHardRestrictions(undefined, {}), { eligible: true, reason: "no-hard-restrictions" });
  assert.equal(isEligibleForHardRestrictions(undefined, { allergens: ["peanuts"] }).reason, "unknown");
  assert.equal(isEligibleForHardRestrictions({ ...valid, assessments: { allergens: { peanuts: { status: "unknown" } } } }, { allergens: ["peanuts"] }).reason, "unknown");
  assert.equal(isEligibleForHardRestrictions({ ...valid, assessments: { allergens: { peanuts: { status: "incompatible", evidence } } } }, { allergens: ["peanuts"] }).reason, "incompatible");
  const options = { currentContentHash, verifyEvidence: () => true };
  assert.equal(isEligibleForHardRestrictions({ ...valid, ingredientsComplete: "unknown" }, { allergens: ["peanuts"] }, options).reason, "unknown");
  assert.equal(isEligibleForHardRestrictions({ ...valid, ingredientsComplete: "incomplete" }, { allergens: ["peanuts"] }, options).reason, "unknown");
  assert.equal(isEligibleForHardRestrictions(valid, { allergens: ["peanuts"] }, {}).reason, "unknown");
  assert.equal(isEligibleForHardRestrictions(valid, { allergens: ["peanuts"] }, { ...options, verifyEvidence: () => false }).reason, "unknown");
  assert.equal(isEligibleForHardRestrictions(valid, { allergens: ["peanuts"] }, { ...options, currentContentHash: `sha256:${"d".repeat(64)}` }).reason, "unknown");
  const unknownCrossContact = { ...valid, assessments: { allergens: { peanuts: { status: "compatible", evidence, crossContact: { status: "unknown" } } } } };
  assert.equal(isEligibleForHardRestrictions(unknownCrossContact, { allergens: ["peanuts"] }, options).reason, "unknown");
  assert.equal(isEligibleForHardRestrictions(valid, { allergens: ["peanuts"] }, options).reason, "verified-compatible");
  assert.equal(isEligibleForHardRestrictions({ ...valid, schemaVersion: 2 }, { allergens: ["peanuts"] }).eligible, false);
});
