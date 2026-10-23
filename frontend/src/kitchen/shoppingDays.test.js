import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { applyOptimisticShoppingStatusChange } from "./shoppingOptimisticState.js";
import { filterShoppingGroups, filterShoppingItems, getDayCoverage, getShoppingDaysWithDishes, getShoppingRecipeReferences, getVisiblePendingGroups, getWeekDayDates, hasReliableShoppingDays, isManualShoppingItem, SHOPPING_DAYS, toggleShoppingDay } from "./shoppingDays.js";

const week = "2026-10-19";
const shared = { displayName: "Tomate", source: "plan", status: "purchased", sources: [{ day: "2026-10-19", quantity: 2, unit: "ud" }, { day: "2026-10-21", quantity: 3, unit: "ud" }] };

test("días ISO de lunes a domingo sin desplazamiento de zona horaria", () => {
  assert.deepEqual(getWeekDayDates(week), ["2026-10-19", "2026-10-20", "2026-10-21", "2026-10-22", "2026-10-23", "2026-10-24", "2026-10-25"]);
});

test("fechas de fuente UX-001A y clave day seleccionan el día local de forma estable", () => {
  const item = { source: "plan", sources: [{ date: new Date("2026-10-19T00:00:00.000Z"), day: "2026-10-19", mealType: "lunch", role: "principal", dishId: "d1", dishName: "Guiso", quantity: { amount: 120, unit: "g" } }] };
  assert.equal(hasReliableShoppingDays(item), true);
  assert.equal(filterShoppingGroups([{ items: [item] }], new Set(["monday"]), week)[0].items[0], item);
  assert.equal(SHOPPING_DAYS.length, 7);
});

test("el filtro permite un solo día y pulsar el mismo día vuelve a toda la semana", () => {
  let selectedDay = "";
  selectedDay = toggleShoppingDay(selectedDay, "monday");
  assert.equal(selectedDay, "monday");
  selectedDay = toggleShoppingDay(selectedDay, "wednesday");
  assert.equal(selectedDay, "wednesday");
  selectedDay = toggleShoppingDay(selectedDay, "wednesday");
  assert.equal(selectedDay, "");
});

test("solo muestra días de la semana con platos; manuales y legacy no crean días", () => {
  const items = [
    { source: "plan", sources: [{ day: "2026-10-21", dishName: "Sopa" }] },
    { source: "plan", sources: [{ day: "2026-10-21", dishName: "Sopa" }] },
    { source: "plan", sources: [{ day: "2026-10-20" }] },
    { source: "manual", sources: [{ day: "2026-10-20", dishName: "No es receta" }] },
    { source: "plan", fromDishes: ["legacy"], sources: [] }
  ];
  assert.deepEqual(getShoppingDaysWithDishes(items, week), [SHOPPING_DAYS[2]]);
  assert.deepEqual(getShoppingDaysWithDishes([], week), []);
});

test("las referencias de receta se deduplican por plato y día y omiten manuales y legacy", () => {
  const item = { source: "plan", sources: [
    { dishId: "soup", dishName: "Sopa", day: "2026-10-21", quantity: { amount: 2, unit: "ud" }, role: "principal", mealType: "dinner" },
    { dishId: "soup", dishName: "Sopa", day: "2026-10-21", quantity: { amount: 3, unit: "ud" }, role: "extra", mealType: "lunch" },
    { dishId: "soup", dishName: "Sopa", day: "2026-10-22" },
    { dishId: "pie", dishName: "Tarta", day: "2026-10-21" }
  ] };
  const original = structuredClone(item);
  assert.deepEqual(getShoppingRecipeReferences(item), [
    { key: "dish:soup|2026-10-21", dishName: "Sopa", date: "2026-10-21" },
    { key: "dish:soup|2026-10-22", dishName: "Sopa", date: "2026-10-22" },
    { key: "dish:pie|2026-10-21", dishName: "Tarta", date: "2026-10-21" }
  ]);
  assert.deepEqual(item, original, "abrir el resumen no modifica fuentes ni datos de compra");
  assert.deepEqual(getShoppingRecipeReferences({ source: "manual", sources: [{ day: "2026-10-21", dishName: "No inventar" }] }), []);
  assert.deepEqual(getShoppingRecipeReferences({ source: "plan", fromDishes: ["old"], sources: [] }), []);
});

