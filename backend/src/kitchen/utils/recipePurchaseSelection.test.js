import test from "node:test";
import assert from "node:assert/strict";
import { applyRecipePurchaseSelection } from "./recipePurchaseSelection.js";

const recipe = (name, buy, ingredientId = null) => ({ name, buy, ingredientId });
const dish = (displayName, ingredientId = null) => ({ displayName, canonicalName: displayName.toLowerCase(), ingredientId });

test("modificar pasos sin selección explícita conserva la compra", () => {
  const purchase = [dish("Aceite"), dish("Sal")];
  assert.deepEqual(applyRecipePurchaseSelection(purchase, [recipe("Pollo")], false), purchase);
});

test("la selección explícita cambia sólo ingredientes de receta", () => {
  const result = applyRecipePurchaseSelection(
    [dish("Aceite"), dish("Pollo")],
    [recipe("Pollo", false), recipe("Arroz", true)],
    true
  );
  assert.deepEqual(result.map((item) => item.displayName), ["Aceite", "Arroz"]);
});

test("legacy sin buy conserva compras y no vacía la lista", () => {
  const purchase = [dish("Pollo"), dish("Sal")];
  assert.deepEqual(applyRecipePurchaseSelection(purchase, [recipe("Pollo")], false), purchase);
});

test("un override aplica su selección sin modificar el master", () => {
  const master = [dish("Pollo")];
  const override = [dish("Tofu")];
  const updated = applyRecipePurchaseSelection(override, [recipe("Tofu", false), recipe("Arroz", true)], true);
  assert.deepEqual(master.map((item) => item.displayName), ["Pollo"]);
  assert.deepEqual(updated.map((item) => item.displayName), ["Arroz"]);
});
