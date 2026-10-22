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

test("normaliza 1 kg + 500 g a 1500 g y conserva unidades originales en sources", () => {
  const id = new mongoose.Types.ObjectId();
  const items = aggregate(
    dish({ ingredientId: id, name: "Harina", amount: 1, unit: "kg" }),
    dish({ ingredientId: new mongoose.Types.ObjectId(String(id)), name: "Harina", amount: 500, unit: "g" })
  );

  assert.equal(items.length, 1);
  assert.equal(items[0].quantity.amount, 1500);
  assert.equal(items[0].unit, "g");
  assert.deepEqual(items[0].sources.map((source) => source.quantity), [
    { amount: 1, unit: "kg" },
    { amount: 500, unit: "g" }
  ]);
});

test("normaliza a unidad base independientemente del orden de las contribuciones", () => {
  const id = new mongoose.Types.ObjectId();
  const items = aggregate(
    dish({ ingredientId: id, name: "Harina", amount: 500, unit: "g" }),
    dish({ ingredientId: new mongoose.Types.ObjectId(String(id)), name: "Harina", amount: 1, unit: "kg" })
  );

  assert.equal(items[0].quantity.amount, 1500);
  assert.equal(items[0].unit, "g");
});

test("normaliza 1 l + 500 ml a 1500 ml", () => {
  const id = new mongoose.Types.ObjectId();
  const items = aggregate(
    dish({ ingredientId: id, name: "Caldo", amount: 1, unit: "l" }),
    dish({ ingredientId: new mongoose.Types.ObjectId(String(id)), name: "Caldo", amount: 500, unit: "ml" })
  );

  assert.equal(items.length, 1);
  assert.equal(items[0].quantity.amount, 1500);
  assert.equal(items[0].unit, "ml");
});

test("mantiene sumas en la misma unidad y las cantidades de unidades desconocidas", () => {
  const gramsId = new mongoose.Types.ObjectId();
  const grams = aggregate(
    dish({ ingredientId: gramsId, name: "Cebolla", amount: 100, unit: "g" }),
    dish({ ingredientId: new mongoose.Types.ObjectId(String(gramsId)), name: "Cebolla", amount: 150, unit: "g" })
  );
  assert.equal(grams[0].quantity.amount, 250);
  assert.equal(grams[0].unit, "g");

  const unknownId = new mongoose.Types.ObjectId();
  const unknown = aggregate(
    dish({ ingredientId: unknownId, name: "Especias", amount: 2, unit: "pizcas" }),
    dish({ ingredientId: new mongoose.Types.ObjectId(String(unknownId)), name: "Especias", amount: 3, unit: "pizcas" })
  );
  assert.equal(unknown.length, 1);
  assert.equal(unknown[0].quantity.amount, 5);
  assert.equal(unknown[0].unit, "pizcas");

  const incompatibleUnknown = aggregate(
    dish({ ingredientId: unknownId, name: "Especias", amount: 2, unit: "pizcas" }),
    dish({ ingredientId: new mongoose.Types.ObjectId(String(unknownId)), name: "Especias", amount: 1, unit: "cucharadas" })
  );
  assert.equal(incompatibleUnknown.length, 2);
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
