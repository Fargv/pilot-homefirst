/**
 * Guided tutorial — pure-logic tests (no DB required).
 * Run: cd backend && node --test src/kitchen/guidedTourService.test.js
 *
 * DB-backed transitions (start/progress/complete/skip/resend) require a live
 * Mongo instance and are exercised manually; these tests pin down the parts
 * that silently break: the NO-BITES product rule, the deterministic flow
 * (user-driven navigation, creation gating, Pollo al horno thread), coach
 * copy discipline, and bubble placement (never covers the target, never
 * off-screen).
 */

import assert from "node:assert/strict";
import test from "node:test";
import {
  normalizeGuidedTour,
  normalizeDishName as normalizeDishNameBackend
} from "./guidedTourService.js";
import {
  TOUR_STEPS,
  getActiveSteps,
  progressLabelFor,
  stepCompletionEvents,
  stepBlocksOutside,
  resolveStepTargets
} from "../../../frontend/src/kitchen/components/tour/guidedTourSteps.js";
import { computeBubblePosition } from "../../../frontend/src/kitchen/components/tour/bubblePosition.js";
import {
  normalizeDishName,
  pickOnboardingRecipe
} from "../../../frontend/src/kitchen/components/tour/onboardingRecipe.js";

// ─── Tutorial state normalization ────────────────────────────────────────────

test("legacy onboarding docs (no guidedTour) normalize to status none — never auto-launch", () => {
  const tour = normalizeGuidedTour(null);
  assert.equal(tour.status, "none");
  assert.equal(tour.currentStepIndex, 0);
  assert.deepEqual(tour.completedStepIds, []);
  assert.deepEqual(tour.skippedStepIds, []);
});

test("telemetry fields survive normalization", () => {
  const tour = normalizeGuidedTour({
    status: "skipped",
    currentStepId: "shopping-check",
    stalledStepId: "shopping-check",
    skippedStepIds: ["plan-random"],
    completedStepIds: ["nav-planning"]
  });
  assert.equal(tour.stalledStepId, "shopping-check");
  assert.deepEqual(tour.skippedStepIds, ["plan-random"]);
  assert.deepEqual(tour.completedStepIds, ["nav-planning"]);
});

// ─── PRODUCT RULE: the tutorial never grants bites ───────────────────────────

test("no tutorial step carries any reward", () => {
  for (const s of TOUR_STEPS) {
    assert.equal(s.rewardStep, undefined, `step ${s.id} must not reward`);
    assert.equal(s.rewardBites, undefined, `step ${s.id} must not reward`);
  }
});

test("backend no longer exports a tutorial reward whitelist", async () => {
  const mod = await import("./guidedTourService.js");
  assert.equal(mod.TOUR_STEP_REWARDS, undefined, "tutorial reward map must be gone");
});

test("finish step hands off to the challenge onboarding, not to a reward", () => {
  const finish = TOUR_STEPS[TOUR_STEPS.length - 1];
  assert.equal(finish.kind, "finish");
  assert.match(finish.command, /onboarding/i);
  assert.match(finish.command, /retos/i);
});

// ─── Deterministic flow ──────────────────────────────────────────────────────

test("flow order: welcome → planning → pollo → randomize → lista → item → cocina → creation → recipe thread → catalog → menu → settings → finish", () => {
  const ids = TOUR_STEPS.map((s) => s.id);
  const expectedOrder = [
    "welcome", "nav-planning", "plan-pollo", "plan-random", "nav-shopping",
    "shopping-check", "nav-kitchen", "create-open", "create-name",
    "create-ingredient", "create-save", "recipe-open", "recipe-servings",
    "recipe-execute", "recipe-step", "recipe-timer", "recipe-minimize",
    "nav-catalog", "catalog-explore", "menu-open", "settings-link", "finish"
  ];
  assert.deepEqual(ids, expectedOrder);
});

