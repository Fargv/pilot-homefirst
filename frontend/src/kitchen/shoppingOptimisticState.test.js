import assert from "node:assert/strict";
import test from "node:test";
import {
  applyOptimisticShoppingStatusChange,
  reconcileShoppingPayloadWithPendingMutations
} from "./shoppingOptimisticState.js";

const tomato = {
  itemId: "item-1",
  ingredientId: "ing-1",
  categoryId: "cat-veg",
  canonicalName: "tomate",
  displayName: "Tomate",
  occurrences: 2
};

const vegetableGroup = {
  categoryId: "cat-veg",
  categoryInfo: {
    name: "Verduras",
    slug: "verduras",
    colorBg: "#ecfdf5",
    colorText: "#047857",
    order: 1
  },
  items: [tomato]
};

test("marking a pending item purchased removes it from pending immediately", () => {
  const state = {
    pendingByCategory: [vegetableGroup],
    purchasedByStoreDay: []
  };

  const next = applyOptimisticShoppingStatusChange(state, {
    item: tomato,
    status: "purchased",
    storeId: "store-1",
    storeName: "Mercado",
    purchasedAt: "2026-06-27T10:00:00.000Z"
  });

  assert.equal(next.pendingByCategory.length, 0);
  assert.equal(next.purchasedByStoreDay.length, 1);
  assert.equal(next.purchasedByStoreDay[0].purchasedDate, "2026-06-27");
  assert.equal(next.purchasedByStoreDay[0].items[0].displayName, "Tomate");
});

test("stale payloads cannot resurrect an item while its mutation is pending", () => {
  const stalePayload = {
    pendingByCategory: [vegetableGroup],
    purchasedByStoreDay: []
  };
  const pendingMutations = new Map([
    ["item-1", {
      item: tomato,
      status: "purchased",
      storeId: null,
      purchasedAt: "2026-06-27T10:00:00.000Z"
    }]
  ]);

  const next = reconcileShoppingPayloadWithPendingMutations(stalePayload, pendingMutations);

  assert.equal(next.pendingByCategory.length, 0);
  assert.equal(next.purchasedByStoreDay.length, 1);
  assert.equal(next.purchasedByStoreDay[0].items.length, 1);
});

test("unchecking a purchased item moves it back without duplicating rows", () => {
  const purchasedItem = {
    ...tomato,
    status: "purchased",
    purchasedAt: "2026-06-27T10:00:00.000Z",
    storeId: null
  };
  const state = {
    pendingByCategory: [],
    purchasedByStoreDay: [{
      storeId: null,
      storeName: "Supermercado no definido",
      purchasedDate: "2026-06-27",
      startedAt: "2026-06-27T10:00:00.000Z",
      purchasedByName: "Usuario",
      items: [purchasedItem]
    }]
  };

  const next = applyOptimisticShoppingStatusChange(state, {
    item: purchasedItem,
    status: "pending",
    fallbackCategoryInfo: vegetableGroup.categoryInfo
  });

  assert.equal(next.purchasedByStoreDay.length, 0);
  assert.equal(next.pendingByCategory.length, 1);
  assert.equal(next.pendingByCategory[0].items.length, 1);
  assert.equal(next.pendingByCategory[0].items[0].status, "pending");
});
