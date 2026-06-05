import React, { useEffect, useState } from "react";
import RecipeEditor from "./RecipeEditor.jsx";
import RecipeExecutionModal from "./cooking/RecipeExecutionModal.jsx";
import { getInitialServings, getRecipeBaseServings } from "../utils/recipeScaling.js";

export default function RecipeModal({ dish, targetServings = null, onClose }) {
  const [showExecution, setShowExecution] = useState(false);
  const recipe = dish?.recipe || {};
  const baseServings = getRecipeBaseServings(recipe);
  const initialServings = targetServings ?? getInitialServings({ recipe, dish });
  const [selectedServings, setSelectedServings] = useState(initialServings);

  useEffect(() => {
    setSelectedServings(initialServings);
    setShowExecution(false);
  }, [dish?._id, initialServings]);

  if (!dish) return null;

  const recipeIngredients = Array.isArray(recipe.ingredients) ? recipe.ingredients : [];
  const fallbackIngredients = recipeIngredients.length
    ? []
    : (Array.isArray(dish.ingredients) ? dish.ingredients : []).map((item) => ({
        name: item.displayName || item.name || item.canonicalName || "",
        quantity: "",
        ingredientId: item.ingredientId || null,
      })).filter((item) => item.name);
  const ingredients = recipeIngredients.length ? recipeIngredients : fallbackIngredients;
  const steps = recipe.elaboration ?? recipe.steps ?? null;
  const hasRecipeContent = recipeIngredients.length > 0 || Boolean(steps);
  const hasContent = ingredients.length > 0 || Boolean(steps);

  const executeAction = hasRecipeContent ? (
    <div className="recipe-modal-execute-wrap">
      <button
        type="button"
        className="cooking-cta recipe-modal-execute-btn"
        onClick={() => setShowExecution(true)}
      >
        <span aria-hidden="true">🍳</span>
        Ejecutar receta
      </button>
    </div>
  ) : null;

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
        aria-label={`Elaboracion de ${dish.name || "plato"}`}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="kitchen-modal-header">
          <div>
            <h3>{dish.name || "Receta"}</h3>
            <p className="kitchen-muted">Elaboracion del plato</p>
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
            <>
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
              {!hasRecipeContent ? (
                <p className="kitchen-muted recipe-modal-missing-recipe">
                  Este plato todavia no tiene elaboracion guardada.
                </p>
              ) : null}
            </>
          ) : (
            <p className="kitchen-muted">Este plato todavia no tiene elaboracion guardada.</p>
          )}
        </div>
      </div>

      {showExecution ? (
        <RecipeExecutionModal
          dish={dish}
          initialServings={selectedServings}
          onClose={() => setShowExecution(false)}
          onStart={onClose}
        />
      ) : null}
    </div>
  );
}
