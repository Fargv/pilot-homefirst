import { useEffect, useState } from "react";
import { getRemainingMs } from "../utils/timerService.js";

/**
 * useLiveCookingTimer — live countdown for a single timer state object.
 *
 * Returns the current remaining milliseconds, recomputed from real timestamps
 * on every tick so it stays accurate after page refresh, tab switch, or sleep.
 *
 * Ticking only occurs while status === "running" — no wasted intervals when
 * the timer is idle, paused, or done.
 *
 * @param {object|null} timer — timer state from CookingSessionContext
 * @returns {number} remaining milliseconds (clamped to >= 0)
 */
export function useLiveCookingTimer(timer) {
  const isRunning = timer?.status === "running";

  // Increment this counter every second to force a re-render.
  // The actual remaining time is always computed fresh from timestamps.
  const [, setTick] = useState(0);

  // 1-second interval while running
  useEffect(() => {
    if (!isRunning) return;
    const id = setInterval(() => setTick((n) => n + 1), 1000);
    return () => clearInterval(id);
  }, [isRunning]);

  // Immediately recalculate when the page becomes visible again.
  // Handles the case where the device slept or the tab was backgrounded.
  useEffect(() => {
    if (!isRunning) return;
    const handleVisibility = () => {
      if (document.visibilityState === "visible") {
        setTick((n) => n + 1);
      }
    };
    document.addEventListener("visibilitychange", handleVisibility);
    return () => document.removeEventListener("visibilitychange", handleVisibility);
  }, [isRunning]);

  return getRemainingMs(timer);
}
