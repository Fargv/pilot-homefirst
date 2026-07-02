/**
 * Guided tour — pure-logic tests (no DB required).
 * Run: cd backend && node --test src/kitchen/guidedTourService.test.js
 *
 * DB-backed transitions (start/progress/complete/skip/resend) require a live
 * Mongo instance and are exercised manually; these tests pin down the parts
 * that silently break: legacy-doc normalization, the anti-farming reward map,
 * and the contract between frontend step config and backend reward whitelist.
 */

import assert from "node:assert/strict";
import test from "node:test";
import { normalizeGuidedTour, TOUR_STEP_REWARDS } from "./guidedTourService.js";
import { TOUR_STEPS, PROGRESS_STEPS } from "../../../frontend/src/kitchen/components/tour/guidedTourSteps.js";

test("legacy onboarding docs (no guidedTour) normalize to status none — never auto-launch", () => {
  const tour = normalizeGuidedTour(null);
  assert.equal(tour.status, "none");
  assert.equal(tour.currentStepIndex, 0);
  assert.deepEqual(tour.rewardedSteps, []);
  assert.equal(tour.testMode, false);
});

test("partial tour subdocs normalize with safe defaults", () => {
  const tour = normalizeGuidedTour({ status: "pending", lastSentAt: new Date("2026-07-01") });
  assert.equal(tour.status, "pending");
  assert.equal(tour.totalTourBites, 0);
  assert.deepEqual(tour.rewardedSteps, []);
  assert.ok(tour.lastSentAt);
});

test("normalize preserves rewardedSteps so resends cannot farm bites", () => {
  const tour = normalizeGuidedTour({
    status: "completed",
    rewardedSteps: ["planning", "shopping", "finish"],
    totalTourBites: 15
  });
  assert.deepEqual(tour.rewardedSteps, ["planning", "shopping", "finish"]);
  assert.equal(tour.totalTourBites, 15);
});

test("reward map has small positive amounts and Spanish labels", () => {
  for (const [key, reward] of Object.entries(TOUR_STEP_REWARDS)) {
    assert.ok(reward.bites > 0 && reward.bites <= 10, `${key} reward out of range`);
    assert.ok(reward.label.length > 5, `${key} missing label`);
  }
});

test("every frontend rewardStep exists in the backend whitelist", () => {
  const rewardSteps = TOUR_STEPS.filter((s) => s.rewardStep).map((s) => s.rewardStep);
  assert.ok(rewardSteps.length > 0, "tour must reward some steps");
  for (const stepId of rewardSteps) {
    assert.ok(TOUR_STEP_REWARDS[stepId], `frontend rewardStep "${stepId}" missing in backend TOUR_STEP_REWARDS`);
  }
});

test("finish reward is granted by complete(), not by a visible step", () => {
  assert.ok(TOUR_STEP_REWARDS.finish, "finish reward must exist");
  const finishStep = TOUR_STEPS.find((s) => s.kind === "finish");
  assert.ok(finishStep, "steps must end with a finish screen");
  assert.equal(finishStep.rewardStep, undefined, "finish screen must not double-reward via progress");
});

test("tour structure: welcome first, finish last, unique ids, known routes", () => {
  assert.equal(TOUR_STEPS[0].kind, "welcome");
  assert.equal(TOUR_STEPS[TOUR_STEPS.length - 1].kind, "finish");

  const ids = TOUR_STEPS.map((s) => s.id);
  assert.equal(new Set(ids).size, ids.length, "step ids must be unique");

  const validRoutes = new Set([
    null,
    "/kitchen/semana",
    "/kitchen/compra",
    "/kitchen/platos",
    "/kitchen/catalogo",
    "/kitchen/configuracion"
  ]);
  for (const s of TOUR_STEPS) {
    assert.ok(validRoutes.has(s.route ?? null), `unknown route in step ${s.id}: ${s.route}`);
  }
});

test("progress steps exclude welcome/finish and stay short (tour under ~10 steps)", () => {
  assert.ok(PROGRESS_STEPS.every((s) => !s.kind));
  assert.equal(PROGRESS_STEPS.length, TOUR_STEPS.length - 2);
  assert.ok(TOUR_STEPS.length <= 12, "keep the tour short");
});

test("targeted steps carry fallback copy for missing targets", () => {
  for (const s of TOUR_STEPS) {
    if (s.target && !s.kind) {
      assert.ok(s.fallbackBody, `step ${s.id} targets "${s.target}" but has no fallbackBody`);
    }
  }
});
