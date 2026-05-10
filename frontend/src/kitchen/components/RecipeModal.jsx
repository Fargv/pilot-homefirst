import React from "react";
import RecipeEditor from "./RecipeEditor.jsx";

export default function RecipeModal({ dish, onClose }) {
  if (!dish) return null;

  const recipe = dish.recipe || {};
  const ingredients = recipe.ingredients || [];
  const steps = recipe.steps || null;
  const hasContent = ingredients.length > 0 || steps;

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
        aria-label={`Receta de ${dish.name || "plato"}`}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="kitchen-modal-header">
          <div>
            <h3>{dish.name || "Receta"}</h3>
            <p className="kitchen-muted">Receta del plato</p>
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
              readOnly={true}
            />
          ) : (
            <p className="kitchen-muted">Este plato no tiene receta todavía.</p>
          )}
        </div>
      </div>
    </div>
  );
}
