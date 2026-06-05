import React, { useMemo } from "react";
import { displayIngredientQuantity, scaleRecipeIngredients } from "../utils/recipeScaling.js";

export default function RecipeIngredientsList({
  ingredients = [],
  baseServings,
  targetServings,
  tableClassName = "recipe-ingredients-table",
  rowClassName = "",
  nameClassName = "",
  quantityClassName = "",
  as = "table",
}) {
  const scaledIngredients = useMemo(
    () => scaleRecipeIngredients({ ingredients, baseServings, targetServings }),
    [ingredients, baseServings, targetServings]
  );

  const isScaled = Boolean(baseServings && targetServings && Number(baseServings) !== Number(targetServings));

  if (as === "list") {
    return (
      <ul className={tableClassName}>
        {scaledIngredients.map((item, idx) => (
          <li key={idx} className={rowClassName}>
            <span className={nameClassName}>{item.name}</span>
            <span className={quantityClassName}>{item.displayQuantity}</span>
          </li>
        ))}
      </ul>
    );
  }

  return (
    <table className={tableClassName}>
      <tbody>
        {scaledIngredients.map((item, idx) => {
          const originalQty = typeof item.quantity === "string"
            ? item.quantity
            : displayIngredientQuantity(item, baseServings, baseServings);
          const wasScaled = isScaled && item.displayQuantity && item.displayQuantity !== originalQty;
          return (
            <tr key={idx} className={rowClassName}>
              <td className={nameClassName}>{item.name}</td>
              <td className={[quantityClassName, wasScaled ? "recipe-qty-scaled" : ""].filter(Boolean).join(" ")}>
                {item.displayQuantity}
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}
