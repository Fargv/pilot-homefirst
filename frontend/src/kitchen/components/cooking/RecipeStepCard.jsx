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
  const { text, html, detectedTimers, title, tips } = step;

  return (
    <div className={`cooking-step-card${isComplete ? " cooking-step-card--done" : ""}`}>
      <div className="cooking-step-meta">
        <div
          className="cooking-step-number"
          aria-label={`Paso ${stepNumber} de ${totalSteps}`}
        >
          {stepNumber}
        </div>
      </div>

      <div className="cooking-step-text">
        {title && <p className="cooking-step-title">{title}</p>}
        {html ? (
          <div
            className="cooking-step-html"
            dangerouslySetInnerHTML={{ __html: html }}
          />
        ) : (
          <p>{text}</p>
        )}
        {tips && (
          <p className="cooking-step-tips">💡 {tips}</p>
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
