import assert from "node:assert/strict";
import test from "node:test";
import {
  isVisualOnboardingOwner,
  projectVisualOnboardingProgress,
  validateDraftPatch,
  validateSkipRequest,
  VisualOnboardingInputError
} from "./visualOnboardingCore.js";

test("draft patch accepts only resumable step and allowlisted draft responses", () => {
  assert.deepEqual(validateDraftPatch({
    expectedRevision: 0,
    currentStep: 1,
    responses: { weekSelection: "next_week" }
  }), {
    expectedRevision: 0,
    currentStep: 1,
    responses: { weekSelection: "next_week" }
  });
  assert.deepEqual(validateDraftPatch({
    expectedRevision: 2,
    responses: { weekSelection: null }
  }).responses, { weekSelection: null });
});

test("draft and skip validation reject unknown fields and invalid values", () => {
  const invalid = [
    () => validateDraftPatch({ expectedRevision: 0, status: "completed" }),
    () => validateDraftPatch({ expectedRevision: 0, householdId: "other-house" }),
    () => validateDraftPatch({ expectedRevision: 0, responses: { allergies: ["peanuts"] } }),
    () => validateDraftPatch({ expectedRevision: 0, responses: { weekSelection: "next_month" } }),
    () => validateDraftPatch({ expectedRevision: -1, currentStep: 0 }),
    () => validateDraftPatch({ expectedRevision: 0, currentStep: 101 }),
    () => validateSkipRequest({ expectedRevision: 0, reason: "done" })
  ];
  for (const action of invalid) assert.throws(action, VisualOnboardingInputError);
});

test("skip requires a revision for optimistic concurrency", () => {
  assert.deepEqual(validateSkipRequest({ expectedRevision: 4 }), { expectedRevision: 4 });
  assert.throws(() => validateSkipRequest({}), /expectedRevision es obligatorio/);
});

test("owner authorization requires the owner role and the household owner id", () => {
  const household = { ownerUserId: "owner-1" };
  assert.equal(isVisualOnboardingOwner({ _id: "owner-1", role: "owner" }, household), true);
  assert.equal(isVisualOnboardingOwner({ _id: "member-1", role: "member" }, household), false);
  assert.equal(isVisualOnboardingOwner({ _id: "owner-2", role: "owner" }, household), false);
  assert.equal(isVisualOnboardingOwner({ _id: "owner-1", role: "admin" }, household), false);
});

test("missing records project a resumable, empty first-run state", () => {
  assert.deepEqual(projectVisualOnboardingProgress(null, "house-1"), {
    householdId: "house-1",
    flowVersion: 1,
    status: "not_started",
    currentStep: 0,
    responses: {},
    revision: 0,
    createdAt: null,
    updatedAt: null
  });
});
