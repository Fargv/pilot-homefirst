import React from "react";
import { formatRemaining } from "../../utils/timerService.js";
import { primeAudio } from "../../utils/notificationService.js";
import { useLiveCookingTimer } from "../../hooks/useLiveCookingTimer.js";

function PlayIcon() {
  return (
    <svg viewBox="0 0 20 20" width="14" height="14" fill="currentColor" aria-hidden="true">
      <path d="M6.5 4.5l10 5.5-10 5.5V4.5z" />
    </svg>
  );
}

function PauseIcon() {
  return (
    <svg viewBox="0 0 20 20" width="14" height="14" fill="currentColor" aria-hidden="true">
      <rect x="4" y="3.5" width="4" height="13" rx="1" />
      <rect x="12" y="3.5" width="4" height="13" rx="1" />
    </svg>
  );
}

function ResetIcon() {
  return (
    <svg viewBox="0 0 20 20" width="14" height="14" fill="none" stroke="currentColor"
      strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M4 4v4h4M4 8A8 8 0 1 1 5.3 13" />
    </svg>
  );
}

function CancelIcon() {
  return (
    <svg viewBox="0 0 20 20" width="12" height="12" fill="none" stroke="currentColor"
      strokeWidth="2.5" strokeLinecap="round" aria-hidden="true">
      <path d="M15 5L5 15M5 5l10 10" />
    </svg>
  );
}

function TimerDoneIcon() {
  return (
    <svg viewBox="0 0 20 20" width="18" height="18" fill="none" stroke="currentColor"
      strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="10" cy="11" r="7" />
      <path d="M10 8v3l2 2" />
      <path d="M8 2h4M10 2v2" />
    </svg>
  );
}

export default function RecipeTimer({ timerKey, timer, durationMs, label, onAction }) {
  const status = timer?.status || "idle";
  const isRunning = status === "running";
  const isPaused  = status === "paused";
  const isDone    = status === "done";

  // Live remaining time — ticks every second when running,
  // uses timestamp math so it stays correct after refresh/sleep.
  const remainingMs = useLiveCookingTimer(isRunning || isPaused ? timer : null);
  const displayMs = isDone ? 0 : (isRunning || isPaused ? remainingMs : durationMs);
  const isUrgent = isRunning && remainingMs < 10_000;

  function handleStart() {
    primeAudio();
    onAction(timerKey, "start", durationMs);
  }

  if (isDone) {
    return (
      <div className="recipe-timer recipe-timer--done" role="status">
        <span className="recipe-timer-icon" aria-label="Tiempo terminado"><TimerDoneIcon /></span>
        <span className="recipe-timer-label">¡Tiempo! {label}</span>
        <button
          type="button"
          className="recipe-timer-cancel"
          onClick={() => onAction(timerKey, "cancel")}
          aria-label="Reiniciar temporizador"
        >
          <ResetIcon />
        </button>
      </div>
    );
  }

  if (isRunning || isPaused) {
    return (
      <div
        className={`recipe-timer recipe-timer--active${isUrgent ? " recipe-timer--urgent" : ""}`}
        role="timer"
        aria-live="polite"
        aria-label={`${label}: ${formatRemaining(displayMs)} restantes`}
      >
        <span className="recipe-timer-countdown">{formatRemaining(displayMs)}</span>
        {isRunning ? (
          <button
            type="button"
            className="recipe-timer-ctrl-btn"
            onClick={() => onAction(timerKey, "pause")}
            aria-label="Pausar temporizador"
          >
            <PauseIcon />
          </button>
        ) : (
          <button
            type="button"
            className="recipe-timer-ctrl-btn"
            onClick={() => { primeAudio(); onAction(timerKey, "resume"); }}
            aria-label="Reanudar temporizador"
          >
            <PlayIcon />
          </button>
        )}
        <button
          type="button"
          className="recipe-timer-cancel"
          onClick={() => onAction(timerKey, "cancel")}
          aria-label="Cancelar temporizador"
        >
          <CancelIcon />
        </button>
      </div>
    );
  }

  return (
    <button type="button" className="recipe-timer recipe-timer--idle" onClick={handleStart}>
      <span className="recipe-timer-play" aria-hidden="true"><PlayIcon /></span>
      <span className="recipe-timer-label">{label} · {formatRemaining(durationMs)}</span>
    </button>
  );
}
