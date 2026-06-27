/**
 * Timestamp-based timer state management for guided cooking.
 *
 * Timers are keyed outside this module by execution, step, and timer identity.
 * Remaining time is derived from timestamps so countdowns stay accurate after
 * route changes, tab backgrounding, device sleep, or modal minimize/reopen.
 */

export function buildTimerId({ executionId, stepId, timerId = "default" }) {
  return `${executionId || "execution"}:${stepId || "step"}:${timerId || "default"}`;
}

export function normalizeTimerStatus(status) {
  if (status === "done") return "finished";
  return status || "idle";
}

export function createTimer(input) {
  const config = typeof input === "number" ? { durationMs: input } : (input || {});
  const durationMs = Math.max(0, Number(config.originalDurationMs ?? config.durationMs ?? 0));
  const id = config.id || buildTimerId(config);

  return {
    id,
    executionId: String(config.executionId || ""),
    recipeId: String(config.recipeId || ""),
    stepId: String(config.stepId || ""),
    stepIndex: Number.isFinite(config.stepIndex) ? config.stepIndex : 0,
    stepTitle: config.stepTitle || "",
    timerId: config.timerId || "default",
    timerLabel: config.timerLabel || config.label || "Temporizador",
    originalDurationMs: durationMs,
    durationMs,
    startedAt: null,
    pausedAt: null,
    finishedAt: null,
    elapsed: 0,
    status: "idle",
  };
}

export function startTimer(timer) {
  if (!timer) return timer;
  const status = normalizeTimerStatus(timer.status);
  if (status === "running") return { ...timer, status };
  if (status === "paused") return resumeTimer(timer);

  return {
    ...timer,
    startedAt: new Date().toISOString(),
    pausedAt: null,
    finishedAt: null,
    elapsed: 0,
    status: "running",
  };
}

export function pauseTimer(timer) {
  if (!timer || normalizeTimerStatus(timer.status) !== "running") return timer;
  const startedAtMs = timer.startedAt ? new Date(timer.startedAt).getTime() : Date.now();
  const elapsed = (timer.elapsed || 0) + Math.max(0, Date.now() - (Number.isFinite(startedAtMs) ? startedAtMs : Date.now()));

  return {
    ...timer,
    startedAt: null,
    pausedAt: new Date().toISOString(),
    elapsed,
    status: "paused",
  };
}

export function resumeTimer(timer) {
  if (!timer || normalizeTimerStatus(timer.status) !== "paused") return timer;

  return {
    ...timer,
    startedAt: new Date().toISOString(),
    pausedAt: null,
    status: "running",
  };
}

export function cancelTimer(timer) {
  if (!timer) return timer;

  return {
    ...timer,
    startedAt: null,
    pausedAt: null,
    elapsed: 0,
    status: "cancelled",
  };
}

export function markDoneTimer(timer) {
  if (!timer) return timer;

  return {
    ...timer,
    startedAt: null,
    pausedAt: null,
    finishedAt: new Date().toISOString(),
    status: "finished",
  };
}

export function getRemainingMs(timer) {
  if (!timer) return 0;

  const status = normalizeTimerStatus(timer.status);
  const durationMs = Number(timer.originalDurationMs ?? timer.durationMs ?? 0);
  if (status === "idle" || status === "cancelled") return durationMs;
  if (status === "finished") return 0;

  let elapsed = timer.elapsed || 0;
  if (status === "running" && timer.startedAt) {
    const startedAtMs = new Date(timer.startedAt).getTime();
    if (Number.isFinite(startedAtMs)) {
      elapsed += Date.now() - startedAtMs;
    }
  }
  return Math.max(0, durationMs - elapsed);
}

export function getVisibleTimers(timers) {
  return Object.values(timers || {})
    .filter((timer) => ["running", "paused", "finished"].includes(normalizeTimerStatus(timer.status)))
    .sort((a, b) => {
      const aStatus = normalizeTimerStatus(a.status);
      const bStatus = normalizeTimerStatus(b.status);
      if (aStatus === "finished" && bStatus !== "finished") return -1;
      if (aStatus !== "finished" && bStatus === "finished") return 1;
      return getRemainingMs(a) - getRemainingMs(b);
    });
}

export function getNextActiveTimer(timers) {
  const visibleTimers = getVisibleTimers(timers);
  return visibleTimers.find((timer) => normalizeTimerStatus(timer.status) === "running")
    || visibleTimers.find((timer) => normalizeTimerStatus(timer.status) === "paused")
    || visibleTimers[0]
    || null;
}

export function formatRemaining(remainingMs) {
  const totalSec = Math.ceil(remainingMs / 1000);
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  if (h > 0) return `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}
