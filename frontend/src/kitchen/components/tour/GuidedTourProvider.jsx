/**
 * GuidedTourProvider.jsx
 *
 * Orchestrates the guided welcome tour:
 *  - auto-launches when backend reports guidedTour.status === "pending" and the
 *    global switch (guidedTourEnabled) is on
 *  - resumes an "active" tour at the persisted step index after a refresh
 *  - navigates between routes per step, waits for [data-tour-id] targets with
 *    retries, and degrades to a centered card when a target never appears
 *  - persists progress and requests step rewards (server decides + dedupes)
 *
 * Mounted once in App.jsx inside OnboardingProvider (tour state travels in
 * GET /api/kitchen/onboarding/state). Renders <GuidedTourOverlay/> itself.
 */

import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "../../auth.jsx";
import { useOnboarding } from "../../contexts/OnboardingContext.jsx";
import { TOUR_STEPS } from "./guidedTourSteps.js";
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
  const [demoRecipeName, setDemoRecipeName] = useState(null);
  const [advancing, setAdvancing] = useState(false);

  const launchedRef = useRef(false);
  const pollTimerRef = useRef(null);
  const demoRecipeFetchedRef = useRef(false);

  const tour = onboardingState?.guidedTour ?? null;
  const globallyEnabled = Boolean(onboardingState?.guidedTourEnabled);
  const step = TOUR_STEPS[stepIndex] ?? null;
  const onKitchenRoute = location.pathname.startsWith("/kitchen");

  // ── Auto-launch / resume ────────────────────────────────────────────────────
  useEffect(() => {
    if (launchedRef.current || isTourActive) return;
    if (!user || !tour || !globallyEnabled || !onKitchenRoute) return;
    if (tour.status !== "pending" && tour.status !== "active") return;

    launchedRef.current = true;
    // Small delay: lets first paint + consent gate settle before the overlay.
    const resumeIndex = tour.status === "active"
      ? Math.min(Math.max(tour.currentStepIndex || 0, 0), TOUR_STEPS.length - 1)
      : 0;
    const timer = setTimeout(async () => {
      if (tour.status === "pending") await startTourApi();
      setSessionBites(0);
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

  // Challenge rewards can also land mid-tour (e.g. explore_app completes while
  // navigating) — refresh the wallet so the floating counter stays truthful.
  const totalChallengeBites = onboardingState?.totalBitesEarned ?? 0;
  useEffect(() => {
    if (!isTourActive) return;
    fetchWalletApi().then((w) => { if (w) setWallet(w); });
  }, [isTourActive, totalChallengeBites]);

  // ── Route sync per step ─────────────────────────────────────────────────────
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
    if (!step.target) { setResolvingTarget(false); return; }

    setResolvingTarget(true);
    const startedAt = Date.now();

    const tryResolve = () => {
      // Route not reached yet → keep waiting within the timeout budget.
      const routeReady = !step.route || location.pathname === step.route;
      const el = routeReady ? document.querySelector(`[data-tour-id="${step.target}"]`) : null;
      if (el && isElementVisible(el)) {
        clearInterval(pollTimerRef.current);
        setTargetEl(el);
        setResolvingTarget(false);
        try {
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
  }, [isTourActive, stepIndex, step, location.pathname]);

  // ── Demo recipe lookup for the "recipe" step ────────────────────────────────
  useEffect(() => {
    if (!isTourActive || !step?.dynamicRecipe || demoRecipeFetchedRef.current) return;
    demoRecipeFetchedRef.current = true;
    findDemoRecipeApi().then((dish) => {
      if (dish?.name) setDemoRecipeName(dish.name);
    });
  }, [isTourActive, step]);

  // ── Transitions ─────────────────────────────────────────────────────────────

  const endTour = useCallback(() => {
    setIsTourActive(false);
    setTargetEl(null);
    refreshOnboarding();
  }, [refreshOnboarding]);

  const persistProgress = useCallback(async (nextIndex, rewardStepId) => {
    const data = await progressTourApi({ stepIndex: nextIndex, stepId: rewardStepId });
    if (data?.awarded && data.amount > 0) {
      setSessionBites((b) => b + data.amount);
      setWallet((w) => (w ? { ...w, totalBites: (w.totalBites ?? 0) + data.amount } : w));
      setLastAward({ amount: data.amount, at: Date.now() });
    }
    return data;
  }, []);

  const next = useCallback(async () => {
    if (advancing || !step) return;
    setAdvancing(true);
    try {
      const nextIndex = stepIndex + 1;
      const isLast = nextIndex >= TOUR_STEPS.length;
      if (TOUR_STEPS[nextIndex]?.kind === "finish") {
        // Entering finish: complete server-side (grants the one-time finish bites).
        const data = await completeTourApi();
        if (data?.awarded && data.amount > 0) {
          setSessionBites((b) => b + data.amount);
          setWallet((w) => (w ? { ...w, totalBites: (w.totalBites ?? 0) + data.amount } : w));
          setLastAward({ amount: data.amount, at: Date.now() });
        }
        setStepIndex(nextIndex);
        return;
      }
      if (isLast) {
        endTour();
        return;
      }
      await persistProgress(nextIndex, step.rewardStep);
      setStepIndex(nextIndex);
    } finally {
      setAdvancing(false);
    }
  }, [advancing, step, stepIndex, persistProgress, endTour]);

  const back = useCallback(() => {
    if (advancing) return;
    setStepIndex((i) => Math.max(0, i - 1));
  }, [advancing]);

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

  // Interactive steps advance when the user actually clicks the highlighted control.
  useEffect(() => {
    if (!isTourActive || !step?.interactive || !targetEl) return;
    const onClick = () => {
      setTimeout(() => { next(); }, 650);
    };
    targetEl.addEventListener("click", onClick, { once: true });
    return () => targetEl.removeEventListener("click", onClick);
  }, [isTourActive, step, targetEl, next]);

  const value = useMemo(() => ({
    isTourActive,
    stepIndex,
    step,
    next,
    back,
    skip,
    finish,
    finishAndPlan,
    advancing,
    targetEl,
    targetMissing,
    resolvingTarget,
    wallet,
    sessionBites,
    lastAward,
    demoRecipeName
  }), [
    isTourActive, stepIndex, step, next, back, skip, finish, finishAndPlan,
    advancing, targetEl, targetMissing, resolvingTarget, wallet, sessionBites,
    lastAward, demoRecipeName
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
    next: () => {},
    back: () => {},
    skip: () => {},
    finish: () => {},
    finishAndPlan: () => {},
    advancing: false,
    targetEl: null,
    targetMissing: false,
    resolvingTarget: false,
    wallet: null,
    sessionBites: 0,
    lastAward: null,
    demoRecipeName: null
  };
}
