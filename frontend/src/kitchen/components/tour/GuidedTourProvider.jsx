/**
 * GuidedTourProvider.jsx
 *
 * Orchestrates the interactive guided onboarding:
 *  - auto-launches when backend reports guidedTour.status === "pending" and the
 *    global switch (guidedTourEnabled) is on; resumes "active" tours at the
 *    persisted step index after a refresh
 *  - ACTION steps advance only when the app emits the step's completionEvent
 *    (real action success: dish assigned, item purchased, timer started…) —
 *    pressing "Siguiente" is only possible on informational steps
 *  - rewards are requested only on action completion; the backend whitelist +
 *    once-per-household rewardedSteps guard decide the actual grant
 *  - navigates between routes per step, waits for [data-tour-id] targets with
 *    retries, scrolls them into view, and degrades to a floating mini-panel
 *    with fallback copy (and "Saltar paso") when a target never appears
 *
 * Mounted once in App.jsx inside OnboardingProvider (tour state travels in
 * GET /api/kitchen/onboarding/state). Renders <GuidedTourOverlay/> itself.
 */

import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "../../auth.jsx";
import { useOnboarding } from "../../contexts/OnboardingContext.jsx";
import { getActiveSteps, resolveStepTarget, stepCompletionEvents } from "./guidedTourSteps.js";
import { onOnboardingEvent } from "./guidedOnboardingEvents.js";
import {
  startTourApi,
  progressTourApi,
  completeTourApi,
  skipTourApi,
  fetchWalletApi,
  findDemoRecipeApi
} from "./guidedTourService.js";
import GuidedTourOverlay from "./GuidedTourOverlay.jsx";

const GuidedTourContext = createContext(null);

