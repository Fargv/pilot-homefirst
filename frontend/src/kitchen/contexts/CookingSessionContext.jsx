import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import { parseRecipeSteps } from "../utils/recipeStepParser.js";
import { getRecipeBaseServings } from "../utils/recipeScaling.js";
import { loadSession, saveSession, clearSession } from "../utils/cookingSessionStorage.js";
import {
  createTimer,
  startTimer,
  pauseTimer,
  resumeTimer,
  cancelTimer,
  markDoneTimer,
  getRemainingMs,
  normalizeTimerStatus,
} from "../utils/timerService.js";
import { notifyTimerComplete } from "../utils/notificationService.js";

const CookingSessionContext = createContext(null);
const STEPPER_OPEN_KEY = "lunchfy:cooking_stepper_open";
const createExecutionId = () => `exec-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

export function useCookingSession() {
  return useContext(CookingSessionContext);
}

export function CookingSessionProvider({ children }) {
  const [session, setSession] = useState(() => {
    const saved = loadSession();
    return saved ? { ...saved, executionId: saved.executionId || createExecutionId() } : null;
  });
  const [timerTick, setTimerTick] = useState(0);
  const [isStepperOpen, setIsStepperOpen] = useState(() => {
    const saved = loadSession();
    if (!saved) return false;
    try { return localStorage.getItem(STEPPER_OPEN_KEY) !== "false"; } catch { return true; }
  });
  const notifiedRef = useRef(new Set());

  // Persist to localStorage
  useEffect(() => {
    if (session) saveSession(session);
    else clearSession();
  }, [session]);

  // Derive whether any timer is currently running
  const timerStatuses = session
    ? Object.values(session.timers || {}).map((t) => normalizeTimerStatus(t.status)).join(",")
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
        if (normalizeTimerStatus(t.status) === "running" && getRemainingMs(t) <= 0) {
          nextTimers[key] = markDoneTimer(t);
          changed = true;
          if (!notifiedRef.current.has(key)) {
            notifiedRef.current.add(key);
            const stepIdx = Number.isFinite(t.stepIndex) ? t.stepIndex : parseInt(key.split("_")[0], 10);
            const step = prev.steps[stepIdx];
            notifyTimerComplete(t.timerLabel || step?.text || "");
          }
        }
      }
      return changed ? { ...prev, timers: nextTimers } : prev;
    });
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // One central timer loop drives display refreshes and expiry checks.
  useEffect(() => {
    if (!hasRunningTimer) return;
    const id = setInterval(() => {
      setTimerTick((n) => n + 1);
      checkAndExpireTimers();
    }, 500);
    return () => clearInterval(id);
  }, [hasRunningTimer, checkAndExpireTimers]);

  // When the page becomes visible again, immediately check whether any timer
  // expired while the app was in the background / device was sleeping.
  useEffect(() => {
    if (!hasRunningTimer) return;
    const handleVisibility = () => {
      if (document.visibilityState === "visible") {
        setTimerTick((n) => n + 1);
        checkAndExpireTimers();
      }
    };
    document.addEventListener("visibilitychange", handleVisibility);
    return () => document.removeEventListener("visibilitychange", handleVisibility);
  }, [hasRunningTimer, checkAndExpireTimers]);

  // ── Actions ──────────────────────────────────────────────────────────────────

  const startSession = useCallback((dish, servings) => {
    const recipe = dish?.recipe || {};
    const parsedSteps = parseRecipeSteps(recipe.elaboration ?? recipe.steps);
    const steps = parsedSteps?.length
      ? parsedSteps
      : [{ index: 0, text: "Esta receta no tiene pasos definidos.", html: null, detectedTimers: [] }];

    notifiedRef.current.clear();
    setSession({
      recipeId:        String(dish?._id || ""),
      executionId:     createExecutionId(),
      recipeName:      dish?.name || "Receta",
      recipeServings:  recipe.servings ?? null,
      baseServings:    getRecipeBaseServings(recipe),
      selectedServings: servings,
      ingredients:     Array.isArray(recipe.ingredients) ? recipe.ingredients : [],
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
    setSession((prev) => (prev ? { ...prev, isComplete: true, timers: {} } : prev));
  }, []);

  const openStepper = useCallback(() => {
    setIsStepperOpen(true);
    try { localStorage.setItem(STEPPER_OPEN_KEY, "true"); } catch {}
  }, []);
  const minimizeStepper = useCallback(() => {
    setIsStepperOpen(false);
    try { localStorage.setItem(STEPPER_OPEN_KEY, "false"); } catch {}
  }, []);

  const timerAction = useCallback((key, action, durationMs, timerMeta = {}) => {
    setSession((prev) => {
      if (!prev) return prev;
      const timers = { ...prev.timers };
      let t = timers[key];

      if (action === "start") {
        if (!t || ["finished", "cancelled"].includes(normalizeTimerStatus(t.status))) {
          t = createTimer({
            ...timerMeta,
            id: key,
            executionId: prev.executionId,
            recipeId: prev.recipeId,
            durationMs: durationMs || timerMeta.durationMs || 0,
          });
        }
        notifiedRef.current.delete(key);
        timers[key] = startTimer(t);
      } else if (action === "pause") {
        if (t) timers[key] = pauseTimer(t);
      } else if (action === "resume") {
        if (t) {
          notifiedRef.current.delete(key);
          timers[key] = resumeTimer(t);
        }
      } else if (action === "cancel") {
        if (t) {
          notifiedRef.current.delete(key);
          const cancelled = cancelTimer(t);
          if (cancelled) delete timers[key];
        }
      }

      return { ...prev, timers };
    });
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
    timerTick,
  };

  return (
    <CookingSessionContext.Provider value={value}>
      {children}
    </CookingSessionContext.Provider>
  );
}
