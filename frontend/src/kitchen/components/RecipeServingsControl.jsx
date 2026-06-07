import React from "react";

export default function RecipeServingsControl({ servings, baseServings, onChange }) {
  const isScaled = baseServings > 0 && servings !== baseServings;

  return (
    <div className="recipe-servings-ctrl">
      <div className="recipe-servings-ctrl-row">
        <button
          type="button"
          className="recipe-servings-ctrl-btn"
          onClick={() => onChange(Math.max(1, servings - 1))}
          disabled={servings <= 1}
          aria-label="Menos personas"
        >
          −
        </button>
        <span className="recipe-servings-ctrl-label">
          Para {servings} {servings === 1 ? "persona" : "personas"}
        </span>
        <button
          type="button"
          className="recipe-servings-ctrl-btn"
          onClick={() => onChange(Math.min(20, servings + 1))}
          disabled={servings >= 20}
          aria-label="Más personas"
        >
          +
        </button>
      </div>
      {isScaled ? (
        <p className="recipe-servings-ctrl-hint">
          Cantidades ajustadas · receta base para {baseServings}
        </p>
      ) : null}
    </div>
  );
}
