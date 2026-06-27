import React, { useEffect } from "react";
import { useCookingSession } from "../../contexts/CookingSessionContext.jsx";
import {
  formatRemaining,
  getNextActiveTimer,
  getRemainingMs,
  getVisibleTimers,
  normalizeTimerStatus,
} from "../../utils/timerService.js";

function FlameIcon() {
  return (
    <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor"
      strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" style={{ display: "block" }}>
      <path d="M8.5 14.5A2.5 2.5 0 0 0 11 12c0-1.4-.5-2-1-3-1.1-2.1-.2-4 2-6 .5 2.5 2 4.9 4 6.5 2 1.6 3 3.5 3 5.5a7 7 0 1 1-14 0c0-1.2.4-2.3 1-3a2.5 2.5 0 0 0 2.5 2.5Z" />
    </svg>
  );
}

function ClockIcon() {
  return (
    <svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor"
      strokeWidth="2.2" strokeLinecap="round" aria-hidden="true" style={{ display: "block" }}>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7.6V12l3 1.9" />
    </svg>
  );
}

function ChevronRightIcon() {
  return (
    <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor"
      strokeWidth="2.5" strokeLinecap="round" aria-hidden="true" style={{ display: "block" }}>
      <path d="M9 18l6-6-6-6" />
    </svg>
  );
}

function BannerTimer({ timer, tick }) {
  void tick;
  const remainingMs = getRemainingMs(timer);
  const status = normalizeTimerStatus(timer?.status);
  const label = timer?.timerLabel || timer?.stepTitle || "Temporizador";

  return (
    <span className={`cm-banner-timer-pill is-${status}`}>
      <ClockIcon />
      <span>{status === "finished" ? `${label}: finalizado` : `Próximo: ${label} · ${formatRemaining(remainingMs)}`}</span>
    </span>
  );
}

export default function CookingSessionBanner() {
  const { session, isStepperOpen, openStepper, timerTick } = useCookingSession();

  const bannerVisible = Boolean(session) && !isStepperOpen;
  useEffect(() => {
    if (bannerVisible) {
      document.body.classList.add("has-cooking-banner");
    } else {
      document.body.classList.remove("has-cooking-banner");
    }
    return () => { document.body.classList.remove("has-cooking-banner"); };
  }, [bannerVisible]);

  if (!session || isStepperOpen) return null;

  const { recipeName, currentStepIndex, steps, timers, isComplete } = session;
  const currentStep = steps[currentStepIndex];
  const stepTag = currentStep?.title || `Paso ${currentStepIndex + 1}`;
  const visibleTimers = getVisibleTimers(timers);
  const nextTimer = getNextActiveTimer(timers);
  const hasFinishedTimer = visibleTimers.some((timer) => normalizeTimerStatus(timer.status) === "finished");
  const timerSummary = visibleTimers.length > 0
    ? `${visibleTimers.length} temporizador${visibleTimers.length === 1 ? "" : "es"} activo${visibleTimers.length === 1 ? "" : "s"}`
    : null;

  return (
    <button
      type="button"
      className={`cm-banner${hasFinishedTimer ? " cm-banner--finished" : ""}`}
      onClick={openStepper}
      aria-label={`Modo cocina: ${recipeName}, paso ${currentStepIndex + 1} de ${steps.length}. Pulsa para volver.`}
    >
      <div className="cm-banner-flame" aria-hidden="true">
        <FlameIcon />
      </div>

      <div className="cm-banner-info">
        <div className="cm-banner-title">{recipeName}</div>
        <div className="cm-banner-sub-row">
          <span className="cm-banner-step">
            {isComplete ? "Completada" : `Paso ${currentStepIndex + 1}/${steps.length} · ${stepTag}`}
          </span>
          {timerSummary ? <span className="cm-banner-timer-count">{timerSummary}</span> : null}
        </div>
        {nextTimer ? (
          <div className="cm-banner-next-row">
            <BannerTimer timer={nextTimer} tick={timerTick} />
          </div>
        ) : null}
        {visibleTimers.length > 1 ? (
          <div className="cm-banner-chip-row" aria-hidden="true">
            {visibleTimers.slice(0, 3).map((timer) => (
              <span key={timer.id || `${timer.stepIndex}-${timer.timerLabel}`} className={`cm-banner-mini-chip is-${normalizeTimerStatus(timer.status)}`}>
                {formatRemaining(getRemainingMs(timer))}
              </span>
            ))}
          </div>
        ) : null}
      </div>

      <div className="cm-banner-chevron" aria-hidden="true">
        <ChevronRightIcon />
      </div>
    </button>
  );
}