test("keys de recetas distinguen IDs distintos con el mismo nombre y día", () => {
  const references = getShoppingRecipeReferences({ source: "plan", sources: [
    { dishId: "dish-101", dishName: "Sopa de verduras", day: "2026-10-21" },
    { dishId: "dish-202", dishName: "Sopa de verduras", day: "2026-10-21" },
    { dishName: "Sopa de verduras", day: "2026-10-21" }
  ] });
  assert.equal(references.length, 3);
  assert.deepEqual(references.map(({ key }) => key), [
    "dish:dish-101|2026-10-21",
    "dish:dish-202|2026-10-21",
    "name:sopa de verduras|2026-10-21"
  ]);
  assert.equal(new Set(references.map(({ key }) => key)).size, references.length);
});

test("un ingrediente compartido aparece en cualquiera de sus días sin duplicarse", () => {
  const groups = [{ categoryId: "veg", items: [shared] }];
  const result = filterShoppingGroups(groups, new Set(["monday", "wednesday"]), week);
  assert.equal(result.length, 1);
  assert.equal(result[0].items.length, 1);
  assert.equal(result[0].items[0].status, "purchased");
});

test("manuales se conservan en semana completa y legacy se identifica sin fechas fiables", () => {
  const manual = { source: "manual", sources: [] };
  const legacy = { source: "plan", fromDishes: ["old"], sources: [] };
  assert.equal(filterShoppingGroups([{ items: [manual, legacy] }], new Set(), week)[0].items.length, 2);
  assert.equal(hasReliableShoppingDays(legacy), false);
  assert.deepEqual(filterShoppingGroups([{ items: [manual, legacy, shared] }], new Set(["monday"]), week)[0].items, [shared]);
  assert.deepEqual(filterShoppingGroups([{ items: [manual, legacy] }], new Set(["monday"]), week), []);
  const visible = getVisiblePendingGroups([{ items: [manual, legacy, shared] }], new Set(["monday"]), week);
  assert.deepEqual(visible.map((group) => group._section), [undefined, "Añadidos manualmente", "Sin día asignado"]);
  assert.deepEqual(visible.map((group) => group.items), [[shared], [manual], [legacy]]);
});

test("legacy pendiente y comprado siguen visibles y etiquetables al filtrar días", () => {
  for (const status of ["pending", "purchased"]) {
    const legacy = { source: "plan", status, sources: [], displayName: "Ingrediente antiguo" };
    assert.equal(hasReliableShoppingDays(legacy), false);
    assert.deepEqual(filterShoppingItems([legacy], new Set(["monday"]), week), [legacy]);
  }
});

test("manual legacy sin source/fromDishes conserva identidad y estado, filtrado o semanal", () => {
  for (const status of ["pending", "purchased"]) {
    const manualLegacy = {
      itemId: `manual-${status}`,
      status,
      fromDishes: [],
      sources: [],
      occurrences: 3,
      quantity: 250,
      unit: "g",
      purchasedBy: status === "purchased" ? "user-1" : null
    };
    assert.equal(isManualShoppingItem(manualLegacy), true);

    const weekView = getVisiblePendingGroups([{ items: [manualLegacy] }], new Set(), week);
    assert.equal(weekView[0].items[0], manualLegacy);
    const filteredView = getVisiblePendingGroups([{ items: [manualLegacy] }], new Set(["monday"]), week);
    assert.equal(filteredView[0]._section, "Añadidos manualmente");
    assert.equal(filteredView[0].items[0], manualLegacy);

    assert.equal(filterShoppingItems([manualLegacy], new Set(), week)[0], manualLegacy);
    assert.equal(filterShoppingItems([manualLegacy], new Set(["monday"]), week)[0], manualLegacy);
    assert.deepEqual({ itemId: manualLegacy.itemId, status: manualLegacy.status, occurrences: manualLegacy.occurrences, quantity: manualLegacy.quantity, unit: manualLegacy.unit, purchasedBy: manualLegacy.purchasedBy }, {
      itemId: `manual-${status}`, status, occurrences: 3, quantity: 250, unit: "g", purchasedBy: status === "purchased" ? "user-1" : null
    });
  }
  const planLegacy = { itemId: "plan-legacy", source: "plan", fromDishes: ["dish-1"], sources: [], status: "purchased" };
  assert.equal(isManualShoppingItem(planLegacy), false);
  assert.equal(getVisiblePendingGroups([{ items: [planLegacy] }], new Set(["monday"]), week)[0]._section, "Sin día asignado");
  assert.equal(filterShoppingItems([planLegacy], new Set(["monday"]), week)[0], planLegacy);
});

test("cobertura usa un solo estado comprado global para cada ingrediente requerido ese día", () => {
  assert.deepEqual(getDayCoverage([shared], "monday", week), { purchased: 1, total: 1 });
  assert.deepEqual(getDayCoverage([{ ...shared, status: "pending" }], "wednesday", week), { purchased: 0, total: 1 });
  assert.deepEqual(getDayCoverage([{ ...shared, status: "pending" }], "monday", week), { purchased: 0, total: 1 });
  assert.deepEqual(getDayCoverage([], "sunday", week), { purchased: 0, total: 0 });
});

