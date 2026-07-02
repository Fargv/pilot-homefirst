/**
 * Guided onboarding — pure-logic tests (no DB required).
 * Run: cd backend && node --test src/kitchen/guidedTourService.test.js
 *
 * DB-backed transitions (start/progress/complete/skip/resend) require a live
 * Mongo instance and are exercised manually; these tests pin down the parts
 * that silently break: legacy-doc normalization, the action-only reward
 * contract between frontend steps and backend whitelist, and the coach-bubble
 * placement math (never off-screen).
 */

import assert from "node:assert/strict";
import test from "node:test";
import { normalizeGuidedTour, TOUR_STEP_REWARDS } from "./guidedTourService.js";
import {
  TOUR_STEPS,
  getActiveSteps,
  progressLabelFor,
  stepCompletionEvents
} from "../../../frontend/src/kitchen/components/tour/guidedTourSteps.js";
import { computeBubblePosition } from "../../../frontend/src/kitchen/components/tour/bubblePosition.js";

// ─── Tour state normalization ────────────────────────────────────────────────

test("legacy onboarding docs (no guidedTour) normalize to status none — never auto-launch", () => {
  const tour = normalizeGuidedTour(null);
  assert.equal(tour.status, "none");
  assert.equal(tour.currentStepIndex, 0);
  assert.deepEqual(tour.rewardedSteps, []);
  assert.equal(tour.testMode, false);
});

test("normalize preserves rewardedSteps so resends cannot farm bites", () => {
  const tour = normalizeGuidedTour({
    status: "completed",
    rewardedSteps: ["plan_dish", "mark_bought", "finish"],
    totalTourBites: 20
  });
  assert.deepEqual(tour.rewardedSteps, ["plan_dish", "mark_bought", "finish"]);
  assert.equal(tour.totalTourBites, 20);
});

// ─── Rewards: actions only ───────────────────────────────────────────────────

test("reward map has small positive amounts and Spanish labels", () => {
  for (const [key, reward] of Object.entries(TOUR_STEP_REWARDS)) {
    assert.ok(reward.bites > 0 && reward.bites <= 10, `${key} reward out of range`);
    assert.ok(reward.label.length > 5, `${key} missing label`);
  }
});

test("every frontend rewardStep exists in the backend whitelist", () => {
  const rewardSteps = TOUR_STEPS.filter((s) => s.rewardStep).map((s) => s.rewardStep);
  assert.ok(rewardSteps.length > 0, "tour must reward some actions");
  for (const stepId of rewardSteps) {
    assert.ok(TOUR_STEP_REWARDS[stepId], `frontend rewardStep "${stepId}" missing in backend TOUR_STEP_REWARDS`);
  }
});

test("rewards are only attached to ACTION steps (completionEvent required)", () => {
  for (const s of TOUR_STEPS) {
    if (s.rewardStep) {
      assert.ok(
        stepCompletionEvents(s).length > 0,
        `step ${s.id} grants "${s.rewardStep}" without requiring a real action`
      );
    }
  }
});

test("informational steps (no completionEvent) never carry rewards", () => {
  for (const s of TOUR_STEPS) {
    if (stepCompletionEvents(s).length === 0) {
      assert.equal(s.rewardStep, undefined, `info step ${s.id} must not reward`);
    }
  }
});

test("finish bonus is granted by complete(), not by a visible step", () => {
  assert.ok(TOUR_STEP_REWARDS.finish, "finish reward must exist");
  const finishStep = TOUR_STEPS.find((s) => s.kind === "finish");
  assert.ok(finishStep, "steps must end with a finish screen");
  assert.equal(finishStep.rewardStep, undefined, "finish screen must not double-reward via progress");
});

// ─── Step structure ──────────────────────────────────────────────────────────

