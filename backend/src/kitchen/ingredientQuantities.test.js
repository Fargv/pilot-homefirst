import test from "node:test";
import assert from "node:assert/strict";
import mongoose from "mongoose";
import {
  consolidateDayIngredients,
  getIngredientIdentityKey
} from "./utils/ingredientQuantities.js";

function dish({ ingredientId, name = "Tomate", amount, unit, servings = 1 } = {}) {
  return {
    ingredients: [{ ingredientId, displayName: name, canonicalName: name.toLowerCase() }],
    recipe: {
      servings,
      ingredients: [{
        ingredientId,
        name,
        quantity: amount === undefined ? undefined : { amount, unit, scalable: true }
      }]
    }
  };
}

function aggregate(mainDish, sideDish, day = { servings: 1 }) {
  return consolidateDayIngredients({ mainDish, sideDish, day });
}

test("suma 0,25 + 0,50 unidades sin redondear", () => {
  const id = new mongoose.Types.ObjectId();
  const items = aggregate(
    dish({ ingredientId: id, amount: 0.25, unit: "unidades" }),
    dish({ ingredientId: new mongoose.Types.ObjectId(String(id)), amount: 0.5, unit: "unidad" })
  );

  assert.equal(items.length, 1);
  assert.equal(items[0].quantity.amount, 0.75);
  assert.equal(items[0].unit, "unidad");
});

test("suma 1 + 1 unidades y mantiene occurrences como metadato", () => {
  const id = new mongoose.Types.ObjectId();
  const items = aggregate(
    dish({ ingredientId: id, amount: 1, unit: "unidad" }),
    dish({ ingredientId: new mongoose.Types.ObjectId(String(id)), amount: 1, unit: "unidades" })
  );

  assert.equal(items[0].quantity.amount, 2);
  assert.equal(items[0].occurrences, 2);
});

test("suma 100 g + 150 g = 250 g", () => {
  const id = new mongoose.Types.ObjectId();
  const items = aggregate(
    dish({ ingredientId: id, name: "Cebolla", amount: 100, unit: "g" }),
    dish({ ingredientId: new mongoose.Types.ObjectId(String(id)), name: "Cebolla", amount: 150, unit: "g" })
  );

  assert.deepEqual(items.map(({ quantity, unit }) => ({ amount: quantity.amount, unit })), [{ amount: 250, unit: "g" }]);
});

test("convierte sólo masa compatible: 500 g + 0,5 kg = 1000 g", () => {
  const id = new mongoose.Types.ObjectId();
  const items = aggregate(
    dish({ ingredientId: id, name: "Harina", amount: 500, unit: "g" }),
    dish({ ingredientId: new mongoose.Types.ObjectId(String(id)), name: "Harina", amount: 0.5, unit: "kg" })
  );

  assert.equal(items.length, 1);
  assert.equal(items[0].quantity.amount, 1000);
  assert.equal(items[0].unit, "g");
});

test("escala por comensales usando recipe.servings como base compatible", () => {
  const id = new mongoose.Types.ObjectId();
  const items = aggregate(
    dish({ ingredientId: id, name: "Arroz", amount: 100, unit: "g", servings: 4 }),
    null,
    { servings: 6 }
  );

  assert.equal(items[0].quantity.amount, 150);
});

test("conserva ingredientes sin cantidad y su presencia", () => {
  const id = new mongoose.Types.ObjectId();
  const items = aggregate(
    dish({ ingredientId: id, name: "Sal" }),
    dish({ ingredientId: new mongoose.Types.ObjectId(String(id)), name: "Sal" })
  );

  assert.equal(items.length, 1);
  assert.equal(items[0].quantity, null);
  assert.equal(items[0].unit, null);
  assert.equal(items[0].occurrences, 2);
});

test("no fusiona unidades incompatibles", () => {
  const id = new mongoose.Types.ObjectId();
  const items = aggregate(
    dish({ ingredientId: id, name: "Cebolla", amount: 100, unit: "g" }),
    dish({ ingredientId: new mongoose.Types.ObjectId(String(id)), name: "Cebolla", amount: 1, unit: "unidad" })
  );

  assert.equal(items.length, 2);
  assert.deepEqual(items.map((item) => item.unit).sort(), ["g", "unidad"]);
});

test("usa identidad por valor de ObjectId, no por referencia", () => {
  const id = new mongoose.Types.ObjectId();
  assert.equal(
    getIngredientIdentityKey({ ingredientId: id }),
    getIngredientIdentityKey({ ingredientId: new mongoose.Types.ObjectId(String(id)) })
  );
});

test("respeta exclusiones de base y conserva overrides", () => {
  const tomatoId = new mongoose.Types.ObjectId();
  const onionId = new mongoose.Types.ObjectId();
  const items = consolidateDayIngredients({
    mainDish: dish({ ingredientId: tomatoId, name: "Tomate", amount: 2, unit: "unidad" }),
    day: { servings: 1 },
    baseExclusions: [String(tomatoId)],
    overrides: [{ ingredientId: onionId, displayName: "Cebolla", canonicalName: "cebolla" }]
  });

  assert.deepEqual(items.map((item) => item.canonicalName), ["cebolla"]);
  assert.equal(items[0].quantity, null);
});
