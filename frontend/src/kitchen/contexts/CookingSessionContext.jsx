import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import { parseRecipeSteps } from "../utils/recipeStepParser.js";
import { loadSession, saveSession, clearSession } from "../utils/cookingSessionStorage.js";
import {
  createTimer,
  startTimer,
  pauseTimer,
  resumeTimer,
  cancelTimer,
  markDoneTimer,
  getRemainingMs,
} from "../utils/timerService.js";
import { notifyTimerComplete, notifyTimerAutoPaused } from "../utils/notificationService.js";

const CookingSessionContext = createContext(null);
const STEPPER_OPEN_KEY = "lunchfy:cooking_stepper_open";

export function useCookingSession() {
  return useContext(CookingSessionContext);
}

export function CookingSessionProvider({ children }) {
  const [session, setSession] = useState(() => loadSession());
  const [isStepperOpen, setIsStepperOpen] = useState(() => {
    const saved = loadSession();
    if (!saved) return false;
    try { return localStorage.getItem(STEPPER_OPEN_KEY) !== "false"; } catch { return true; }
  });
  const notifiedRef = useRef(new Set());
  // Ref so timerAction can read current timers without a stale closure
  const sessionRef = useRef(session);

  // Keep sessionRef current so timerAction can read it without stale closures
  useEffect(() => { sessionRef.current = session; }, [session]);

  // Persist to localStorage
  useEffect(() => {
    if (session) saveSession(session);
    else clearSession();
  }, [session]);

  // Derive whether any timer is currently running
  const timerStatuses = session
    ? Object.values(session.timers || {}).map((t) => t.status).join(",")
    : "";
  const hasRunningTimer = timerStatuses.includes("running");

  // Scan all running timers and mark any that have expired.
  // Returns true when at least one timer was marked done.
  const checkAndExpireTimers = useCallback(() => {
    setSession((prev) => {
      if (!prev) return prev;
      let changed = false;
      const nextTimers = { ...prev.timers };
      for (const key of Object.keys(nextTimers)) {
        const t = nextTimers[key];
        if (t.status === "running" && getRemainingMs(t) <= 0) {
          nextTimers[key] = markDoneTimer(t);
          changed = true;
          if (!notifiedRef.current.has(key)) {
            notifiedRef.current.add(key);
            const stepIdx = parseInt(key.split("_")[0], 10);
            const step = prev.steps[stepIdx];
            notifyTimerComplete(step?.text ?? "");
          }
        }
      }
      return changed ? { ...prev, timers: nextTimers } : prev;
    });
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Poll every 500ms while a timer is running to detect expiry.
  // (Display ticking is handled locally inside RecipeTimer/Banner via useLiveCookingTimer.)
  useEffect(() => {
    if (!hasRunningTimer) return;
    const id = setInterval(checkAndExpireTimers, 500);
    return () => clearInterval(id);
  }, [hasRunningTimer, checkAndExpireTimers]);

  // When the page becomes visible again, immediately check whether any timer
  // expired while the app was in the background / device was sleeping.
  useEffect(() => {
    if (!hasRunningTimer) return;
    const handleVisibility = () => {
      if (document.visibilityState === "visible") {
        checkAndExpireTimers();
      }
    };
    document.addEventListener("visibilitychange", handleVisibility);
    return () => document.removeEventListener("visibilitychange", handleVisibility);
  }, [hasRunningTimer, checkAndExpireTimers]);

  // ── Actions ──────────────────────────────────────────────────────────────────

  const startSession = useCallback((dish, servings) => {
    const recipe = dish?.recipe || {};
    const parsedSteps = parseRecipeSteps(recipe.steps);
    const steps = parsedSteps?.length
      ? parsedSteps
      : [{ index: 0, text: "Esta receta no tiene pasos definidos.", html: null, detectedTimers: [] }];

    notifiedRef.current.clear();
    setSession({
      recipeId:        String(dish?._id || ""),
      recipeName:      dish?.name || "Receta",
      recipeServings:  recipe.servings ?? null,
      selectedServings: servings,
      steps,
      currentStepIndex: 0,
      completedSteps:   [],
      startedAt:        new Date().toISOString(),
      isComplete:       false,
      timers:           {},
    });
    setIsStepperOpen(true);
    try { localStorage.setItem(STEPPER_OPEN_KEY, "true"); } catch {}
  }, []);

  const endSession = useCallback(() => {
    notifiedRef.current.clear();
    setSession(null);
    setIsStepperOpen(false);
    try { localStorage.removeItem(STEPPER_OPEN_KEY); } catch {}
  }, []);

  const goToStep = useCallback((index) => {
    setSession((prev) => {
      if (!prev) return prev;
      const clamped = Math.max(0, Math.min(prev.steps.length - 1, index));
      return { ...prev, currentStepIndex: clamped };
    });
  }, []);

  const toggleStepComplete = useCallback((index) => {
    setSession((prev) => {
      if (!prev) return prev;
      const completed = [...prev.completedSteps];
      const pos = completed.indexOf(index);
      if (pos === -1) completed.push(index);
      else completed.splice(pos, 1);
      return { ...prev, completedSteps: completed };
    });
  }, []);

  const completeSession = useCallback(() => {
    setSession((prev) => (prev ? { ...prev, isComplete: true } : prev));
  }, []);

  const openStepper = useCallback(() => {
    setIsStepperOpen(true);
    try { localStorage.setItem(STEPPER_OPEN_KEY, "true"); } catch {}
  }, []);
  const minimizeStepper = useCallback(() => {
    setIsStepperOpen(false);
    try { localStorage.setItem(STEPPER_OPEN_KEY, "false"); } catch {}
  }, []);

  const timerAction = useCallback((key, action, durationMs) => {
    // Determine before the state update whether another timer will be auto-paused.
    // We read from sessionRef (always current) to avoid adding session to deps.
    const prevTimers = sessionRef.current?.timers || {};
    const willAutoPause = (action === "start" || action === "resume") &&
      Object.entries(prevTimers).some(([k, t]) => k !== key && t.status === "running");

    setSession((prev) => {
      if (!prev) return prev;
      const timers = { ...prev.timers };
      let t = timers[key];

      if (action === "start") {
        // One-active-timer rule: pause any other running timer first
        for (const [otherKey, otherTimer] of Object.entries(timers)) {
          if (otherKey !== key && otherTimer.status === "running") {
            timers[otherKey] = pauseTimer(otherTimer);
          }
        }
        if (!t) t = createTimer(durationMs || 0);
        notifiedRef.current.delete(key);
        timers[key] = startTimer(t);
      } else if (action === "pause") {
        if (t) timers[key] = pauseTimer(t);
      } else if (action === "resume") {
        // One-active-timer rule: pause any other running timer first
        for (const [otherKey, otherTimer] of Object.entries(timers)) {
          if (otherKey !== key && otherTimer.status === "running") {
            timers[otherKey] = pauseTimer(otherTimer);
          }
        }
        if (t) {
          notifiedRef.current.delete(key);
          timers[key] = resumeTimer(t);
        }
      } else if (action === "cancel") {
        if (t) {
          notifiedRef.current.delete(key);
          timers[key] = cancelTimer(t);
        }
      }

      return { ...prev, timers };
    });

    // Show toast if we auto-paused another timer (checked before state update)
    if (willAutoPause) {
      notifyTimerAutoPaused();
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const value = {
    session,
    isStepperOpen,
    startSession,
    endSession,
    goToStep,
    toggleStepComplete,
    completeSession,
    openStepper,
    minimizeStepper,
    timerAction,
  };

  return (
    <CookingSessionContext.Provider value={value}>
      {children}
    </CookingSessionContext.Provider>
  );
}