test("unidades incompatibles del mismo ingrediente y día cuentan como una cobertura", () => {
  const identityRows = [
    { source: "plan", canonicalName: "tomate", status: "purchased", sources: [{ day: "2026-10-19" }] },
    { source: "plan", canonicalName: "tomate", status: "pending", sources: [{ day: "2026-10-19" }] }
  ];
  assert.deepEqual(getDayCoverage(identityRows, "monday", week), { purchased: 0, total: 1 });
  assert.deepEqual(getDayCoverage(identityRows.map((item) => ({ ...item, status: "purchased" })), "monday", week), { purchased: 1, total: 1 });
});

test("comprar y descomprar conserva una sola fila compartida en multiselección", () => {
  const item = { ...shared, itemId: "tomato-1", categoryId: "veg" };
  const groups = [{ categoryId: "veg", items: [item] }];
  const selected = new Set(["monday", "wednesday"]);
  assert.equal(filterShoppingGroups(groups, selected, week).flatMap((group) => group.items).length, 1);
  const purchased = applyOptimisticShoppingStatusChange({ pendingByCategory: groups, purchasedByStoreDay: [] }, { item, status: "purchased", purchasedAt: "2026-10-19T12:00:00.000Z" });
  const purchasedItems = purchased.purchasedByStoreDay.flatMap((group) => group.items);
  assert.equal(purchasedItems.length, 1);
  assert.equal(filterShoppingItems(purchasedItems, selected, week).length, 1);
  assert.deepEqual(getDayCoverage(purchasedItems, "monday", week), { purchased: 1, total: 1 });
  const pending = applyOptimisticShoppingStatusChange(purchased, { item: purchasedItems[0], status: "pending" });
  const pendingItems = pending.pendingByCategory.flatMap((group) => group.items);
  assert.equal(pendingItems.length, 1);
  assert.equal(filterShoppingGroups(pending.pendingByCategory, selected, week)[0].items.length, 1);
  assert.deepEqual(getDayCoverage(pendingItems, "monday", week), { purchased: 0, total: 1 });
});

test("selección vacía representa toda la lista sin clonar ítems compartidos", () => {
  const groups = [{ items: [shared] }];
  assert.deepEqual(filterShoppingGroups(groups, new Set(), week), groups);
});

test("selector anuncia estados exclusivos y mantiene objetivos táctiles accesibles en móvil", () => {
  const component = readFileSync(new URL("./pages/ShoppingPage.jsx", import.meta.url), "utf8");
  const styles = readFileSync(new URL("./kitchen.css", import.meta.url), "utf8");
  assert.match(component, /aria-pressed=\{checked\}/);
  assert.match(component, /toggleShoppingDay\(current, day\.key\)/);
  assert.match(component, /shoppingDaysWithDishes\.map/);
  assert.match(component, /aria-pressed=\{!selectedDays\.size\}/);
  assert.match(component, /Sin día asignado/);
  assert.match(component, /Añadidos manualmente/);
  assert.match(component, /shopping-source-toggle/);
  assert.doesNotMatch(component, /¿Para qué\?|formatMealType\(|roleLabel|amountLabel/);
  assert.match(styles, /\.shopping-item-flat \.shopping-check \{ min-width: 44px; min-height: 44px;/);
  assert.match(styles, /\.shopping-day-options \{\s*display: flex;[\s\S]*overflow-x: auto;/);
});

test("referencias de compra usan abreviaturas españolas sin romper la fila principal", () => {
  const component = readFileSync(new URL("./pages/ShoppingPage.jsx", import.meta.url), "utf8");
  const styles = readFileSync(new URL("./kitchen.css", import.meta.url), "utf8");
  assert.match(component, /SHOPPING_DAY_INITIALS\s*=\s*\[\"L\",\s*\"M\",\s*\"X\",\s*\"J\",\s*\"V\",\s*\"S\",\s*\"D\"\]/);
  assert.match(component, /formatShoppingSourceDay\(source\)/);
  assert.match(component, /getShoppingRecipeReferences\(sources\)/);
  assert.match(component, /\{recipeReferences\.length\} recetas/);
  assert.match(component, /label: `\$\{recipe\.name\} ·/);
  assert.doesNotMatch(component, /roleLabel.*amountLabel/);
  assert.match(component, /shopping-source-details.*hidden=\{ingredientDetailOpenId !== key\}/s);
  assert.match(styles, /\.shopping-item-main\s*\{/);
  assert.match(styles, /\.shopping-source-details\s*\{[^}]*grid-column:\s*1\s*\/\s*-1/s);
});
