import React, { useEffect } from "react";
import { useCookingSession } from "../../contexts/CookingSessionContext.jsx";
import { formatRemaining } from "../../utils/timerService.js";
import { useLiveCookingTimer } from "../../hooks/useLiveCookingTimer.js";

function BannerTimer({ timer }) {
  // Live tick — only ticks when timer is running
  const remainingMs = useLiveCookingTimer(timer);
  return (
    <div className="cooking-banner-timer">
      <span aria-hidden="true">⏱</span>
      <span className="cooking-banner-timer-remaining">
        {formatRemaining(remainingMs)}
      </span>
    </div>
  );
}

export default function CookingSessionBanner() {
  const { session, isStepperOpen, openStepper } = useCookingSession();

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
  const stepLabel = `Paso ${currentStepIndex + 1}/${steps.length}`;

  // Banner shows only the actively running timer.
  // Paused timers are shown as a count hint — they don't tick in the banner.
  let runningTimer = null;
  let pausedCount = 0;
  for (const timer of Object.values(timers || {})) {
    if (timer.status === "running") runningTimer = timer;
    else if (timer.status === "paused") pausedCount++;
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

      {runningTimer ? (
        <BannerTimer timer={runningTimer} />
      ) : pausedCount > 0 ? (
        <div className="cooking-banner-paused-hint" aria-hidden="true">
          <span>⏸ {pausedCount}</span>
        </div>
      ) : null}

      <span className="cooking-banner-chevron" aria-hidden="true">
        <svg viewBox="0 0 24 24" width="16" height="16" fill="none"
          stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
          <path d="M9 18l6-6-6-6" />
        </svg>
      </span>
    </button>
  );
}
