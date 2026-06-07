/**
 * timerService.js — Timestamp-based timer state management.
 *
 * All elapsed-time calculations are derived from stored ISO timestamps,
 * so timers continue correctly across page navigations, backgrounding, and refreshes.
 *
 * Timer state shape:
 *   {
 *     durationMs:  number          — total duration in milliseconds
 *     startedAt:   string | null   — ISO timestamp of last start/resume, null when idle/paused
 *     elapsed:     number          — ms already consumed before last pause
 *     status:      "idle" | "running" | "paused" | "done"
 *   }
 */

export function createTimer(durationMs) {
  return { durationMs, startedAt: null, elapsed: 0, status: "idle" };
}

export function startTimer(timer) {
  if (timer.status === "running") return timer;
  return { ...timer, startedAt: new Date().toISOString(), status: "running" };
}

export function pauseTimer(timer) {
  if (timer.status !== "running") return timer;
  const elapsed = timer.elapsed + (Date.now() - new Date(timer.startedAt).getTime());
  return { ...timer, startedAt: null, elapsed, status: "paused" };
}

export function resumeTimer(timer) {
  if (timer.status !== "paused") return timer;
  return { ...timer, startedAt: new Date().toISOString(), status: "running" };
}

export function cancelTimer(timer) {
  return { ...timer, startedAt: null, elapsed: 0, status: "idle" };
}

export function markDoneTimer(timer) {
  return { ...timer, startedAt: null, status: "done" };
}

/**
 * Compute remaining milliseconds (always >= 0).
 * Works after page refresh because it reads from startedAt timestamp.
 */
export function getRemainingMs(timer) {
  if (!timer) return 0;
  if (timer.status === "idle") return timer.durationMs;
  if (timer.status === "done") return 0;
  let elapsed = timer.elapsed || 0;
  if (timer.status === "running" && timer.startedAt) {
    elapsed += Date.now() - new Date(timer.startedAt).getTime();
  }
  return Math.max(0, timer.durationMs - elapsed);
}

/**
 * Format remaining milliseconds as "MM:SS" or "H:MM:SS".
 */
export function formatRemaining(remainingMs) {
  const totalSec = Math.ceil(remainingMs / 1000);
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  if (h > 0) return `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}