const TARGET_POLL_MS = 150;
const TARGET_TIMEOUT_MS = 4000;
const ACTION_DONE_ADVANCE_MS = 1100;

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
  const [wallet, setWallet] = useState(null);
  const [sessionBites, setSessionBites] = useState(0);
  const [lastAward, setLastAward] = useState(null); // { amount, at } → indicator animation
  const [actionDone, setActionDone] = useState(false); // current action step just completed
  const [demoRecipeCtx, setDemoRecipeCtx] = useState({ demoRecipe: null, demoRecipeHasTimer: false });

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
      const demo = await findDemoRecipeApi();
      const nextCtx = { demoRecipe: demo?.dish ?? null, demoRecipeHasTimer: Boolean(demo?.hasTimer) };
      setDemoRecipeCtx(nextCtx);
      const steps = getActiveSteps(nextCtx);
      const resumeIndex = tour.status === "active"
        ? Math.min(Math.max(tour.currentStepIndex || 0, 0), steps.length - 1)
        : 0;
      if (tour.status === "pending") await startTourApi();
      setSessionBites(0);
      setActionDone(false);
      setStepIndex(resumeIndex);
      setIsTourActive(true);
      fetchWalletApi().then(setWallet);
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

  // Challenge rewards can also land mid-tour (e.g. plan_first_meal completes
  // from the guided action) — refresh the wallet so the counter stays truthful.
  const totalChallengeBites = onboardingState?.totalBitesEarned ?? 0;
  useEffect(() => {
    if (!isTourActive) return;
    fetchWalletApi().then((w) => { if (w) setWallet(w); });
  }, [isTourActive, totalChallengeBites]);

  // ── Route sync per step ─────────────────────────────────────────────────────
  // Only steps that declare a route are auto-navigated. Steps where navigating
  // IS the action (catalog, settings) leave route null and highlight the nav.
  useEffect(() => {
    if (!isTourActive || !step) return;
    if (step.route && location.pathname !== step.route) {
      navigate(step.route);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isTourActive, stepIndex]);

  // ── Target resolution (poll + timeout fallback) ────────────────────────────
  useEffect(() => {
    clearInterval(pollTimerRef.current);
    setTargetEl(null);
    setTargetMissing(false);

    if (!isTourActive || !step) return;
    const selector = resolveStepTarget(step, ctx);
    if (!selector) {
      setResolvingTarget(false);
      // Dynamic target resolved to nothing (e.g. no demo recipe) → fallback copy.
      if (step.target && !step.kind) setTargetMissing(true);
      return;
    }

    setResolvingTarget(true);
    const startedAt = Date.now();

    const tryResolve = () => {
      // Route not reached yet → keep waiting within the timeout budget.
      const routeReady = !step.route || location.pathname === step.route;
      const el = routeReady ? document.querySelector(selector) : null;
      if (el && isElementVisible(el)) {
        clearInterval(pollTimerRef.current);
        setTargetEl(el);
        setResolvingTarget(false);
        try {
          // Bottom-of-screen targets come up to the center so the bubble has
          // room above them and is never pushed off the fold.
          el.scrollIntoView({ block: "center", behavior: "smooth" });
        } catch { /* older browsers */ }
        return;
      }
      if (Date.now() - startedAt > TARGET_TIMEOUT_MS) {
        clearInterval(pollTimerRef.current);
        setTargetMissing(true);
        setResolvingTarget(false);
      }
    };

    tryResolve();
    pollTimerRef.current = setInterval(tryResolve, TARGET_POLL_MS);
    return () => clearInterval(pollTimerRef.current);
    // location.pathname included so we re-check right after navigation lands.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isTourActive, stepIndex, step, location.pathname, ctx]);

  // ── Transitions ─────────────────────────────────────────────────────────────

  const endTour = useCallback(() => {
    clearTimeout(advanceTimerRef.current);
    setIsTourActive(false);
    setTargetEl(null);
    setActionDone(false);
    refreshOnboarding();
  }, [refreshOnboarding]);

  const applyAward = useCallback((data) => {
    if (data?.awarded && data.amount > 0) {
      setSessionBites((b) => b + data.amount);
      setWallet((w) => (w ? { ...w, totalBites: (w.totalBites ?? 0) + data.amount } : w));
      setLastAward({ amount: data.amount, at: Date.now() });
    }
  }, []);

  const goToIndex = useCallback(async (nextIndex, { rewardStepId = null } = {}) => {
    if (advancingRef.current) return;
    advancingRef.current = true;
    try {
      setActionDone(false);
      if (activeSteps[nextIndex]?.kind === "finish") {
        // Entering finish: server closes the tour and decides the completion
        // bonus (only when enough real actions were rewarded).
        const data = await completeTourApi();
        applyAward(data);
        setStepIndex(nextIndex);
        return;
      }
      if (nextIndex >= activeSteps.length) {
        endTour();
        return;
      }
      const data = await progressTourApi({ stepIndex: nextIndex, stepId: rewardStepId });
      applyAward(data);
      setStepIndex(nextIndex);
    } finally {
      advancingRef.current = false;
    }
  }, [activeSteps, applyAward, endTour]);

  // "Siguiente" — ONLY meaningful on steps without a completionEvent, or on
  // action steps whose target is missing (fallback mode). Action steps in
  // normal mode ignore it: completing the real action is the only way forward.
  const next = useCallback(() => {
    if (!step) return;
    const isActionStep = stepCompletionEvents(step).length > 0;
    if (isActionStep && !targetMissing && !actionDone) return;
    goToIndex(stepIndex + 1);
  }, [step, targetMissing, actionDone, goToIndex, stepIndex]);

  // Escape hatch on action steps (stuck user, empty data): advances WITHOUT
  // sending the reward key — skipped actions never pay.
  const skipStep = useCallback(() => {
    if (!step || step.kind) return;
    goToIndex(stepIndex + 1);
  }, [step, goToIndex, stepIndex]);

  const back = useCallback(() => {
    if (advancingRef.current) return;
    clearTimeout(advanceTimerRef.current);
    setActionDone(false);
    setStepIndex((i) => Math.max(1, i - 1));
  }, []);

  const skip = useCallback(async () => {
    await skipTourApi();
    endTour();
  }, [endTour]);

  const finish = useCallback(() => {
    // Finish CTA — server state was already set when entering the finish step.
    endTour();
  }, [endTour]);

  const finishAndPlan = useCallback(() => {
    endTour();
    navigate("/kitchen/semana");
  }, [endTour, navigate]);

  // ── Action completion: the heart of the interactive tour ──────────────────
  // Listen to real app events; when the current step's completionEvent fires,
  // show the success state, request the reward, then auto-advance.
  useEffect(() => {
    if (!isTourActive || !step) return;
    const events = stepCompletionEvents(step);
    if (events.length === 0) return;

    const unsubscribe = onOnboardingEvent(async (type) => {
      if (!events.includes(type) || actionDone || advancingRef.current) return;
      setActionDone(true);
      // Reward rides the completion — never a "Next" click.
      const data = await progressTourApi({ stepIndex, stepId: step.rewardStep });
      applyAward(data);
      clearTimeout(advanceTimerRef.current);
      advanceTimerRef.current = setTimeout(() => {
        goToIndex(stepIndex + 1);
      }, ACTION_DONE_ADVANCE_MS);
    });
    return unsubscribe;
  }, [isTourActive, step, stepIndex, actionDone, applyAward, goToIndex]);

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
    finishAndPlan,
    actionDone,
    targetEl,
    targetMissing,
    resolvingTarget,
    wallet,
    sessionBites,
    lastAward
  }), [
    isTourActive, stepIndex, step, activeSteps, ctx, next, back, skip, skipStep,
    finish, finishAndPlan, actionDone, targetEl, targetMissing, resolvingTarget,
    wallet, sessionBites, lastAward
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
    finishAndPlan: () => {},
    actionDone: false,
    targetEl: null,
    targetMissing: false,
    resolvingTarget: false,
    wallet: null,
    sessionBites: 0,
    lastAward: null
  };
}
