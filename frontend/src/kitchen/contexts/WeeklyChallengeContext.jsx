import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import { apiRequest } from "../api.js";
import { useAuth } from "../auth.jsx";
import { useOnboarding } from "./OnboardingContext.jsx";
import { triggerMilestone } from "../hooks/useRewardAnimation.js";

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
      if (data?.event?.challenges?.length > 0) {
        const rewardData = {
          challenges: data.event.challenges,
          bonusCompleted: data.event.bonusCompleted ?? false,
          bonusBites: data.event.bonusBites ?? 0,
          betaProUnlocked: data.betaProUnlocked ?? false
        };
        setRewardEvent(rewardData);
        setTimeout(() => setRewardEvent(null), 5000);

        // Fire Anime.js milestone toast for the reward
        const totalBites = (data.event.challenges || []).reduce((s, c) => s + (c.rewardBites || 0), 0)
          + (data.event.bonusCompleted ? (data.event.bonusBites || 0) : 0);
        const challengeCount = data.event.challenges.length;
        triggerMilestone({
          title: challengeCount === 1
            ? data.event.challenges[0].title
            : `${challengeCount} retos completados`,
          subtitle: totalBites > 0 ? `+${totalBites} Bites` : "",
          icon: "🏆",
          variant: "trophy"
        });
      }
      // Beta Pro unlocked — fire a separate event so the UI can show a dedicated modal.
      // No auto-close: the user must explicitly dismiss it so they don't miss it.
      if (data?.betaProUnlocked) {
        setBetaProEvent({ unlockedAt: new Date().toISOString() });
        triggerMilestone({
          title: "¡Pro Beta desbloqueado!",
          subtitle: "Acceso Pro activo durante el periodo beta",
          icon: "⭐",
          variant: "spark"
        });
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
