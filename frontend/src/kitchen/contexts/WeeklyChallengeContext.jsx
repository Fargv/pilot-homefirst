import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import { apiRequest } from "../api.js";
import { useAuth } from "../auth.jsx";
import { useOnboarding } from "./OnboardingContext.jsx";

const WeeklyChallengeContext = createContext(null);

export function WeeklyChallengeProvider({ children }) {
  const { user } = useAuth();
  const { state: onboardingState } = useOnboarding();
  const [state, setState] = useState(null);
  const [rewardEvent, setRewardEvent] = useState(null);
  const [betaProEvent, setBetaProEvent] = useState(null);
  const loadedRef = useRef(false);
  const triggerQueueRef = useRef([]);
  const triggeringRef = useRef(false);
  const stateReadyRef = useRef(false);

  const isOnboardingComplete = onboardingState?.status === "completed";

  const _processTriggerQueue = useCallback(async () => {
    if (triggeringRef.current || triggerQueueRef.current.length === 0) return;
    triggeringRef.current = true;
    try {
      const { type, contextData } = triggerQueueRef.current.shift();
      const data = await apiRequest("/api/kitchen/weekly/trigger", {
        method: "POST",
        body: JSON.stringify({ type, contextData })
      });
      if (data?.weekly) setState(data.weekly);
      if (data?.event?.completed && data.event.challenges?.length > 0) {
        setRewardEvent({
          challenges: data.event.challenges,
          bonusCompleted: data.event.bonusCompleted,
          bonusBites: data.event.bonusBites,
          betaProUnlocked: data.betaProUnlocked ?? false
        });
        setTimeout(() => setRewardEvent(null), 5000);
      }
      // Beta Pro unlocked — fire a separate event so the UI can show a dedicated message.
      if (data?.betaProUnlocked) {
        setBetaProEvent({ unlockedAt: new Date().toISOString() });
        setTimeout(() => setBetaProEvent(null), 8000);
      }
    } catch (_) {
      // non-fatal — never break existing flows
    } finally {
      triggeringRef.current = false;
      if (triggerQueueRef.current.length > 0) {
        setTimeout(_processTriggerQueue, 300);
      }
    }
  }, []);

  const loadState = useCallback(async () => {
    if (!user) return;
    try {
      const data = await apiRequest("/api/kitchen/weekly/state");
      setState(data?.weekly || null);
      stateReadyRef.current = true;
      if (triggerQueueRef.current.length > 0) {
        _processTriggerQueue();
      }
    } catch (_) {
      stateReadyRef.current = true;
    }
  }, [user, _processTriggerQueue]);

  useEffect(() => {
    if (!user || !isOnboardingComplete || loadedRef.current) return;
    loadedRef.current = true;
    loadState();
  }, [user, isOnboardingComplete, loadState]);

  useEffect(() => {
    if (!user) {
      loadedRef.current = false;
      stateReadyRef.current = false;
      setState(null);
    }
  }, [user]);

  const notify = useCallback((type, contextData) => {
    if (!user || !isOnboardingComplete) return;
    triggerQueueRef.current.push({ type, contextData });
    if (stateReadyRef.current) {
      _processTriggerQueue();
    }
  }, [user, isOnboardingComplete, _processTriggerQueue]);

  const refresh = useCallback(() => {
    loadedRef.current = false;
    stateReadyRef.current = false;
    loadState();
  }, [loadState]);

  const dismissReward = useCallback(() => setRewardEvent(null), []);
  const dismissBetaProEvent = useCallback(() => setBetaProEvent(null), []);

  return (
    <WeeklyChallengeContext.Provider value={{
      state,
      notify,
      refresh,
      rewardEvent,
      dismissReward,
      betaProEvent,
      dismissBetaProEvent
    }}>
      {children}
    </WeeklyChallengeContext.Provider>
  );
}

export function useWeeklyChallenge() {
  return useContext(WeeklyChallengeContext) ?? {
    state: null,
    notify: () => {},
    refresh: () => {},
    rewardEvent: null,
    dismissReward: () => {},
    betaProEvent: null,
    dismissBetaProEvent: () => {}
  };
}
