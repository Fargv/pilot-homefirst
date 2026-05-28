import React from "react";
import { formatRemaining } from "../../utils/timerService.js";
import { primeAudio } from "../../utils/notificationService.js";
import { useLiveCookingTimer } from "../../hooks/useLiveCookingTimer.js";

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
        <span className="recipe-timer-icon" aria-hidden="true">⏰</span>
        <span className="recipe-timer-label">¡Tiempo! {label}</span>
        <button
          type="button"
          className="recipe-timer-cancel"
          onClick={() => onAction(timerKey, "cancel")}
          aria-label="Reiniciar temporizador"
        >
          ↺
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
            ⏸
          </button>
        ) : (
          <button
            type="button"
            className="recipe-timer-ctrl-btn"
            onClick={() => { primeAudio(); onAction(timerKey, "resume"); }}
            aria-label="Reanudar temporizador"
          >
            ▶
          </button>
        )}
        <button
          type="button"
          className="recipe-timer-cancel"
          onClick={() => onAction(timerKey, "cancel")}
          aria-label="Cancelar temporizador"
        >
          ✕
        </button>
      </div>
    );
  }

  return (
    <button type="button" className="recipe-timer recipe-timer--idle" onClick={handleStart}>
      <span className="recipe-timer-play" aria-hidden="true">▶</span>
      <span className="recipe-timer-label">{label} · {formatRemaining(durationMs)}</span>
    </button>
  );
}
