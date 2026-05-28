import React, { useState } from "react";
import RecipeEditor from "./RecipeEditor.jsx";
import RecipeExecutionModal from "./cooking/RecipeExecutionModal.jsx";

export default function RecipeModal({ dish, targetServings = null, onClose }) {
  const [showExecution, setShowExecution] = useState(false);

  if (!dish) return null;

  const recipe = dish.recipe || {};
  const ingredients = recipe.ingredients || [];
  const steps = recipe.steps || null;
  const hasContent = ingredients.length > 0 || steps;
  const initialServings = targetServings ?? recipe.servings ?? 4;

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
        aria-label={`Elaboración de ${dish.name || "plato"}`}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="kitchen-modal-header">
          <div>
            <h3>{dish.name || "Receta"}</h3>
            <p className="kitchen-muted">Elaboración del plato</p>
          </div>
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
        </div>

        <div style={{ padding: "0 2px" }}>
          {hasContent ? (
            <RecipeEditor
              recipeIngredients={ingredients}
              recipeSteps={steps}
              recipeServings={recipe.servings ?? null}
              targetServings={targetServings}
              readOnly={true}
            />
          ) : (
            <p className="kitchen-muted">Este plato aún no tiene elaboración.</p>
          )}
        </div>

        {hasContent ? (
          <div className="recipe-modal-execute-wrap">
            <button
              type="button"
              className="cooking-cta recipe-modal-execute-btn"
              onClick={() => setShowExecution(true)}
            >
              🍳 Ejecutar receta
            </button>
          </div>
        ) : null}
      </div>

      {showExecution ? (
        <RecipeExecutionModal
          dish={dish}
          initialServings={initialServings}
          onClose={() => setShowExecution(false)}
          onStart={onClose}
        />
      ) : null}
    </div>
  );
}
