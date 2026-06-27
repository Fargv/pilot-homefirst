export function getShoppingItemKey(item = {}) {
  return item.itemId || `${item.ingredientId || "no-id"}-${item.canonicalName || ""}`;
}

function normalizePurchasedDate(value) {
  const date = value ? new Date(value) : new Date();
  if (Number.isNaN(date.getTime())) return new Date().toISOString().slice(0, 10);
  return date.toISOString().slice(0, 10);
}

function sameShoppingItem(left, rightKey) {
  return getShoppingItemKey(left) === rightKey;
}

function removeItemFromGroups(groups, itemKey) {
  if (!Array.isArray(groups)) return [];
  return groups
    .map((group) => ({
      ...group,
      items: (group.items || []).filter((entry) => !sameShoppingItem(entry, itemKey))
    }))
    .filter((group) => (group.items || []).length > 0);
}

function buildPendingCategoryInfo(item, fallbackCategoryInfo) {
  return {
    name: item.categoryInfo?.name || fallbackCategoryInfo?.name || "Sin categoria",
    slug: item.categoryInfo?.slug || fallbackCategoryInfo?.slug || "otros",
    colorBg: item.categoryInfo?.colorBg || fallbackCategoryInfo?.colorBg || "#f8fafc",
    colorText: item.categoryInfo?.colorText || fallbackCategoryInfo?.colorText || "#475569",
    order: Number.isFinite(item.categoryInfo?.order)
      ? item.categoryInfo.order
      : Number.isFinite(fallbackCategoryInfo?.order)
        ? fallbackCategoryInfo.order
        : null
  };
}

function addItemToPendingGroups(groups, item, fallbackCategoryInfo) {
  const categoryInfo = buildPendingCategoryInfo(item, fallbackCategoryInfo);
  const categoryKey = String(item.categoryId || categoryInfo.slug || categoryInfo.name || "otros");
  const nextItem = {
    ...item,
    status: "pending",
    purchasedBy: null,
    purchasedAt: null,
    purchasedByName: null,
    storeId: null,
    purchaseSessionId: null
  };
  const nextGroups = Array.isArray(groups) ? [...groups] : [];
  const groupIndex = nextGroups.findIndex((group) => {
    const key = String(group.categoryId || group.categoryInfo?.slug || group.categoryInfo?.name || "otros");
    return key === categoryKey;
  });

  if (groupIndex === -1) {
    return [
      ...nextGroups,
      {
        categoryId: item.categoryId || null,
        categoryInfo,
        items: [nextItem]
      }
    ];
  }

  const group = nextGroups[groupIndex];
  nextGroups[groupIndex] = {
    ...group,
    categoryInfo: group.categoryInfo || categoryInfo,
    items: [...(group.items || []), nextItem]
  };
  return nextGroups;
}

function addItemToPurchasedGroups(groups, item, options = {}) {
  const purchasedAt = options.purchasedAt || new Date().toISOString();
  const purchasedDate = normalizePurchasedDate(purchasedAt);
  const storeId = options.storeId || null;
  const storeName = options.storeName || (storeId ? "Supermercado no definido" : "Supermercado no definido");
  const nextItem = {
    ...item,
    status: "purchased",
    storeId,
    purchasedAt,
    purchasedByName: item.purchasedByName || options.purchasedByName || "Usuario"
  };
  const nextGroups = Array.isArray(groups) ? [...groups] : [];
  const groupIndex = nextGroups.findIndex((group) =>
    String(group.purchasedDate || "") === purchasedDate &&
    String(group.storeId || "") === String(storeId || "")
  );

  if (groupIndex === -1) {
    return [
      {
        storeId,
        storeName,
        purchasedDate,
        startedAt: purchasedAt,
        purchasedByName: nextItem.purchasedByName,
        purchaseSessionId: item.purchaseSessionId || null,
        sessionAmount: null,
        items: [nextItem]
      },
      ...nextGroups
    ];
  }

  const group = nextGroups[groupIndex];
  nextGroups[groupIndex] = {
    ...group,
    storeName: group.storeName || storeName,
    startedAt: group.startedAt || purchasedAt,
    purchasedByName: group.purchasedByName || nextItem.purchasedByName,
    items: [...(group.items || []), nextItem]
  };
  return nextGroups;
}

export function applyOptimisticShoppingStatusChange(state, mutation) {
  const item = mutation?.item;
  const status = mutation?.status === "purchased" ? "purchased" : "pending";
  if (!item) {
    return {
      pendingByCategory: Array.isArray(state?.pendingByCategory) ? state.pendingByCategory : [],
      purchasedByStoreDay: Array.isArray(state?.purchasedByStoreDay) ? state.purchasedByStoreDay : []
    };
  }

  const key = getShoppingItemKey(item);
  const pendingWithoutItem = removeItemFromGroups(state?.pendingByCategory, key);
  const purchasedWithoutItem = removeItemFromGroups(state?.purchasedByStoreDay, key);

  if (status === "purchased") {
    return {
      pendingByCategory: pendingWithoutItem,
      purchasedByStoreDay: addItemToPurchasedGroups(purchasedWithoutItem, item, mutation)
    };
  }

  return {
    pendingByCategory: addItemToPendingGroups(pendingWithoutItem, item, mutation.fallbackCategoryInfo),
    purchasedByStoreDay: purchasedWithoutItem
  };
}

export function reconcileShoppingPayloadWithPendingMutations(payload, pendingMutations) {
  const mutations = pendingMutations instanceof Map
    ? Array.from(pendingMutations.values())
    : Array.isArray(pendingMutations)
      ? pendingMutations
      : [];

  if (!mutations.length) return payload;

  return mutations.reduce((currentPayload, mutation) => {
    const nextGroups = applyOptimisticShoppingStatusChange(currentPayload, mutation);
    return {
      ...currentPayload,
      pendingByCategory: nextGroups.pendingByCategory,
      purchasedByStoreDay: nextGroups.purchasedByStoreDay
    };
  }, payload || {});
}