test("navigation steps are user-driven: no auto-route, completion via page arrival", () => {
  for (const id of ["nav-planning", "nav-shopping", "nav-kitchen", "nav-catalog"]) {
    const s = TOUR_STEPS.find((x) => x.id === id);
    assert.equal(s.route ?? null, null, `${id} must not auto-navigate`);
    assert.ok(stepCompletionEvents(s).length > 0, `${id} completes via navigation event`);
    assert.ok(s.target.startsWith("nav-"), `${id} highlights the nav item`);
  }
});

test("dish creation is gated: open → name → ingredient → save, each action-based", () => {
  const substeps = ["create-open", "create-name", "create-ingredient", "create-save"];
  const ids = TOUR_STEPS.map((s) => s.id);
  const indices = substeps.map((id) => ids.indexOf(id));
  assert.deepEqual([...indices].sort((a, b) => a - b), indices, "creation substeps in order");
  for (const id of substeps) {
    const s = TOUR_STEPS.find((x) => x.id === id);
    assert.ok(stepCompletionEvents(s).length > 0, `${id} must require a real action`);
  }
  // The recipe thread comes strictly AFTER the dish is saved.
  assert.ok(ids.indexOf("recipe-open") > ids.indexOf("create-save"));
});

test("plan-pollo requires the onboarding dish when available, any dish otherwise", () => {
  const s = TOUR_STEPS.find((x) => x.id === "plan-pollo");
  const ctx = { demoRecipe: { _id: "abc", name: "Pollo al horno" } };
  assert.equal(s.matchesDetail(ctx, { dishId: "abc" }), true);
  assert.equal(s.matchesDetail(ctx, { dishId: "zzz", dishName: "Lentejas" }), false);
  assert.equal(s.matchesDetail(ctx, { dishId: "zzz", dishName: "Pollo al Hornó con patatas" }), true, "name match");
  assert.equal(s.matchesDetail({ demoRecipe: null }, { dishId: "any" }), true, "degrades to any dish");
});

test("recipe-open only completes for the onboarding recipe (wrong dish never advances)", () => {
  const step = TOUR_STEPS.find((s) => s.id === "recipe-open");
  const ctx = { demoRecipe: { _id: "abc", name: "Pollo al horno" } };
  assert.equal(step.matchesDetail(ctx, { dishId: "abc" }), true);
  assert.equal(step.matchesDetail(ctx, { dishId: "other" }), false);
});

test("recipe-open targets the Cocinar ahora action with the card as fallback", () => {
  const step = TOUR_STEPS.find((s) => s.id === "recipe-open");
  const targets = resolveStepTargets(step, { demoRecipe: { _id: "abc" } });
  assert.equal(targets.length, 2);
  assert.match(targets[0], /data-dish-id="abc".*data-tour-id="dish-cook"/);
  assert.deepEqual(resolveStepTargets(step, { demoRecipe: null }), []);
});

test("planning steps ask the page to expose the target (mobile carousel)", () => {
  for (const id of ["plan-pollo", "plan-random"]) {
    const s = TOUR_STEPS.find((x) => x.id === id);
    assert.ok(s.prepare, `${id} must trigger a prepare action`);
  }
});

test("outside clicks blocked on single-tap steps; multi-stage steps stay open", () => {
  for (const id of ["plan-random", "shopping-check", "recipe-open", "recipe-timer", "nav-catalog", "menu-open"]) {
    assert.equal(stepBlocksOutside(TOUR_STEPS.find((s) => s.id === id)), true, `${id} should block`);
  }
  // Pickers, typing and the user-menu dropdown need the app free.
  for (const id of ["plan-pollo", "create-name", "create-ingredient", "create-save", "settings-link"]) {
    assert.equal(stepBlocksOutside(TOUR_STEPS.find((s) => s.id === id)), false, `${id} must stay open`);
  }
});

