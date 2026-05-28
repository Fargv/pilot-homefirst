import React from "react";
import { useCookingSession } from "../../contexts/CookingSessionContext.jsx";
import { formatRemaining } from "../../utils/timerService.js";
import { useLiveCookingTimer } from "../../hooks/useLiveCookingTimer.js";

function BannerTimer({ timer }) {
  // Own live tick — updates every second when running
  const remainingMs = useLiveCookingTimer(timer?.status === "running" ? timer : null);
  const displayMs = timer?.status === "paused"
    ? (remainingMs > 0 ? remainingMs : 0)
    : remainingMs;

  return (
    <div className={`cooking-banner-timer${timer?.status === "paused" ? " is-paused" : ""}`}>
      <span aria-hidden="true">{timer?.status === "running" ? "⏱" : "⏸"}</span>
      <span className="cooking-banner-timer-remaining">
        {formatRemaining(displayMs)}
      </span>
    </div>
  );
}

export default function CookingSessionBanner() {
  const { session, isStepperOpen, openStepper } = useCookingSession();

  if (!session || isStepperOpen) return null;

  const { recipeName, currentStepIndex, steps, timers, isComplete } = session;
  const stepLabel = `Paso ${currentStepIndex + 1}/${steps.length}`;

  // Find the first running or paused timer
  let activeTimer = null;
  for (const timer of Object.values(timers || {})) {
    if (timer.status === "running" || timer.status === "paused") {
      activeTimer = timer;
      break;
    }
  }

  return (
    <button
      type="button"
      className="cooking-banner"
      onClick={openStepper}
      aria-label={`Modo cocina activo: ${recipeName}, ${stepLabel}. Pulsa para volver.`}
    >
      <span className="cooking-banner-icon" aria-hidden="true">
        {isComplete ? "🎉" : "🍳"}
      </span>

      <div className="cooking-banner-content">
        <span className="cooking-banner-name">{recipeName}</span>
        <span className="cooking-banner-step">
          {isComplete ? "Completada" : stepLabel}
        </span>
      </div>

      {activeTimer ? <BannerTimer timer={activeTimer} /> : null}

      <span className="cooking-banner-chevron" aria-hidden="true">
        <svg viewBox="0 0 24 24" width="16" height="16" fill="none"
          stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
          <path d="M9 18l6-6-6-6" />
        </svg>
      </span>
    </button>
  );
}
