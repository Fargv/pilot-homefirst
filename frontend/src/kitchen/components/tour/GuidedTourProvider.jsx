/**
 * GuidedTourProvider.jsx
 *
 * State machine of the guided TUTORIAL:
 *  - auto-launches when backend reports guidedTour.status === "pending" and the
 *    global switch (guidedTourEnabled) is on; resumes "active" tutorials at the
 *    persisted step index after a refresh
 *  - ACTION steps advance only when the app emits the step's completionEvent
 *    (real action success: dish assigned, item purchased, timer started…);
 *    navigation steps complete when the USER taps the nav (or are silently
 *    satisfied when already on the route)
 *  - steps can ask the current screen to expose their target via the prepare
 *    channel (e.g. move the planning carousel to an empty day)
 *  - waits for [data-tour-id] targets with retries, scrolls them into view,
 *    degrades to a small fallback panel + "Omitir paso" when a target never
 *    appears, and reports stall/missing-target telemetry
 *  - grants NO bites, ever — the finish screen hands off to the challenge
 *    onboarding, which is the only reward system
 *
 * Mounted once in App.jsx inside OnboardingProvider (tutorial state travels in
 * GET /api/kitchen/onboarding/state). Renders <GuidedTourOverlay/> itself.
 */

import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "../../auth.jsx";
import { useOnboarding } from "../../contexts/OnboardingContext.jsx";
import { getActiveSteps, resolveStepTargets, stepCompletionEvents } from "./guidedTourSteps.js";
import { onOnboardingEvent, emitTourPrepare, requestOpenOnboardingPanel } from "./guidedOnboardingEvents.js";
import {
  startTourApi,
  progressTourApi,
  completeTourApi,
  skipTourApi,
  findOnboardingRecipeApi,
  ONBOARDING_RECIPE_NAME
} from "./guidedTourService.js";
import GuidedTourOverlay from "./GuidedTourOverlay.jsx";

const GuidedTourContext = createContext(null);

const TARGET_POLL_MS = 150;
const TARGET_TIMEOUT_MS = 4000;
const ACTION_DONE_ADVANCE_MS = 800;

function isElementVisible(el) {
  if (!el) return false;
  const rect = el.getBoundingClientRect();
  return rect.width > 0 && rect.height > 0;
}

