import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import { apiRequest } from "../api.js";
import { useAuth } from "../auth.jsx";

const OnboardingContext = createContext(null);

export function OnboardingProvider({ children }) {
  const { user } = useAuth();
  const [state, setState] = useState(null);
  const [rewardEvent, setRewardEvent] = useState(null); // { key, title, rewardBites }
  const loadedRef = useRef(false);
  const triggerQueueRef = useRef([]);
  const triggeringRef = useRef(false);

  const isEligible = user && ["basic", "free"].includes(String(user.subscriptionPlan || "").toLowerCase());

  const loadState = useCallback(async () => {
    if (!isEligible) return;
    try {
      const data = await apiRequest("/api/kitchen/onboarding/state");
      if (data?.onboarding) setState(data.onboarding);
    } catch (_) {}
  }, [isEligible]);

  useEffect(() => {
    if (!isEligible || loadedRef.current) return;
    loadedRef.current = true;
    loadState();
  }, [isEligible, loadState]);

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
        setTimeout(() => setRewardEvent(null), 4000);
      }
    } catch (_) {}
    finally {
      triggeringRef.current = false;
      if (triggerQueueRef.current.length > 0) _processTriggerQueue();
    }
  }, []);

  const notify = useCallback((type) => {
    if (!isEligible) return;
    if (!state || state.status === "completed" || state.status === "disabled") return;
    triggerQueueRef.current.push(type);
    _processTriggerQueue();
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
  return useContext(OnboardingContext) ?? { state: null, notify: () => {}, refresh: () => {}, rewardEvent: null, dismissReward: () => {}, isEligible: false };
}
