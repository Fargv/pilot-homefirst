import React from "react";
import { formatRemaining } from "../../utils/timerService.js";
import { primeAudio } from "../../utils/notificationService.js";
import { useLiveCookingTimer } from "../../hooks/useLiveCookingTimer.js";

function PlayIcon() {
  return (
    <svg viewBox="0 0 20 20" width="16" height="16" fill="currentColor" aria-hidden="true" style={{ display: "block" }}>
      <path d="M6.5 4.5l10 5.5-10 5.5V4.5z" />
    </svg>
  );
}

function PauseIcon() {
  return (
    <svg viewBox="0 0 20 20" width="16" height="16" fill="currentColor" aria-hidden="true" style={{ display: "block" }}>
      <rect x="4" y="3.5" width="4" height="13" rx="1" />
      <rect x="12" y="3.5" width="4" height="13" rx="1" />
    </svg>
  );
}

function ResetIcon() {
  return (
    <svg viewBox="0 0 20 20" width="15" height="15" fill="none" stroke="currentColor"
      strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" style={{ display: "block" }}>
      <path d="M4 4v4h4M4 8A8 8 0 1 1 5.3 13" />
    </svg>
  );
}

function ClockIcon() {
  return (
    <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor"
      strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" style={{ display: "block" }}>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7.6V12l3 1.9" />
    </svg>
  );
}

function CheckIcon() {
  return (
    <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor"
      strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" style={{ display: "block" }}>
      <path d="M20 6 9 17l-5-5" />
    </svg>
  );
}

export default function RecipeTimer({ timerKey, timer, durationMs, label, onAction }) {
  const status = timer?.status || "idle";
  const isRunning = status === "running";
  const isPaused  = status === "paused";
  const isDone    = status === "done";
  const isActive  = isRunning || isPaused;

  const remainingMs = useLiveCookingTimer(isActive ? timer : null);
  const displayMs = isDone ? 0 : (isActive ? remainingMs : durationMs);
  const isUrgent = isRunning && remainingMs < 10_000;

  const pct = durationMs > 0 ? Math.min(100, (1 - displayMs / durationMs) * 100) : 0;

  const toneClass = isDone
    ? "cm-timer--ok"
    : isRunning
    ? `cm-timer--warm${isUrgent ? " cm-timer--urgent" : ""}`
    : isPaused
    ? "cm-timer--paused"
    : "cm-timer--idle";

  function handleStart() {
    primeAudio();
    onAction(timerKey, "start", durationMs);
  }

  return (
    <div
      className={`cm-timer ${toneClass}`}
      role="timer"
      aria-label={`${label}: ${formatRemaining(displayMs)} restantes`}
    >
      <div className="cm-timer-header">
        <div className="cm-timer-icon-sq">
          {isDone ? <CheckIcon /> : <ClockIcon />}
        </div>
        <div className="cm-timer-meta">
          <div className="cm-timer-eyebrow">
            {isDone ? "Temporizador" : "Temporizador del paso"}
          </div>
          <div className="cm-timer-name">{label}</div>
        </div>
        {isRunning && (
          <span className="cm-timer-badge cm-timer-badge--running">En marcha</span>
        )}
        {isDone && (
          <span className="cm-timer-badge cm-timer-badge--done">Listo</span>
        )}
      </div>

      <div className="cm-timer-countdown-row">
        <span className="cm-timer-countdown">{formatRemaining(displayMs)}</span>
        <span className="cm-timer-countdown-sub">restante</span>
      </div>

      <div className="cm-timer-track">
        <div className="cm-timer-fill" style={{ width: `${pct}%` }} />
      </div>

      <div className="cm-timer-actions">
        {isDone ? (
          <button
            type="button"
            className="cm-pill cm-pill--secondary cm-timer-cta"
            onClick={() => onAction(timerKey, "cancel")}
            aria-label="Reiniciar temporizador"
          >
            <ResetIcon /> Reiniciar
          </button>
        ) : isRunning ? (
          <button
            type="button"
            className="cm-pill cm-pill--secondary cm-timer-cta"
            onClick={() => onAction(timerKey, "pause")}
            aria-label="Pausar temporizador"
          >
            <PauseIcon /> Pausar
          </button>
        ) : isPaused ? (
          <button
            type="button"
            className="cm-pill cm-pill--primary cm-timer-cta"
            onClick={() => { primeAudio(); onAction(timerKey, "resume"); }}
            aria-label="Reanudar temporizador"
          >
            <PlayIcon /> Reanudar
          </button>
        ) : (
          <button
            type="button"
            className="cm-pill cm-pill--primary cm-timer-cta"
            onClick={handleStart}
            aria-label="Iniciar temporizador"
          >
            <PlayIcon /> Iniciar
          </button>
        )}
        {isActive && !isDone && (
          <button
            type="button"
            className="cm-iconbtn cm-timer-reset"
            onClick={() => onAction(timerKey, "cancel")}
            aria-label="Reiniciar temporizador"
          >
            <ResetIcon />
          </button>
        )}
      </div>
    </div>
  );
}