export function GuidedTourProvider({ children }) {
  const { user } = useAuth();
  const { state: onboardingState, refresh: refreshOnboarding } = useOnboarding();
  const location = useLocation();
  const navigate = useNavigate();

  const [isTourActive, setIsTourActive] = useState(false);
  const [stepIndex, setStepIndex] = useState(0);
  const [targetEl, setTargetEl] = useState(null);
  const [targetMissing, setTargetMissing] = useState(false);
  const [resolvingTarget, setResolvingTarget] = useState(false);
  const [actionDone, setActionDone] = useState(false); // current action step just completed
  const [demoRecipeCtx, setDemoRecipeCtx] = useState({
    demoRecipe: null,
    demoRecipeHasTimer: false,
    demoRecipeIsPreferred: false
  });

  const launchedRef = useRef(false);
  const pollTimerRef = useRef(null);
  const advanceTimerRef = useRef(null);
  const advancingRef = useRef(false);

  const tour = onboardingState?.guidedTour ?? null;
  const globallyEnabled = Boolean(onboardingState?.guidedTourEnabled);
  const onKitchenRoute = location.pathname.startsWith("/kitchen");

  // Runtime context drives dynamic targets and skipIf (recipe block).
  const ctx = demoRecipeCtx;
  const activeSteps = useMemo(() => getActiveSteps(ctx), [ctx]);
  const step = activeSteps[stepIndex] ?? null;

  // ── Auto-launch / resume ────────────────────────────────────────────────────
  useEffect(() => {
    if (launchedRef.current || isTourActive) return;
    if (!user || !tour || !globallyEnabled || !onKitchenRoute) return;
    if (tour.status !== "pending" && tour.status !== "active") return;

    launchedRef.current = true;
    // Small delay: lets first paint + consent gate settle before the overlay.
    const timer = setTimeout(async () => {
      const demo = await findOnboardingRecipeApi();
      const nextCtx = {
        demoRecipe: demo?.dish ?? null,
        demoRecipeHasTimer: Boolean(demo?.hasTimer),
        demoRecipeIsPreferred: Boolean(demo?.matchedPreferred)
      };
      setDemoRecipeCtx(nextCtx);
      const steps = getActiveSteps(nextCtx);
      const resumeIndex = tour.status === "active"
        ? Math.min(Math.max(tour.currentStepIndex || 0, 0), steps.length - 1)
        : 0;
      if (tour.status === "pending") await startTourApi();
      setActionDone(false);
      setStepIndex(resumeIndex);
      setIsTourActive(true);
      // The onboarding recipe SHOULD always exist (backend seeds a master
      // "Pollo al horno") — report as a data issue when it doesn't.
      if (!demo?.matchedPreferred) {
        progressTourApi({
          currentStepId: steps[resumeIndex]?.id,
          missingTarget: demo
            ? `onboarding-recipe:preferred "${ONBOARDING_RECIPE_NAME}" not found, using "${demo.dish?.name}"`
            : `onboarding-recipe:no suitable recipe (preferred "${ONBOARDING_RECIPE_NAME}")`
        });
      }
    }, 900);
    return () => clearTimeout(timer);
  }, [user, tour, globallyEnabled, onKitchenRoute, isTourActive]);

  // Reset launch guard on logout so a different account can get its own tour.
  useEffect(() => {
    if (!user) {
      launchedRef.current = false;
      setIsTourActive(false);
    }
  }, [user]);

  // ── Transitions ─────────────────────────────────────────────────────────────

  const endTour = useCallback(() => {
    clearTimeout(advanceTimerRef.current);
    setIsTourActive(false);
    setTargetEl(null);
    setActionDone(false);
    refreshOnboarding();
  }, [refreshOnboarding]);

  const goToIndex = useCallback(async (nextIndex, { completedStepId = null, skippedStepId = null } = {}) => {
    if (advancingRef.current) return;
    advancingRef.current = true;
    try {
      setActionDone(false);
      if (activeSteps[nextIndex]?.kind === "finish") {
        // Entering finish: server marks the tutorial completed. No rewards.
        await completeTourApi();
        setStepIndex(nextIndex);
        return;
      }
      if (nextIndex >= activeSteps.length) {
        endTour();
        return;
      }
      await progressTourApi({
        stepIndex: nextIndex,
        currentStepId: activeSteps[nextIndex]?.id,
        completedStepId,
        skippedStepId
      });
      setStepIndex(nextIndex);
    } finally {
      advancingRef.current = false;
    }
  }, [activeSteps, endTour]);

  // ── Step entry: prepare hook + route handling ───────────────────────────────
  useEffect(() => {
    if (!isTourActive || !step) return;
    // Navigation steps: silently satisfied when the user is already there.
    if (step.completeIfRoute && location.pathname === step.completeIfRoute && !actionDone) {
      goToIndex(stepIndex + 1, { completedStepId: step.id });
      return;
    }
    // Controlled navigation only where preparation needs it (never for
    // navigation-as-action steps, which keep route null).
    if (step.route && location.pathname !== step.route) {
      navigate(step.route);
    }
    // Ask the current screen to expose the target (carousel move, etc.).
    if (step.prepare) emitTourPrepare(step.prepare);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isTourActive, stepIndex]);

  // ── Target resolution (selector fallback chain + poll + timeout) ───────────
  useEffect(() => {
    clearInterval(pollTimerRef.current);
    setTargetEl(null);
    setTargetMissing(false);

    if (!isTourActive || !step) return;
    const selectors = resolveStepTargets(step, ctx);

    const reportMissing = (reason) => {
      setTargetMissing(true);
      setResolvingTarget(false);
      // Stall/debug telemetry — admin sees why the step degraded.
      progressTourApi({ currentStepId: step.id, missingTarget: `${step.id}:${reason}` });
    };

    if (selectors.length === 0) {
      setResolvingTarget(false);
      // Dynamic target resolved to nothing (e.g. no demo recipe) → fallback copy.
      if (step.target && !step.kind) reportMissing("no-selector");
      return;
    }

    setResolvingTarget(true);
    const startedAt = Date.now();

    const tryResolve = () => {
      // Route not reached yet → keep waiting within the timeout budget.
      const routeReady = !step.route || location.pathname === step.route;
      let el = null;
      if (routeReady) {
        for (const selector of selectors) {
          const found = document.querySelector(selector);
          if (found && isElementVisible(found)) { el = found; break; }
        }
      }
      if (el) {
        clearInterval(pollTimerRef.current);
        setTargetEl(el);
        setResolvingTarget(false);
        try {
          // Bottom-of-screen targets come up to the center so the bubble has
          // room around them (clear of sticky header and bottom nav).
          el.scrollIntoView({ block: "center", behavior: "smooth" });
        } catch { /* older browsers */ }
        return;
      }
      if (Date.now() - startedAt > TARGET_TIMEOUT_MS) {
        clearInterval(pollTimerRef.current);
        reportMissing(selectors[0]);
      }
    };

    tryResolve();
    pollTimerRef.current = setInterval(tryResolve, TARGET_POLL_MS);
    return () => clearInterval(pollTimerRef.current);
    // location.pathname included so we re-check right after navigation lands.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isTourActive, stepIndex, step, location.pathname, ctx]);

  // "Continuar" — ONLY meaningful on steps without a completionEvent, or on
  // action steps whose target is missing (fallback mode). Action steps in
  // normal mode ignore it: completing the real action is the only way forward.
  const next = useCallback(() => {
    if (!step) return;
    const isActionStep = stepCompletionEvents(step).length > 0;
    if (isActionStep && !targetMissing && !actionDone) return;
    goToIndex(stepIndex + 1, { completedStepId: actionDone || !isActionStep ? step.id : null });
  }, [step, targetMissing, actionDone, goToIndex, stepIndex]);

  // Escape hatch on action steps (stuck user, empty data): advances and is
  // recorded as skipped — never as completed.
  const skipStep = useCallback(() => {
    if (!step || step.kind) return;
    goToIndex(stepIndex + 1, { skippedStepId: step.id });
  }, [step, goToIndex, stepIndex]);

  const back = useCallback(() => {
    if (advancingRef.current) return;
    clearTimeout(advanceTimerRef.current);
    setActionDone(false);
    setStepIndex((i) => Math.max(1, i - 1));
  }, []);

  const skip = useCallback(async () => {
    // stalledStepId = where the user bailed → admin-visible stall metric.
    await skipTourApi({ stalledStepId: step?.id });
    endTour();
  }, [endTour, step]);

  const finish = useCallback(() => {
    // Finish CTA — server state was already set when entering the finish step.
    endTour();
  }, [endTour]);

  // Handoff: the tutorial taught the app; the retos give the bites.
  const finishAndOpenOnboarding = useCallback(() => {
    endTour();
    requestOpenOnboardingPanel();
  }, [endTour]);

  // ── Action completion: the heart of the interactive tutorial ──────────────
  useEffect(() => {
    if (!isTourActive || !step) return;
    const events = stepCompletionEvents(step);
    if (events.length === 0) return;

    const unsubscribe = onOnboardingEvent(async (type, detail) => {
      if (!events.includes(type) || actionDone || advancingRef.current) return;
      // Entity-scoped steps (program/open "Pollo al horno") only complete for
      // the intended entity — a wrong event never advances.
      if (typeof step.matchesDetail === "function" && !step.matchesDetail(ctx, detail)) return;
      setActionDone(true);
      progressTourApi({ stepIndex, currentStepId: step.id, completedStepId: step.id });
      clearTimeout(advanceTimerRef.current);
      advanceTimerRef.current = setTimeout(() => {
        goToIndex(stepIndex + 1);
      }, ACTION_DONE_ADVANCE_MS);
    });
    return unsubscribe;
  }, [isTourActive, step, stepIndex, actionDone, goToIndex, ctx]);

  useEffect(() => () => clearTimeout(advanceTimerRef.current), []);

  const value = useMemo(() => ({
    isTourActive,
    stepIndex,
    step,
    activeSteps,
    ctx,
    next,
    back,
    skip,
    skipStep,
    finish,
    finishAndOpenOnboarding,
    actionDone,
    targetEl,
    targetMissing,
    resolvingTarget
  }), [
    isTourActive, stepIndex, step, activeSteps, ctx, next, back, skip, skipStep,
    finish, finishAndOpenOnboarding, actionDone, targetEl, targetMissing, resolvingTarget
  ]);

  return (
    <GuidedTourContext.Provider value={value}>
      {children}
      {isTourActive ? <GuidedTourOverlay /> : null}
    </GuidedTourContext.Provider>
  );
}

export function useGuidedTour() {
  return useContext(GuidedTourContext) ?? {
    isTourActive: false,
    stepIndex: 0,
    step: null,
    activeSteps: [],
    ctx: {},
    next: () => {},
    back: () => {},
    skip: () => {},
    skipStep: () => {},
    finish: () => {},
    finishAndOpenOnboarding: () => {},
    actionDone: false,
    targetEl: null,
    targetMissing: false,
    resolvingTarget: false
  };
}
