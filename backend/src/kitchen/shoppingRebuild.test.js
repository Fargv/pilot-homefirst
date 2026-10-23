import test from "node:test";
import assert from "node:assert/strict";
import mongoose from "mongoose";
import {
  mergeRebuiltShoppingItems,
  mergeShoppingIngredientContribution
} from "./shoppingService.js";
import { consolidateDayIngredients } from "./utils/ingredientQuantities.js";

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

test("rebuild conserva purchased al normalizar kg a g", () => {
  const ingredientId = id();
  const previous = {
    ...builtItem({ ingredientId, quantity: 1, unit: "kg" }),
    itemId: id(),
    source: "plan",
    status: "purchased",
    purchasedBy: id(),
    purchasedAt: new Date("2026-10-23T10:00:00.000Z")
  };
  const rebuilt = builtItem({ ingredientId: new mongoose.Types.ObjectId(String(ingredientId)), quantity: 1500, unit: "g" });

  const result = mergeRebuiltShoppingItems([rebuilt], [previous]);

  assert.equal(result.length, 1);
  assert.equal(result[0].unit, "g");
  assert.equal(result[0].status, "purchased");
  assert.equal(result[0].itemId.toString(), previous.itemId.toString());
  assert.equal(result[0].purchasedBy.toString(), previous.purchasedBy.toString());
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

test("varios días agregan cantidades, occurrences, fromDishes y fuentes diarias", () => {
  const ingredientId = id();
  const firstDishId = id();
  const secondDishId = id();
  const merged = new Map();
  mergeShoppingIngredientContribution(merged, {
    ...builtItem({ ingredientId, quantity: { amount: 100, unit: "g" }, unit: "g", fromDishes: [] }),
    sources: [{ day: "2026-10-19", date: "2026-10-19", mealType: "lunch", role: "principal", dishId: firstDishId.toString(), dishName: "Guiso", quantity: { amount: 100, unit: "g" } }]
  });
  mergeShoppingIngredientContribution(
    merged,
    {
      ...builtItem({ ingredientId: new mongoose.Types.ObjectId(String(ingredientId)), quantity: { amount: 150, unit: "g" }, unit: "g", fromDishes: [] }),
      sources: [{ day: "2026-10-20", date: "2026-10-20", mealType: "dinner", role: "principal", dishId: secondDishId.toString(), dishName: "Guiso", quantity: { amount: 150, unit: "g" } }]
    },
  );
  const result = mergeRebuiltShoppingItems(Array.from(merged.values()), []);

  assert.equal(result.length, 1);
  assert.equal(result[0].quantity, 250);
  assert.equal(result[0].occurrences, 2);
  assert.deepEqual(result[0].fromDishes.sort(), [firstDishId.toString(), secondDishId.toString()].sort());
  assert.deepEqual(result[0].sources, [
    { day: "2026-10-19", date: "2026-10-19", mealType: "lunch", role: "principal", dishId: firstDishId.toString(), dishName: "Guiso", quantity: { amount: 100, unit: "g" } },
    { day: "2026-10-20", date: "2026-10-20", mealType: "dinner", role: "principal", dishId: secondDishId.toString(), dishName: "Guiso", quantity: { amount: 150, unit: "g" } }
  ]);
});

test("manual comprado y plan pendiente con la misma identidad sobreviven separados", () => {
  const ingredientId = id();
  const manual = {
    ...builtItem({ ingredientId, quantity: 1, unit: "unidad" }),
    itemId: id(),
    fromDishes: [],
    source: "manual",
    status: "purchased",
    purchasedBy: id(),
    purchasedAt: new Date("2026-10-23T11:00:00.000Z"),
    storeId: id(),
    purchaseSessionId: id()
  };
  const plan = builtItem({ ingredientId: new mongoose.Types.ObjectId(String(ingredientId)), quantity: 2, unit: "unidad" });

  const result = mergeRebuiltShoppingItems([plan], [manual]);
  assert.equal(result.length, 2);
  assert.equal(result[0].source, "plan");
  assert.equal(result[0].status, "pending");
  assert.equal(result[0].purchasedBy, null);
  assert.equal(result[1].source, "manual");
  assert.equal(result[1].itemId.toString(), manual.itemId.toString());
  assert.equal(result[1].status, "purchased");
  assert.equal(result[1].purchasedBy.toString(), manual.purchasedBy.toString());
  assert.equal(result[1].purchaseSessionId.toString(), manual.purchaseSessionId.toString());
});

test("plan comprado y manual pendiente con la misma identidad no cruzan estado", () => {
  const ingredientId = id();
  const planPrevious = {
    ...builtItem({ ingredientId, quantity: 2, unit: "unidad" }),
    itemId: id(),
    source: "plan",
    status: "purchased",
    purchasedBy: id(),
    purchasedAt: new Date("2026-10-23T12:00:00.000Z"),
    storeId: id(),
    purchaseSessionId: id()
  };
  const manual = {
    ...builtItem({ ingredientId: new mongoose.Types.ObjectId(String(ingredientId)), quantity: 2, unit: "unidad" }),
    itemId: id(),
    source: "manual",
    fromDishes: [],
    status: "pending",
    purchasedBy: null,
    purchasedAt: null,
    storeId: null,
    purchaseSessionId: null
  };

  const result = mergeRebuiltShoppingItems([builtItem({ ingredientId, quantity: 2, unit: "unidad" })], [planPrevious, manual]);
  assert.equal(result.length, 2);
  assert.equal(result[0].source, "plan");
  assert.equal(result[0].itemId.toString(), planPrevious.itemId.toString());
  assert.equal(result[0].status, "purchased");
  assert.equal(result[0].purchasedBy.toString(), planPrevious.purchasedBy.toString());
  assert.equal(result[1].source, "manual");
  assert.equal(result[1].itemId.toString(), manual.itemId.toString());
  assert.equal(result[1].status, "pending");
  assert.equal(result[1].purchasedBy, null);
});

test("regeneraciones repetidas son idempotentes para itemId y purchased", () => {
  const ingredientId = id();
  const previousPlan = {
    ...builtItem({ ingredientId, quantity: 250, unit: "g" }),
    itemId: id(),
    source: "plan",
    status: "purchased",
    purchasedBy: id(),
    purchasedAt: new Date("2026-10-23T13:00:00.000Z"),
    storeId: id(),
    purchaseSessionId: id()
  };
  const manual = {
    ...builtItem({ ingredientId, quantity: 250, unit: "g" }),
    itemId: id(),
    source: "manual",
    fromDishes: [],
    status: "pending"
  };
  const built = [builtItem({ ingredientId, quantity: 500, unit: "g" })];

  const first = mergeRebuiltShoppingItems(built, [previousPlan, manual]);
  const second = mergeRebuiltShoppingItems(built, first);
  assert.equal(second.length, 2);
  assert.equal(second[0].itemId.toString(), previousPlan.itemId.toString());
  assert.equal(second[0].status, "purchased");
  assert.equal(second[0].purchasedBy.toString(), previousPlan.purchasedBy.toString());
  assert.equal(second[1].itemId.toString(), manual.itemId.toString());
  assert.equal(second[1].status, "pending");
});

test("sources conserva cada día, rol y cantidad de principales y acompañamientos repetidos", () => {
  const ingredientId = id();
  const dish = (name, amount) => ({
    _id: id(), name,
    ingredients: [{ ingredientId, name: "Tomate", canonicalName: "tomate" }],
    recipe: { ingredients: [{ ingredientId, name: "Tomate", quantity: { amount, unit: "g" } }] }
  });
  const main1 = dish("Guiso", 100);
  const side1 = dish("Ensalada", 50);
  const day1 = consolidateDayIngredients({
    mainDish: main1, sideDish: side1, day: { servings: 1 },
    sourceContext: { day: "2026-10-26", date: "2026-10-26", mealType: "lunch", mainDishId: main1._id, sideDishId: side1._id }
  });
  const main2 = dish("Guiso", 100);
  const day2 = consolidateDayIngredients({
    mainDish: main2, day: { servings: 1 }, includeSide: false,
    sourceContext: { day: "2026-10-28", date: "2026-10-28", mealType: "dinner", mainDishId: main2._id }
  });
  const merged = new Map();
  for (const ingredient of [...day1, ...day2]) mergeShoppingIngredientContribution(merged, ingredient);
  const item = mergeRebuiltShoppingItems(Array.from(merged.values()), [])[0];

  assert.equal(item.quantity, 250);
  assert.equal(item.unit, "g");
  assert.equal(item.sources.length, 3);
  assert.deepEqual(item.sources.map((source) => source.role), ["principal", "acompanamiento", "principal"]);
  assert.deepEqual(item.sources.map((source) => source.quantity.amount), [100, 50, 100]);
  assert.deepEqual(item.sources.map((source) => source.date), ["2026-10-26", "2026-10-26", "2026-10-28"]);
  assert.deepEqual(item.sources.map((source) => source.day), ["2026-10-26", "2026-10-26", "2026-10-28"]);
  assert.deepEqual(item.sources.map((source) => source.dishName), ["Guiso", "Ensalada", "Guiso"]);
  assert.deepEqual(item.sources.map((source) => source.mealType), ["lunch", "lunch", "dinner"]);
  assert.deepEqual(item.sources.map((source) => String(source.dishId)), [String(main1._id), String(side1._id), String(main2._id)]);
  assert.deepEqual(item.fromDishes.map(String), [String(main1._id), String(side1._id), String(main2._id)]);
});

test("override crea fuente extra sin inventar plato ni cantidad y conserva fromDishes reales", () => {
  const ingredientId = id();
  const mainDish = {
    _id: id(),
    name: "Guiso",
    ingredients: [{ ingredientId, name: "Tomate", canonicalName: "tomate" }],
    recipe: { ingredients: [{ ingredientId, name: "Tomate", quantity: { amount: 100, unit: "g" } }] }
  };
  const extraId = id();
  const contributions = consolidateDayIngredients({
    mainDish,
    day: { servings: 1 },
    includeSide: false,
    overrides: [{ ingredientId: extraId, name: "Ajo", canonicalName: "ajo", quantity: { amount: 2, unit: "dientes" } }],
    sourceContext: {
      day: "2026-10-26",
      date: "2026-10-26",
      mealType: "lunch",
      mainDishId: mainDish._id
    }
  });
  const merged = new Map();
  for (const ingredient of contributions) mergeShoppingIngredientContribution(merged, ingredient);
  const items = mergeRebuiltShoppingItems(Array.from(merged.values()), []);
  const tomato = items.find((item) => item.canonicalName === "tomate");
  const garlic = items.find((item) => item.canonicalName === "ajo");

  assert.deepEqual(tomato.fromDishes.map(String), [String(mainDish._id)]);
  assert.equal(tomato.sources[0].role, "principal");
  assert.equal(tomato.sources[0].dishId.toString(), mainDish._id.toString());
  assert.deepEqual(tomato.sources[0].quantity, { amount: 100, unit: "g" });
  assert.deepEqual(garlic.fromDishes, []);
  assert.equal(garlic.sources.length, 1);
  assert.equal(garlic.sources[0].role, "extra");
  assert.equal(garlic.sources[0].day, "2026-10-26");
  assert.equal(garlic.sources[0].mealType, "lunch");
  assert.equal(garlic.sources[0].dishId, null);
  assert.equal(garlic.sources[0].dishName, "Ingredientes añadidos");
  assert.equal(garlic.sources[0].quantity, null);
});

test("unidades incompatibles generan fuentes separadas sin sumar cantidades", () => {
  const ingredientId = id();
  const merged = new Map();
  for (const [amount, unit, date, dishId] of [[100, "g", "2026-10-26", id()], [1, "unidad", "2026-10-27", id()]]) {
    mergeShoppingIngredientContribution(merged, {
      ...builtItem({ ingredientId, quantity: null, unit: null }),
      quantity: amount,
      unit,
      sources: [{ date, mealType: "lunch", role: "principal", dishId: String(dishId), dishName: "Plato", quantity: { amount, unit } }]
    });
  }
  const result = mergeRebuiltShoppingItems(Array.from(merged.values()), []);
  assert.equal(result.length, 2);
  assert.deepEqual(result.map((item) => item.unit).sort(), ["g", "unidad"]);
  assert.deepEqual(result.map((item) => item.sources[0].quantity.amount), [100, 1]);
});
