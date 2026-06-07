import React, { useEffect, useState } from "react";
import RecipeEditor from "./RecipeEditor.jsx";
import { useCookingSession } from "../contexts/CookingSessionContext.jsx";
import { getInitialServings, getRecipeBaseServings, displayIngredientQuantity } from "../utils/recipeScaling.js";
import { estimateTotalDuration, formatDuration, parseRecipeSteps } from "../utils/recipeStepParser.js";

export default function RecipeModal({ dish, targetServings = null, onClose }) {
  const { startSession } = useCookingSession();
  const recipe = dish?.recipe || {};
  const baseServings = getRecipeBaseServings(recipe);
  const initialServings = targetServings ?? getInitialServings({ recipe, dish });
  const [selectedServings, setSelectedServings] = useState(initialServings);

  useEffect(() => {
    setSelectedServings(initialServings);
  }, [dish?._id, initialServings]);

  if (!dish) return null;

  const recipeIngredients = Array.isArray(recipe.ingredients) ? recipe.ingredients : [];
  const fallbackIngredients = recipeIngredients.length
    ? []
    : (Array.isArray(dish.ingredients) ? dish.ingredients : [])
        .map((item) => ({
          name: item.displayName || item.name || item.canonicalName || "",
          quantity: "",
          ingredientId: item.ingredientId || null,
        }))
        .filter((item) => item.name);
  const ingredients = recipeIngredients.length ? recipeIngredients : fallbackIngredients;
  const steps = recipe.elaboration ?? recipe.steps ?? null;
  const parsedSteps = parseRecipeSteps(steps);
  const stepCount = parsedSteps?.length || 0;
  const estimatedSec = parsedSteps ? estimateTotalDuration(parsedSteps) : null;
  const hasElaboration = stepCount > 0;
  const hasRecipeContent = recipeIngredients.length > 0 || Boolean(steps);
  const hasContent = ingredients.length > 0 || Boolean(steps);

  const handleExecuteRecipe = () => {
    startSession(dish, selectedServings);
    onClose?.();
  };

  const executeAction = hasRecipeContent ? (
    <div className="recipe-modal-launch">
      <div className="cooking-execution-summary recipe-modal-summary" aria-label="Resumen de cocina">
        {ingredients.length > 0 ? (
          <div className="cooking-execution-chip">
            <span className="cooking-execution-chip-icon" aria-hidden="true">🥕</span>
            {ingredients.length} ingredientes
          </div>
        ) : null}
        {stepCount > 0 ? (
          <div className="cooking-execution-chip">
            <span className="cooking-execution-chip-icon" aria-hidden="true">📋</span>
            {stepCount} pasos
          </div>
        ) : null}
        {estimatedSec ? (
          <div className="cooking-execution-chip">
            <span className="cooking-execution-chip-icon" aria-hidden="true">⏱</span>
            ~{formatDuration(estimatedSec)}
          </div>
        ) : null}
      </div>
      <div className="recipe-modal-execute-wrap">
        <button
          type="button"
          className="cooking-cta recipe-modal-execute-btn"
          onClick={handleExecuteRecipe}
        >
          <span aria-hidden="true">🍳</span>
          Ejecutar receta
        </button>
      </div>
    </div>
  ) : null;

  const closeButton = (
    <button
      type="button"
      className="kitchen-icon-button"
      onClick={onClose}
      aria-label="Cerrar"
    >
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path
          d="M6 6l12 12M18 6l-12 12"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
        />
      </svg>
    </button>
  );

  return (
    <div
      className="kitchen-modal-backdrop"
      role="presentation"
      onClick={onClose}
    >
      <div
        className="kitchen-modal recipe-modal"
        role="dialog"
        aria-modal="true"
        aria-label={`Detalle de ${dish.name || "plato"}`}
        onClick={(e) => e.stopPropagation()}
      >
        {hasElaboration ? (
          <>
            <div className="kitchen-modal-header">
              <div>
                <h3>{dish.name || "Receta"}</h3>
                <p className="kitchen-muted">Elaboración del plato</p>
              </div>
              {closeButton}
            </div>
            <div style={{ padding: "0 2px" }}>
              <RecipeEditor
                recipeIngredients={ingredients}
                recipeSteps={steps}
                recipeServings={recipe.servings ?? null}
                recipeBaseServings={baseServings}
                targetServings={selectedServings}
                onTargetServingsChange={setSelectedServings}
                actionAfterIngredients={executeAction}
                readOnly
              />
            </div>
          </>
        ) : (
          <>
            <div className="kitchen-modal-header">
              <div>
                <h3>{dish.name || "Plato"}</h3>
              </div>
              {closeButton}
            </div>
            <div className="recipe-modal-no-recipe">
              {ingredients.length > 0 ? (
                <div className="recipe-modal-ingredients-only">
                  <h4 className="recipe-modal-section-label">Ingredientes</h4>
                  <ul className="recipe-modal-ingredients-list">
                    {ingredients.map((ing, idx) => (
                      <li key={idx} className="recipe-modal-ingredient-row">
                        {ing.quantity ? (
                          <span className="recipe-modal-ingredient-qty">{displayIngredientQuantity(ing, 1, 1)}</span>
                        ) : null}
                        <span>{ing.name}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}
              <div className="recipe-modal-notice" role="status">
                <svg viewBox="0 0 20 20" width="16" height="16" fill="none" aria-hidden="true" style={{ flexShrink: 0, color: "#d97706" }}>
                  <path d="M10 3L2 17h16L10 3z" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" />
                  <path d="M10 9v3.5M10 14.5v.5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
                </svg>
                <span>Este plato todavía no tiene elaboración guardada.</span>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
