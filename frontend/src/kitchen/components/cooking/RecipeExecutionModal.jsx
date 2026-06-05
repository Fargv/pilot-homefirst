import React, { useState } from "react";
import { createPortal } from "react-dom";
import RecipeServingsControl from "../RecipeServingsControl.jsx";
import { displayIngredientQuantity } from "../../utils/recipeScaling.js";
import { parseRecipeSteps, estimateTotalDuration, formatDuration } from "../../utils/recipeStepParser.js";
import { useCookingSession } from "../../contexts/CookingSessionContext.jsx";

export default function RecipeExecutionModal({ dish, initialServings, onClose, onStart }) {
  const { startSession } = useCookingSession();

  const recipe = dish?.recipe || {};
  const baseServings = recipe.baseServings ?? recipe.servings ?? null;
  const [servings, setServings] = useState(
    initialServings >= 1 ? initialServings : (baseServings >= 1 ? baseServings : 4)
  );

  const ingredients = recipe.ingredients || [];
  const steps = parseRecipeSteps(recipe.steps);
  const stepCount = steps?.length || 0;
  const estimatedSec = steps ? estimateTotalDuration(steps) : null;
  const hasContent = ingredients.length > 0 || steps;

  function handleStart() {
    startSession(dish, servings);
    onStart?.();
    onClose();
  }

  const modal = (
    <div
      className="cooking-execution-backdrop"
      role="presentation"
      onClick={onClose}
    >
      <div
        className="cooking-execution-modal"
        role="dialog"
        aria-modal="true"
        aria-label={`Preparar: ${dish?.name || "Receta"}`}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="cooking-execution-header">
          <button
            type="button"
            className="cooking-execution-close"
            onClick={onClose}
            aria-label="Cerrar"
          >
            <svg viewBox="0 0 24 24" aria-hidden="true" width="18" height="18"
              fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round">
              <path d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
          <p className="cooking-execution-eyebrow">Modo cocina</p>
          <h2 className="cooking-execution-title">{dish?.name || "Receta"}</h2>
        </div>

        {/* Servings */}
        <div className="cooking-execution-servings">
          <RecipeServingsControl
            servings={servings}
            baseServings={baseServings}
            onChange={setServings}
          />
        </div>

        {/* Summary chips */}
        <div className="cooking-execution-summary">
          {ingredients.length > 0 && (
            <div className="cooking-execution-chip">
              <span className="cooking-execution-chip-icon" aria-hidden="true">🥕</span>
              <span>
                {ingredients.length} {ingredients.length === 1 ? "ingrediente" : "ingredientes"}
              </span>
            </div>
          )}
          {stepCount > 0 && (
            <div className="cooking-execution-chip">
              <span className="cooking-execution-chip-icon" aria-hidden="true">📋</span>
              <span>{stepCount} {stepCount === 1 ? "paso" : "pasos"}</span>
            </div>
          )}
          {estimatedSec && (
            <div className="cooking-execution-chip">
              <span className="cooking-execution-chip-icon" aria-hidden="true">⏱</span>
              <span>~{formatDuration(estimatedSec)}</span>
            </div>
          )}
        </div>

        {/* Scaled ingredient list */}
        {ingredients.length > 0 && (
          <div className="cooking-execution-ingredients">
            <p className="cooking-execution-section-title">Ingredientes</p>
            <ul className="cooking-execution-ingredient-list">
              {ingredients.map((item, idx) => (
                <li key={idx} className="cooking-execution-ingredient">
                  <span className="cooking-execution-ingredient-name">{item.name}</span>
                  <span className="cooking-execution-ingredient-qty">
                    {displayIngredientQuantity(item, baseServings, servings)}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        )}

        {!hasContent && (
          <p className="kitchen-muted" style={{ textAlign: "center", padding: "16px 24px" }}>
            Esta receta aún no tiene elaboración detallada.
          </p>
        )}

        {/* CTA */}
        <div className="cooking-execution-cta-wrap">
          <button type="button" className="cooking-cta" onClick={handleStart}>
            Comenzar
          </button>
        </div>
      </div>
    </div>
  );

  return createPortal(modal, document.body);
}