test("recipe block is skipped entirely when no demo recipe exists", () => {
  const withRecipe = getActiveSteps({ demoRecipe: { _id: "x", name: "Demo" }, demoRecipeHasTimer: true });
  const withoutRecipe = getActiveSteps({ demoRecipe: null, demoRecipeHasTimer: false });
  assert.ok(withRecipe.length > withoutRecipe.length);
  assert.ok(withoutRecipe.some((s) => s.id === "recipe-open"), "recipe-open stays as short fallback");
  for (const id of ["recipe-servings", "recipe-execute", "recipe-step", "recipe-timer", "recipe-minimize"]) {
    assert.ok(!withoutRecipe.some((s) => s.id === id), `${id} must skip without a demo recipe`);
  }
});

test("timer step also skips when the demo recipe has no timer", () => {
  const steps = getActiveSteps({ demoRecipe: { _id: "x", name: "Demo" }, demoRecipeHasTimer: false });
  assert.ok(!steps.some((s) => s.id === "recipe-timer"));
});

// ─── Coach copy discipline: commands, not essays ─────────────────────────────

test("every step has ONE short command — no paragraphs, no bites mentions in actions", () => {
  for (const s of TOUR_STEPS) {
    assert.ok(s.command, `step ${s.id} needs a command`);
    assert.ok(s.command.length <= 80, `step ${s.id} command too long (${s.command.length})`);
    assert.equal(s.body, undefined, `step ${s.id} must not carry a body paragraph`);
    assert.equal(s.why, undefined, `step ${s.id} must not carry extra explanations`);
    if (!s.kind && stepCompletionEvents(s).length > 0) {
      assert.ok(!/bites/i.test(s.command), `action step ${s.id} must not mention bites`);
      assert.ok(s.fallbackBody && s.fallbackBody.length <= 90, `${s.id} needs a one-line fallback`);
    }
  }
});

test("progress labels exclude welcome/finish and follow N/M format", () => {
  const steps = getActiveSteps({ demoRecipe: null, demoRecipeHasTimer: false });
  assert.equal(progressLabelFor(steps, 0), null);
  assert.equal(progressLabelFor(steps, steps.length - 1), null);
  assert.match(progressLabelFor(steps, 1), /^1\/\d+$/);
});

// ─── Onboarding recipe lookup (Pollo al horno) ──────────────────────────────

const recipeOf = (hasTimer) => ({
  ingredients: [{ name: "Pollo", quantity: { amount: 1, unit: "unidad", scalable: true } }],
  steps: [
    { order: 1, title: "Prepara", text: "…", hasTimer: false },
    { order: 2, title: "Hornea", text: "…", hasTimer, durationSeconds: hasTimer ? 2700 : null }
  ]
});

test("lookup prefers Pollo al horno by normalized accent-insensitive contains-match", () => {
  const dishes = [
    { _id: "a", name: "Lentejas", ingredients: [{ displayName: "x", canonicalName: "x" }], recipe: recipeOf(true) },
    { _id: "b", name: "POLLO AL HORNO con pimientos", ingredients: [{ displayName: "x", canonicalName: "x" }], recipe: recipeOf(true) }
  ];
  const pick = pickOnboardingRecipe(dishes);
  assert.equal(pick.dish._id, "b");
  assert.equal(pick.matchedPreferred, true);
});

test("lookup falls back to a timer recipe when Pollo al horno is missing", () => {
  const dishes = [
    { _id: "a", name: "Ensalada", ingredients: [{ displayName: "x", canonicalName: "x" }], recipe: recipeOf(false) },
    { _id: "b", name: "Guiso", ingredients: [{ displayName: "x", canonicalName: "x" }], recipe: recipeOf(true) }
  ];
  const pick = pickOnboardingRecipe(dishes);
  assert.equal(pick.dish._id, "b");
  assert.equal(pick.matchedPreferred, false);
});

test("lookup returns null when no dish has a complete recipe", () => {
  assert.equal(pickOnboardingRecipe([{ _id: "a", name: "Pollo al horno", recipe: { steps: null } }]), null);
  assert.equal(pickOnboardingRecipe([]), null);
});

