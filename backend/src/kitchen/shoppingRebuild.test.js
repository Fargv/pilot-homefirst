import test from "node:test";
import assert from "node:assert/strict";
import mongoose from "mongoose";
import {
  mergeRebuiltShoppingItems,
  mergeShoppingIngredientContribution
} from "./shoppingService.js";

function id() {
  return new mongoose.Types.ObjectId();
}

function builtItem(overrides = {}) {
  return {
    ingredientId: overrides.ingredientId || id(),
    displayName: overrides.displayName || "Tomate",
    canonicalName: overrides.canonicalName || "tomate",
    categoryId: overrides.categoryId || id(),
    quantity: overrides.quantity ?? null,
    unit: overrides.unit ?? null,
    occurrences: overrides.occurrences ?? 1,
    fromDishes: overrides.fromDishes ?? [id()]
  };
}

test("rebuild conserva manuales y todos sus metadatos", () => {
  const ingredientId = id();
  const manual = {
    itemId: id(),
    ingredientId,
    displayName: "Leche vegetal",
    canonicalName: "leche vegetal",
    quantity: null,
    unit: null,
    occurrences: 3,
    source: "manual",
    status: "purchased",
    purchasedBy: id(),
    purchasedAt: new Date("2026-10-23T09:00:00.000Z"),
    storeId: id(),
    purchaseSessionId: id(),
    fromDishes: []
  };

  const result = mergeRebuiltShoppingItems([builtItem()], [manual]);
  assert.equal(result.length, 2);
  assert.equal(result[1].itemId.toString(), manual.itemId.toString());
  assert.equal(result[1].occurrences, manual.occurrences);
  assert.equal(result[1].source, "manual");
  assert.equal(result[1].status, "purchased");
  assert.equal(result[1].purchasedBy.toString(), manual.purchasedBy.toString());
  assert.equal(result[1].purchaseSessionId.toString(), manual.purchaseSessionId.toString());
});

test("rebuild conserva manuales legacy sin source cuando no tienen platos", () => {
  const manual = {
    itemId: id(),
    ingredientId: id(),
    displayName: "Papel de horno",
    canonicalName: "papel de horno",
    quantity: null,
    unit: null,
    occurrences: 1,
    status: "pending",
    fromDishes: []
  };

  const result = mergeRebuiltShoppingItems([], [manual]);
  assert.equal(result.length, 1);
  assert.equal(result[0].displayName, "Papel de horno");
});

test("rebuild conserva categoría, estado comprado y metadatos en coincidencia exacta", () => {
  const ingredientId = id();
  const previous = {
    ...builtItem({ ingredientId, quantity: 100, unit: "g" }),
    itemId: id(),
    source: "plan",
    status: "purchased",
    purchasedBy: id(),
    purchasedAt: new Date("2026-10-23T10:00:00.000Z"),
    storeId: id(),
    purchaseSessionId: id()
  };
  const rebuilt = builtItem({ ingredientId: new mongoose.Types.ObjectId(String(ingredientId)), quantity: 250, unit: "g" });
  const result = mergeRebuiltShoppingItems([rebuilt], [previous]);

  assert.equal(result.length, 1);
  assert.equal(result[0].categoryId.toString(), rebuilt.categoryId.toString());
  assert.equal(result[0].status, "purchased");
  assert.equal(result[0].purchasedBy.toString(), previous.purchasedBy.toString());
  assert.equal(result[0].purchaseSessionId.toString(), previous.purchaseSessionId.toString());
});

test("no transfiere purchased entre unidades incompatibles", () => {
  const ingredientId = id();
  const previous = {
    ...builtItem({ ingredientId, quantity: 500, unit: "g" }),
    status: "purchased",
    purchasedBy: id(),
    purchasedAt: new Date(),
    fromDishes: [id()],
    source: "plan"
  };
  const rebuilt = builtItem({ ingredientId: new mongoose.Types.ObjectId(String(ingredientId)), quantity: 2, unit: "unidad" });
  const result = mergeRebuiltShoppingItems([rebuilt], [previous]);

  assert.equal(result[0].status, "pending");
  assert.equal(result[0].purchasedBy, null);
  assert.equal(result[0].purchasedAt, null);
});

test("legacy recipe sin cantidad conserva presencia al regenerar", () => {
  const result = mergeRebuiltShoppingItems([builtItem({ quantity: null, unit: null })], []);

  assert.equal(result.length, 1);
  assert.equal(result[0].quantity, null);
  assert.equal(result[0].unit, null);
  assert.equal(result[0].source, "plan");
});

test("varios días agregan cantidades, occurrences y fromDishes", () => {
  const ingredientId = id();
  const firstDishId = id();
  const secondDishId = id();
  const merged = new Map();
  mergeShoppingIngredientContribution(merged, {
    ...builtItem({ ingredientId, quantity: null, unit: "g" }),
    quantity: { amount: 100, unit: "g" }
  }, [firstDishId.toString()]);
  mergeShoppingIngredientContribution(
    merged,
    {
      ...builtItem({ ingredientId: new mongoose.Types.ObjectId(String(ingredientId)), quantity: null, unit: "g" }),
      quantity: { amount: 150, unit: "g" }
    },
    [secondDishId.toString()]
  );
  const result = mergeRebuiltShoppingItems(Array.from(merged.values()), []);

  assert.equal(result.length, 1);
  assert.equal(result[0].quantity, 250);
  assert.equal(result[0].occurrences, 2);
  assert.deepEqual(result[0].fromDishes.sort(), [firstDishId.toString(), secondDishId.toString()].sort());
});
