import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import { apiRequest } from "../api.js";
import { useAuth } from "../auth.jsx";

const OnboardingContext = createContext(null);

export function OnboardingProvider({ children }) {
  const { user } = useAuth();
  const [state, setState] = useState(null);
  const [rewardEvent, setRewardEvent] = useState(null);
  // Fired when onboarding fully completes. Requires explicit user dismissal — no auto-close.
  const [completionEvent, setCompletionEvent] = useState(false);
  const loadedRef = useRef(false);
  const triggerQueueRef = useRef([]);
  const triggeringRef = useRef(false);
  const stateReadyRef = useRef(false);

  // isEligible by plan — kept for callers that want to hint UI, but NOT used to gate loading.
  // Backend decides eligibility; a record may exist for any plan if admin-assigned.
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
      // Onboarding fully complete — show the celebration modal (no auto-dismiss).
      if (data?.event?.allDone) {
        setCompletionEvent(true);
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
      const data = await apiRequest("/api/kitchen/onboarding/state");
      if (data?.onboarding) {
        const s = data.onboarding;
        setState(s);
        stateReadyRef.current = true;
        if (s.status !== "completed" && s.status !== "disabled" && triggerQueueRef.current.length > 0) {
          _processTriggerQueue();
        }
      } else {
        // Backend returned null — no record for this user
        setState(null);
        stateReadyRef.current = true;
      }
    } catch (_) {}
  }, [user, _processTriggerQueue]);

  useEffect(() => {
    if (!user || loadedRef.current) return;
    loadedRef.current = true;
    loadState();
  }, [user, loadState]);

  // Reset loadedRef when user changes (logout/login) so we reload for the new user
  useEffect(() => {
    if (!user) {
      loadedRef.current = false;
      stateReadyRef.current = false;
      setState(null);
    }
  }, [user]);

  const notify = useCallback((type) => {
    if (!user) return;
    if (stateReadyRef.current) {
      const s = state;
      if (!s || s.status === "completed" || s.status === "disabled") return;
    }
    triggerQueueRef.current.push(type);
    if (stateReadyRef.current) {
      _processTriggerQueue();
    }
  }, [user, state, _processTriggerQueue]);

  const refresh = useCallback(() => {
    loadedRef.current = false;
    stateReadyRef.current = false;
    loadState();
  }, [loadState]);
  const dismissReward = useCallback(() => setRewardEvent(null), []);
  const dismissCompletionEvent = useCallback(() => setCompletionEvent(false), []);

  return (
    <OnboardingContext.Provider value={{
      state, notify, refresh,
      rewardEvent, dismissReward,
      completionEvent, dismissCompletionEvent,
      isEligible
    }}>
      {children}
    </OnboardingContext.Provider>
  );
}

export function useOnboarding() {
  return useContext(OnboardingContext) ?? {
    state: null, notify: () => {}, refresh: () => {},
    rewardEvent: null, dismissReward: () => {},
    completionEvent: false, dismissCompletionEvent: () => {},
    isEligible: false
  };
}
