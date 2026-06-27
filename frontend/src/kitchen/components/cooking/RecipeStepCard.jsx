import React from "react";
import RecipeTimer from "./RecipeTimer.jsx";
import { displayIngredientQuantity } from "../../utils/recipeScaling.js";
import { buildTimerId } from "../../utils/timerService.js";

function BasketIcon() {
  return (
    <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor"
      strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" style={{ display: "block", flexShrink: 0 }}>
      <path d="M3.2 9.5h17.6l-1.4 9A2.6 2.6 0 0 1 16.9 21H7.1a2.6 2.6 0 0 1-2.5-2.5l-1.4-9Z" />
      <path d="M8 9.5l3.2-6M16 9.5l-3.2-6M9.2 13.5v3.5M14.8 13.5v3.5M12 13.5v3.5" />
    </svg>
  );
}

export default function RecipeStepCard({
  step,
  stepNumber,
  totalSteps,
  isComplete,
  timers,
  executionId,
  recipeId,
  timerTick,
  onTimerAction,
  onToggleComplete,
  allIngredients = [],
  baseServings = 4,
  selectedServings = 4,
  checkedIngredients = [],
  onToggleIngredient,
}) {
  const { text, html, detectedTimers, title, tips, stepIngredients } = step;
  const ingredientRefs = Array.isArray(stepIngredients) ? stepIngredients : [];

  return (
    <div className={`cm-step-card${isComplete ? " cm-step-card--done" : ""}`}>

      {/* ── Headline ── */}
      <div className="cm-step-headline">
        <div className="cm-step-num" aria-label={`Paso ${stepNumber} de ${totalSteps}`}>
          {stepNumber}
        </div>
        <div className="cm-step-label-col">
          <div className="cm-step-eyebrow">Paso {stepNumber}</div>
          {title && <div className="cm-step-tag">{title}</div>}
        </div>
      </div>

      {/* ── Body ── */}
      <div className="cm-step-body">
        {html ? (
          <div className="cm-step-html" dangerouslySetInnerHTML={{ __html: html }} />
        ) : (
          <p>{text}</p>
        )}
        {tips && <p className="cm-step-tips">💡 {tips}</p>}
      </div>

      {/* ── Timer(s) ── */}
      {detectedTimers && detectedTimers.length > 0 ? (
        <div className="cm-step-timers">
          {detectedTimers.map((dt, timerIdx) => {
            const stepIndex = Number.isFinite(step.index) ? step.index : stepNumber - 1;
            const stepId = String(step.id || step.stepId || `step-${stepIndex}`);
            const timerId = String(dt.id || dt.timerId || (detectedTimers.length === 1 ? "default" : `timer-${timerIdx}`));
            const key = buildTimerId({ executionId, stepId, timerId });
            const legacyKey = `${step.index}_${timerIdx}`;
            const activeKey = timers?.[key] ? key : (timers?.[legacyKey] ? legacyKey : key);
            const timerMeta = {
              stepId,
              stepIndex,
              stepTitle: title || `Paso ${stepNumber}`,
              timerId,
              timerLabel: dt.label,
              durationMs: dt.durationSec * 1000,
              originalDurationMs: dt.durationSec * 1000,
            };
            return (
              <RecipeTimer
                key={activeKey}
                timerKey={activeKey}
                timer={timers?.[activeKey] || null}
                durationMs={dt.durationSec * 1000}
                label={dt.label}
                timerMeta={timerMeta}
                tick={timerTick}
                onAction={onTimerAction}
              />
            );
          })}
        </div>
      ) : null}

      {/* ── Per-step ingredients ── */}
      <div className={`cm-step-ing${ingredientRefs.length === 0 ? " cm-step-ing--empty" : ""}`}>
        <div className="cm-step-ing-header">
          <BasketIcon />
          <span>Ingredientes para este paso</span>
        </div>
        {ingredientRefs.length > 0 ? (
          <div className="cm-step-ing-list">
            {ingredientRefs.map((ref, idx) => {
              const fullIng = allIngredients.find((ing) =>
                (ref.ingredientId && ing.ingredientId && String(ing.ingredientId) === String(ref.ingredientId)) ||
                normalize(ing.name) === normalize(ref.name)
              );
              const qty = fullIng ? displayIngredientQuantity(fullIng, baseServings, selectedServings) : null;
              const ingredientKey = `${ref.ingredientId || normalize(ref.name) || "ingredient"}-${idx}`;
              const checked = checkedIngredients.includes(ingredientKey);
              return (
                <label key={ingredientKey} className={`cm-step-ing-row${checked ? " is-checked" : ""}`}>
                  <input
                    type="checkbox"
                    className="cm-step-ing-check"
                    checked={checked}
                    onChange={() => onToggleIngredient?.(ingredientKey)}
                  />
                  <span className="cm-step-ing-name">{ref.name}</span>
                  {qty ? <span className="cm-step-ing-qty">{qty}</span> : null}
                </label>
              );
            })}
          </div>
        ) : (
          <p className="cm-step-ing-empty">Este paso no tiene ingredientes vinculados.</p>
        )}
      </div>
    </div>
  );
}

function normalize(s) {
  return String(s || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();
}
