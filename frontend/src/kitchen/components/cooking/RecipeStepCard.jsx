import React from "react";
import RecipeTimer from "./RecipeTimer.jsx";

export default function RecipeStepCard({
  step,
  stepNumber,
  totalSteps,
  isComplete,
  timers,
  onTimerAction,
  onToggleComplete,
}) {
  const { text, html, detectedTimers } = step;

  return (
    <div className={`cooking-step-card${isComplete ? " cooking-step-card--done" : ""}`}>
      <div className="cooking-step-meta">
        <div
          className="cooking-step-number"
          aria-label={`Paso ${stepNumber} de ${totalSteps}`}
        >
          {stepNumber}
        </div>
        <button
          type="button"
          className={`cooking-step-check${isComplete ? " is-checked" : ""}`}
          onClick={onToggleComplete}
          aria-label={isComplete ? "Desmarcar paso completado" : "Marcar paso como completado"}
          aria-pressed={isComplete}
        >
          {isComplete ? "✓" : ""}
        </button>
      </div>

      <div className="cooking-step-text">
        {html ? (
          <div
            className="cooking-step-html"
            dangerouslySetInnerHTML={{ __html: html }}
          />
        ) : (
          <p>{text}</p>
        )}
      </div>

      {detectedTimers && detectedTimers.length > 0 ? (
        <div className="cooking-step-timers">
          {detectedTimers.map((dt, timerIdx) => {
            const key = `${step.index}_${timerIdx}`;
            return (
              <RecipeTimer
                key={key}
                timerKey={key}
                timer={timers?.[key] || null}
                durationMs={dt.durationSec * 1000}
                label={dt.label}
                onAction={onTimerAction}
              />
            );
          })}
        </div>
      ) : null}
    </div>
  );
}