test("frontend and backend dish-name normalization agree", () => {
  for (const name of ["Pollo al Horno", "  POLLO   AL  HORNÓ ", "pollo àl horno"]) {
    assert.equal(normalizeDishName(name), normalizeDishNameBackend(name));
  }
  assert.equal(normalizeDishName("Pollo al Hornó"), "pollo al horno");
});

// ─── Coach bubble placement: never off-screen, never covering the target ────

const viewport = { width: 1280, height: 800 };
const bubble = { width: 264, height: 150 };

test("bubble prefers the configured side when it fits", () => {
  const spot = { top: 100, left: 500, width: 200, height: 60 };
  const pos = computeBubblePosition({ spot, bubble, viewport, preferred: "bottom" });
  assert.equal(pos.placement, "bottom");
  assert.ok(pos.top >= spot.top + spot.height);
});

test("bubble flips above when the target is near the bottom (no cut-off)", () => {
  const spot = { top: 700, left: 500, width: 200, height: 60 };
  const pos = computeBubblePosition({ spot, bubble, viewport, preferred: "bottom" });
  assert.equal(pos.placement, "top");
  assert.ok(pos.top + bubble.height <= spot.top);
  assert.ok(pos.top >= 0);
});

test("bubble never covers the target when any placement can avoid it", () => {
  const spots = [
    { top: 100, left: 500, width: 200, height: 60 },
    { top: 700, left: 100, width: 120, height: 60 },
    { top: 300, left: 1150, width: 100, height: 60 },
    { top: 90, left: 20, width: 90, height: 50 }
  ];
  const noOverlap = (pos, spot) => (
    pos.left + bubble.width <= spot.left || pos.left >= spot.left + spot.width ||
    pos.top + bubble.height <= spot.top || pos.top >= spot.top + spot.height
  );
  for (const spot of spots) {
    for (const preferred of ["top", "bottom", "left", "right"]) {
      const pos = computeBubblePosition({ spot, bubble, viewport, preferred });
      assert.equal(pos.covered, false);
      assert.ok(noOverlap(pos, spot), `bubble covers target (${JSON.stringify(spot)}, ${preferred})`);
    }
  }
});

test("covered flag reports unavoidable overlap (mobile switches to coach bar)", () => {
  const spot = { top: 0, left: 0, width: 1280, height: 800 };
  const pos = computeBubblePosition({ spot, bubble, viewport, preferred: "bottom" });
  assert.equal(pos.covered, true);
});

test("insets keep the bubble clear of sticky header and bottom nav", () => {
  const insets = { top: 74, bottom: 84, left: 10, right: 10 };
  const spot = { top: 60, left: 400, width: 200, height: 50 };
  const pos = computeBubblePosition({ spot, bubble, viewport, preferred: "top", insets });
  assert.ok(pos.top >= insets.top);
  assert.ok(pos.top + bubble.height <= viewport.height - insets.bottom);
});

test("narrow screens only use top/bottom placements and never overflow", () => {
  const mobile = { width: 375, height: 700 };
  const mobileBubble = { width: 264, height: 160 };
  const spots = [
    { top: 60, left: 10, width: 80, height: 40 },
    { top: 620, left: 300, width: 60, height: 60 }
  ];
  for (const spot of spots) {
    const pos = computeBubblePosition({
      spot, bubble: mobileBubble, viewport: mobile, preferred: "right", allowSides: false
    });
    assert.ok(["top", "bottom"].includes(pos.placement));
    assert.ok(pos.left >= 0 && pos.left + mobileBubble.width <= mobile.width);
    assert.ok(pos.top >= 0 && pos.top + mobileBubble.height <= mobile.height);
  }
});

test("arrow stays within the bubble edge and points toward the target", () => {
  const spot = { top: 300, left: 30, width: 60, height: 40 };
  const pos = computeBubblePosition({ spot, bubble, viewport, preferred: "bottom" });
  assert.ok(["top", "bottom"].includes(pos.arrow.side));
  assert.ok(pos.arrow.offset >= 18 && pos.arrow.offset <= bubble.width - 18);
});
