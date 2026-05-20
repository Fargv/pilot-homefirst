import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import { apiRequest } from "../api.js";
import { useAuth } from "../auth.jsx";

const OnboardingContext = createContext(null);

export function OnboardingProvider({ children }) {
  const { user } = useAuth();
  const [state, setState] = useState(null);
  const [rewardEvent, setRewardEvent] = useState(null);
  const loadedRef = useRef(false);
  const triggerQueueRef = useRef([]);
  const triggeringRef = useRef(false);
  const stateReadyRef = useRef(false);

  const isEligible = Boolean(user && ["basic", "free"].includes(String(user.subscriptionPlan || "").toLowerCase()));

  const _processTriggerQueue = useCallback(async () => {
    if (triggeringRef.current || triggerQueueRef.current.length === 0) return;
    triggeringRef.current = true;
    try {
      const type = triggerQueueRef.current.shift();
      const data = await apiRequest("/api/kitchen/onboarding/trigger", {
        method: "POST",
        body: JSON.stringify({ type })
      });
      if (data?.onboarding) setState(data.onboarding);
      if (data?.event?.completed && data.event.challenge) {
        setRewardEvent(data.event.challenge);
        setTimeout(() => setRewardEvent(null), 4500);
      }
    } catch (_) {
      // non-fatal — never break existing flows
    } finally {
      triggeringRef.current = false;
      if (triggerQueueRef.current.length > 0) {
        // process next queued trigger
        setTimeout(_processTriggerQueue, 300);
      }
    }
  }, []); // stable ref — refs don't need deps

  const loadState = useCallback(async () => {
    if (!isEligible) return;
    try {
      const data = await apiRequest("/api/kitchen/onboarding/state");
      if (data?.onboarding) {
        const s = data.onboarding;
        setState(s);
        stateReadyRef.current = true;
        // If any triggers were queued before state loaded, and onboarding is still active, process them now
        if (s.status !== "completed" && s.status !== "disabled" && triggerQueueRef.current.length > 0) {
          _processTriggerQueue();
        }
      }
    } catch (_) {}
  }, [isEligible, _processTriggerQueue]);

  useEffect(() => {
    if (!isEligible || loadedRef.current) return;
    loadedRef.current = true;
    loadState();
  }, [isEligible, loadState]);

  const notify = useCallback((type) => {
    if (!isEligible) return;
    // Enqueue even during loading — will flush once state arrives
    // But drop if state is known-complete or disabled
    if (stateReadyRef.current) {
      const s = state;
      if (!s || s.status === "completed" || s.status === "disabled") return;
    }
    triggerQueueRef.current.push(type);
    if (stateReadyRef.current) {
      _processTriggerQueue();
    }
    // If state not ready yet, queue is held until loadState flushes it
  }, [isEligible, state, _processTriggerQueue]);

  const refresh = useCallback(() => loadState(), [loadState]);
  const dismissReward = useCallback(() => setRewardEvent(null), []);

  return (
    <OnboardingContext.Provider value={{ state, notify, refresh, rewardEvent, dismissReward, isEligible }}>
      {children}
    </OnboardingContext.Provider>
  );
}

export function useOnboarding() {
  return useContext(OnboardingContext) ?? {
    state: null, notify: () => {}, refresh: () => {},
    rewardEvent: null, dismissReward: () => {}, isEligible: false
  };
}
