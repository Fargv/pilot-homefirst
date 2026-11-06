import test from "node:test";
import assert from "node:assert/strict";
import { applyRecipePurchaseToggles } from "./recipePurchaseSelection.js";

const recipe = (name, buy, ingredientId = null) => ({ name, buy, ingredientId });
const dish = (displayName, ingredientId = null) => ({ displayName, canonicalName: displayName.toLowerCase(), ingredientId });

test("modificar pasos sin selección explícita conserva la compra", () => {
  const purchase = [dish("Aceite"), dish("Sal")];
  assert.deepEqual(applyRecipePurchaseToggles(purchase, [recipe("Pollo")]), purchase);
});

test("buy persistido sin toggle no se interpreta como una nueva selección", () => {
  const purchase = [dish("Pollo"), dish("Aceite")];
  const recipeWithPersistedState = [recipe("Pollo", false)];
  assert.deepEqual(applyRecipePurchaseToggles(purchase, recipeWithPersistedState, []), purchase);
});

test("la selección explícita cambia sólo ingredientes de receta", () => {
  const result = applyRecipePurchaseToggles(
    [dish("Aceite"), dish("Pollo")],
    [recipe("Pollo", false), recipe("Arroz", true)],
    [recipe("Pollo", false), recipe("Arroz", true)]
  );
  assert.deepEqual(result.map((item) => item.displayName), ["Aceite", "Arroz"]);
});

test("un toggle explícito conserva compras ajenas a la receta", () => {
  const result = applyRecipePurchaseToggles(
    [dish("Pollo"), dish("Aceite")],
    [recipe("Pollo", false)],
    [recipe("Pollo", false)]
  );
  assert.deepEqual(result.map((item) => item.displayName), ["Aceite"]);
});

test("legacy sin buy conserva compras y no vacía la lista", () => {
  const purchase = [dish("Pollo"), dish("Sal")];
  assert.deepEqual(applyRecipePurchaseToggles(purchase, [recipe("Pollo")]), purchase);
});

test("un override aplica su selección sin modificar el master", () => {
  const master = [dish("Pollo")];
  const override = [dish("Tofu")];
  const updated = applyRecipePurchaseToggles(override, [recipe("Tofu", false), recipe("Arroz", true)], [recipe("Tofu", false), recipe("Arroz", true)]);
  assert.deepEqual(master.map((item) => item.displayName), ["Pollo"]);
  assert.deepEqual(updated.map((item) => item.displayName), ["Arroz"]);
});
