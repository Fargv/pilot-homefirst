import test from "node:test";
import assert from "node:assert/strict";
import {
  displayIngredientQuantity,
  getInitialServings,
  getRecipeBaseServings,
  scaleRecipeIngredients,
} from "./recipeScaling.js";

const smokeRecipe = {
  baseServings: 4,
  ingredients: [
    { name: "Calabacin", quantity: { amount: 4, unit: "unidades", note: "medianas", scalable: true } },
    { name: "Queso fresco", quantity: { amount: 150, unit: "g", scalable: true } },
    { name: "Caldo", quantity: { amount: 600, unit: "ml", scalable: true } },
    { name: "Aceite", quantity: { amount: 1, unit: "cucharada", scalable: true } },
    { name: "Sal y pimienta", quantity: { amount: null, unit: "al gusto", scalable: false } },
  ],
};

test("scales structured recipe ingredients from base servings to target servings", () => {
  const scaled = scaleRecipeIngredients({
    ingredients: smokeRecipe.ingredients,
    baseServings: smokeRecipe.baseServings,
    targetServings: 5,
  }).map((item) => item.displayQuantity);

  assert.deepEqual(scaled, [
    "5 unidades medianas",
    "190 g",
    "750 ml",
    "1.25 cucharadas",
    "al gusto",
  ]);
});

test("keeps non-scalable and unsafe legacy quantities unchanged", () => {
  assert.equal(
    displayIngredientQuantity({ name: "Sal", quantity: "al gusto" }, 4, 5),
    "al gusto"
  );
  assert.equal(
    displayIngredientQuantity({ name: "Hierbas", quantity: "un puñado generoso" }, 4, 5),
    "un puñado generoso"
  );
});

test("derives base and initial servings consistently", () => {
  assert.equal(getRecipeBaseServings(smokeRecipe), 4);
  assert.equal(getRecipeBaseServings({ recipe: { baseServings: 6, servings: 4 } }), 6);
  assert.equal(getInitialServings({ recipe: smokeRecipe, plannedMeal: { servings: 5 }, context: "week" }), 5);
  assert.equal(getInitialServings({ recipe: smokeRecipe, context: "catalog" }), 4);
});
