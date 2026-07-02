import React from "react";
import { formatRemaining, getRemainingMs, normalizeTimerStatus } from "../../utils/timerService.js";
import { primeAudio } from "../../utils/notificationService.js";
import { emitOnboardingEvent, ONBOARDING_EVENTS } from "../tour/guidedOnboardingEvents.js";

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

export default function RecipeTimer({ timerKey, timer, durationMs, label, timerMeta, tick, onAction }) {
  void tick;
  const status = normalizeTimerStatus(timer?.status);
  const isRunning = status === "running";
  const isPaused  = status === "paused";
  const isDone    = status === "finished";
  const isActive  = isRunning || isPaused;

  const remainingMs = getRemainingMs(timer);
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
    onAction(timerKey, "start", durationMs, timerMeta);
    emitOnboardingEvent(ONBOARDING_EVENTS.TIMER_STARTED);
  }

  const mainAction = isDone
    ? {
        label: "Reiniciar",
        icon: <ResetIcon />,
        ariaLabel: "Reiniciar temporizador",
        className: "cm-timer-round",
        onClick: handleStart
      }
    : isRunning
    ? {
        label: "Pausar",
        icon: <PauseIcon />,
        ariaLabel: "Pausar temporizador",
        className: "cm-timer-round",
        onClick: () => onAction(timerKey, "pause")
      }
    : isPaused
    ? {
        label: "Reanudar",
        icon: <PlayIcon />,
        ariaLabel: "Reanudar temporizador",
        className: "cm-timer-round cm-timer-round--primary",
        onClick: () => { primeAudio(); onAction(timerKey, "resume", durationMs, timerMeta); }
      }
    : {
        label: "Iniciar",
        icon: <PlayIcon />,
        ariaLabel: "Iniciar temporizador",
        className: "cm-timer-round cm-timer-round--primary",
        onClick: handleStart
      };

  return (
    <div
      className={`cm-timer ${toneClass}`}
      data-tour-id="recipe-timer"
      role="timer"
      aria-label={`${label}: ${formatRemaining(displayMs)} restantes`}
      title={`${timerMeta?.stepTitle || ""} · ${label} · ${formatRemaining(displayMs)} restantes`}
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
          <span className="cm-timer-badge cm-timer-badge--done">Finalizado</span>
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
        <button
          type="button"
          className={mainAction.className}
          onClick={mainAction.onClick}
          aria-label={mainAction.ariaLabel}
        >
          {mainAction.icon}
        </button>
        <span className="cm-timer-action-label">{mainAction.label}</span>
        {isActive && !isDone && (
          <button
            type="button"
            className="cm-timer-round cm-timer-reset"
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
