import React from "react";
import RecipeTimer from "./RecipeTimer.jsx";
import { displayIngredientQuantity } from "../../utils/recipeScaling.js";

export default function RecipeStepCard({
  step,
  stepNumber,
  totalSteps,
  isComplete,
  timers,
  onTimerAction,
  onToggleComplete,
  allIngredients = [],
  baseServings = 4,
  selectedServings = 4,
}) {
  const { text, html, detectedTimers, title, tips, stepIngredients } = step;

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

      {stepIngredients && stepIngredients.length > 0 ? (
        <div className="cooking-step-ingredients">
          <span className="cooking-step-ingredients-label">Ingredientes de este paso</span>
          <ul className="cooking-step-ingredients-list">
            {stepIngredients.map((ref, idx) => {
              const fullIng = allIngredients.find((ing) =>
                (ref.ingredientId && ing.ingredientId && String(ing.ingredientId) === String(ref.ingredientId)) ||
                normalize(ing.name) === normalize(ref.name)
              );
              const qty = fullIng ? displayIngredientQuantity(fullIng, baseServings, selectedServings) : null;
              return (
                <li key={idx} className="cooking-step-ingredient-row">
                  <span className="cooking-step-ingredient-name">{ref.name}</span>
                  {qty ? <span className="cooking-step-ingredient-qty">{qty}</span> : null}
                </li>
              );
            })}
          </ul>
        </div>
      ) : null}

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

function normalize(s) {
  return String(s || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();
}