test("tour structure: welcome first, finish last, unique ids, known routes", () => {
  assert.equal(TOUR_STEPS[0].kind, "welcome");
  assert.equal(TOUR_STEPS[TOUR_STEPS.length - 1].kind, "finish");

  const ids = TOUR_STEPS.map((s) => s.id);
  assert.equal(new Set(ids).size, ids.length, "step ids must be unique");

  const validRoutes = new Set([
    null,
    undefined,
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

test("action steps carry an action hint and fallback copy", () => {
  for (const s of TOUR_STEPS) {
    if (stepCompletionEvents(s).length > 0) {
      assert.ok(s.hint, `action step ${s.id} needs a "Ahora pulsa…" hint`);
      assert.ok(s.fallbackBody, `action step ${s.id} needs fallbackBody for missing targets`);
    }
  }
});

test("navigation-as-action steps do not auto-navigate", () => {
  for (const id of ["catalog", "settings"]) {
    const s = TOUR_STEPS.find((x) => x.id === id);
    assert.ok(s, `step ${id} exists`);
    assert.equal(s.route ?? null, null, `step ${id} must let the USER navigate`);
    assert.ok(stepCompletionEvents(s).length > 0, `step ${id} completes via navigation event`);
  }
});

test("recipe block is skipped entirely when no demo recipe exists", () => {
  const withRecipe = getActiveSteps({ demoRecipe: { _id: "x", name: "Demo" }, demoRecipeHasTimer: true });
  const withoutRecipe = getActiveSteps({ demoRecipe: null, demoRecipeHasTimer: false });
  assert.ok(withRecipe.length > withoutRecipe.length, "recipe steps must be conditional");
  // recipe-open stays as the graceful explanation; interactive recipe steps drop.
  assert.ok(withoutRecipe.some((s) => s.id === "recipe-open"));
  for (const id of ["recipe-servings", "recipe-execute", "recipe-step", "recipe-timer", "recipe-minimize"]) {
    assert.ok(!withoutRecipe.some((s) => s.id === id), `${id} must skip without a demo recipe`);
  }
});

test("timer step also skips when the demo recipe has no timer", () => {
  const steps = getActiveSteps({ demoRecipe: { _id: "x", name: "Demo" }, demoRecipeHasTimer: false });
  assert.ok(!steps.some((s) => s.id === "recipe-timer"));
  assert.ok(steps.some((s) => s.id === "recipe-execute"));
});

test("progress labels exclude welcome/finish and follow N/M format", () => {
  const steps = getActiveSteps({ demoRecipe: null, demoRecipeHasTimer: false });
  assert.equal(progressLabelFor(steps, 0), null, "welcome shows no progress");
  assert.equal(progressLabelFor(steps, steps.length - 1), null, "finish shows no progress");
  const label = progressLabelFor(steps, 1);
  assert.match(label, /^1\/\d+$/);
});

// ─── Coach bubble placement: never off-screen ───────────────────────────────

const viewport = { width: 1280, height: 800 };
const bubble = { width: 300, height: 180 };

test("bubble prefers the configured side when it fits", () => {
  const spot = { top: 100, left: 500, width: 200, height: 60 };
  const pos = computeBubblePosition({ spot, bubble, viewport, preferred: "bottom" });
  assert.equal(pos.placement, "bottom");
  assert.ok(pos.top >= spot.top + spot.height, "sits below the target");
});

test("bubble flips above when the target is near the bottom (no cut-off)", () => {
  const spot = { top: 700, left: 500, width: 200, height: 60 };
  const pos = computeBubblePosition({ spot, bubble, viewport, preferred: "bottom" });
  assert.equal(pos.placement, "top");
  assert.ok(pos.top + bubble.height <= spot.top, "sits fully above the target");
  assert.ok(pos.top >= 0, "not off the top edge");
});

test("bubble is always fully inside the viewport, even in degenerate cases", () => {
  const extremes = [
    { top: -50, left: -50, width: 100, height: 100 },
    { top: 780, left: 1250, width: 60, height: 60 },
    { top: 0, left: 0, width: 1280, height: 800 }, // target covers everything
    { top: 400, left: 640, width: 4, height: 4 }
  ];
  for (const spot of extremes) {
    for (const preferred of ["top", "bottom", "left", "right"]) {
      const pos = computeBubblePosition({ spot, bubble, viewport, preferred });
      assert.ok(pos.top >= 0, `top cut off (spot ${JSON.stringify(spot)}, ${preferred})`);
      assert.ok(pos.left >= 0, `left cut off (spot ${JSON.stringify(spot)}, ${preferred})`);
      assert.ok(pos.top + bubble.height <= viewport.height, `bottom cut off (${preferred})`);
      assert.ok(pos.left + bubble.width <= viewport.width, `right cut off (${preferred})`);
    }
  }
});

test("narrow screens only use top/bottom placements and never overflow", () => {
  const mobile = { width: 375, height: 700 };
  const mobileBubble = { width: 350, height: 200 };
  const spots = [
    { top: 60, left: 10, width: 80, height: 40 },
    { top: 620, left: 300, width: 60, height: 60 }
  ];
  for (const spot of spots) {
    const pos = computeBubblePosition({
      spot, bubble: mobileBubble, viewport: mobile, preferred: "right", allowSides: false
    });
    assert.ok(["top", "bottom"].includes(pos.placement));
    assert.ok(pos.left >= 0 && pos.left + mobileBubble.width <= mobile.width, "no horizontal overflow");
    assert.ok(pos.top >= 0 && pos.top + mobileBubble.height <= mobile.height, "no vertical overflow");
  }
});

test("arrow stays within the bubble edge and points toward the target", () => {
  const spot = { top: 300, left: 30, width: 60, height: 40 }; // near left edge → clamped bubble
  const pos = computeBubblePosition({ spot, bubble, viewport, preferred: "bottom" });
  assert.ok(["top", "bottom"].includes(pos.arrow.side));
  assert.ok(pos.arrow.offset >= 18 && pos.arrow.offset <= bubble.width - 18);
});
