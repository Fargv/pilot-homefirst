import express from "express";
import { Category } from "../models/Category.js";
import { Store } from "../models/Store.js";
import { KitchenUser } from "../models/KitchenUser.js";
import { requireAuth, requireDiod } from "../middleware.js";
import { formatDateISO, getWeekStart, parseISODate } from "../utils/dates.js";
import {
  buildScopedFilter,
  getEffectiveHouseholdId,
  handleHouseholdError
} from "../householdScope.js";
import { ensureShoppingList, rebuildShoppingList, repairShoppingListItems } from "../shoppingService.js";
import { CATALOG_SCOPES } from "../utils/catalogScopes.js";
import {
  DEFAULT_CATEGORY_COLOR_BG,
  DEFAULT_CATEGORY_COLOR_TEXT,
  DEFAULT_CATEGORY_NAME,
  DEFAULT_CATEGORY_SLUG,
  ensureDefaultCategory
} from "../utils/categoryMatching.js";

const router = express.Router();

function logShoppingError(context, error, extra = {}) {
  console.error(`[kitchen][shopping] ${context}`, {
    ...extra,
    message: error?.message,
    stack: error?.stack
  });
}


function normalizeStoreName(value = "") {
  return String(value).trim().toLowerCase();
}

function sortStores(stores = []) {
  return [...stores].sort((a, b) => {
    const orderA = Number.isFinite(a.order) ? a.order : Number.POSITIVE_INFINITY;
    const orderB = Number.isFinite(b.order) ? b.order : Number.POSITIVE_INFINITY;
    if (orderA !== orderB) return orderA - orderB;
    return String(a.name || "").localeCompare(String(b.name || ""), "es", { sensitivity: "base" });
  });
}

function buildStoreVisibilityFilter(effectiveHouseholdId, extraFilter = {}) {
  return {
    ...extraFilter,
    $or: [
      { scope: "master", householdId: null },
      { scope: "household", householdId: effectiveHouseholdId }
    ]
  };
}

function buildCategoryVisibilityFilter(effectiveHouseholdId, extraFilter = {}) {
  return {
    ...extraFilter,
    $or: [
      { scope: CATALOG_SCOPES.MASTER, householdId: null },
      { scope: CATALOG_SCOPES.HOUSEHOLD, householdId: effectiveHouseholdId },
      { scope: CATALOG_SCOPES.OVERRIDE, householdId: effectiveHouseholdId }
    ]
  };
}

function toDateGroup(value) {
  if (!value) return "sin-fecha";
  return new Date(value).toISOString().slice(0, 10);
}

function isValidObjectId(value) {
  return Boolean(value) && /^[a-f\d]{24}$/i.test(String(value));
}

function normalizeShoppingItemForResponse(item, purchaserById) {
  const normalized = item.toObject ? item.toObject() : { ...item };
  return {
    ...normalized,
    categoryId: normalized.categoryId || null,
    storeId: normalized.storeId || null,
    purchasedBy: normalized.purchasedBy || null,
    purchasedAt: normalized.purchasedAt || null,
    purchasedByName: normalized.purchasedBy && isValidObjectId(normalized.purchasedBy)
      ? purchaserById.get(String(normalized.purchasedBy)) || "Usuario"
      : null
  };
}

async function getShoppingPayload(weekStartDate, effectiveHouseholdId) {
  const list = await ensureShoppingList(weekStartDate, effectiveHouseholdId);

  const fallbackCategory = await ensureDefaultCategory({
    Category,
    householdId: effectiveHouseholdId
  });
  await repairShoppingListItems(list, effectiveHouseholdId, {
    fallbackCategory,
    context: "getShoppingPayload"
  });

  const categories = await Category.find(buildCategoryVisibilityFilter(effectiveHouseholdId, { isArchived: { $ne: true } })).select(
    "_id name slug colorBg colorText"
  );
  const stores = sortStores(
    await Store.find(buildStoreVisibilityFilter(effectiveHouseholdId, { active: true }))
      .select("_id name order scope householdId")
      .lean()
  );

  const storeById = new Map(stores.map((store) => [String(store._id), store.name]));
  const categoryById = new Map(categories.map((category) => [String(category._id), category]));
  const purchaserIds = Array.from(new Set(
    list.items
      .map((item) => item.purchasedBy)
      .filter((value) => isValidObjectId(value))
      .map((value) => String(value))
  ));
  const purchasers = purchaserIds.length
    ? await KitchenUser.find(buildScopedFilter(effectiveHouseholdId, { _id: { $in: purchaserIds } })).select("_id displayName")
    : [];
  const purchaserById = new Map(purchasers.map((person) => [String(person._id), person.displayName]));

  const pendingByCategory = list.items
    .filter((item) => item.status === "pending")
    .reduce((acc, item) => {
      const key = item.categoryId ? String(item.categoryId) : "uncategorized";
      const resolvedCategory = item.categoryId
        ? categoryById.get(String(item.categoryId)) || null
        : fallbackCategory || null;

      if (!acc.has(key)) {
        acc.set(key, {
          categoryId: resolvedCategory?._id || item.categoryId || null,
          categoryInfo: {
            name: resolvedCategory?.name || DEFAULT_CATEGORY_NAME,
            slug: resolvedCategory?.slug || DEFAULT_CATEGORY_SLUG,
            colorBg: resolvedCategory?.colorBg || DEFAULT_CATEGORY_COLOR_BG,
            colorText: resolvedCategory?.colorText || DEFAULT_CATEGORY_COLOR_TEXT
          },
          items: []
        });
      }
      acc.get(key).items.push(normalizeShoppingItemForResponse(item, purchaserById));
      return acc;
    }, new Map());

  const purchasedByStoreDay = list.items
    .filter((item) => item.status === "purchased")
    .reduce((acc, item) => {
      const dateKey = toDateGroup(item.purchasedAt);
      const storeKey = item.storeId ? String(item.storeId) : "no-store";
      const key = `${dateKey}::${storeKey}`;
      if (!acc.has(key)) {
        const purchasedByName = item.purchasedBy && isValidObjectId(item.purchasedBy)
          ? purchaserById.get(String(item.purchasedBy)) || "Usuario"
          : "Usuario";
        acc.set(key, {
          storeId: item.storeId || null,
          storeName: item.storeId ? storeById.get(String(item.storeId)) || "Supermercado no definido" : "Supermercado no definido",
          purchasedDate: dateKey,
          startedAt: item.purchasedAt,
          purchasedByName,
          items: []
        });
      }
      acc.get(key).items.push(normalizeShoppingItemForResponse(item, purchaserById));
      return acc;
    }, new Map());

  return {
    list,
    stores,
    pendingByCategory: Array.from(pendingByCategory.values()),
    purchasedByStoreDay: Array.from(purchasedByStoreDay.values()).sort(
      (a, b) => new Date(b.startedAt || 0).getTime() - new Date(a.startedAt || 0).getTime()
    )
  };
}

async function validateStoreSelection(storeId, effectiveHouseholdId) {
  if (!storeId) return null;
  const store = await Store.findOne(buildStoreVisibilityFilter(effectiveHouseholdId, { _id: storeId, active: true }))
    .select("_id")
    .lean();
  return store ? store._id : null;
}

router.get("/:weekStart", requireAuth, async (req, res) => {
  try {
    const weekStart = parseISODate(req.params.weekStart);
    if (!weekStart) return res.status(400).json({ ok: false, error: "Fecha inválida." });

    const effectiveHouseholdId = getEffectiveHouseholdId(req.user);
    const monday = getWeekStart(weekStart);
    const payload = await getShoppingPayload(monday, effectiveHouseholdId);

    res.json({ ok: true, weekStart: formatDateISO(monday), ...payload });
  } catch (error) {
    const handled = handleHouseholdError(res, error);
    if (handled) return handled;
    logShoppingError("get-list", error, { weekStart: req.params.weekStart, userId: String(req.kitchenUser?._id || "") });
    return res.status(500).json({ ok: false, error: "No se pudo cargar la lista de compra." });
  }
});

router.post("/:weekStart/rebuild", requireAuth, async (req, res) => {
  try {
    const weekStart = parseISODate(req.params.weekStart);
    if (!weekStart) return res.status(400).json({ ok: false, error: "Fecha inválida." });

    const effectiveHouseholdId = getEffectiveHouseholdId(req.user);
    const monday = getWeekStart(weekStart);
    await rebuildShoppingList(monday, effectiveHouseholdId);
    const payload = await getShoppingPayload(monday, effectiveHouseholdId);

    res.json({ ok: true, ...payload });
  } catch (error) {
    const handled = handleHouseholdError(res, error);
    if (handled) return handled;
    logShoppingError("rebuild", error, { weekStart: req.params.weekStart, userId: String(req.kitchenUser?._id || "") });
    if (error?.name === "ValidationError" || error?.name === "CastError") {
      return res.status(400).json({ ok: false, error: "Datos inválidos al reconstruir la lista." });
    }
    return res.status(500).json({ ok: false, error: "No se pudo reconstruir la lista de compra." });
  }
});

router.put("/:weekStart/item", requireAuth, async (req, res) => {
  try {
    const weekStart = parseISODate(req.params.weekStart);
    if (!weekStart) return res.status(400).json({ ok: false, error: "Fecha inválida." });

    const { canonicalName, status, ingredientId, storeId } = req.body;
    if (!canonicalName && !ingredientId) {
      return res.status(400).json({ ok: false, error: "Ingrediente inválido." });
    }

    const effectiveHouseholdId = getEffectiveHouseholdId(req.user);
    const monday = getWeekStart(weekStart);
    const list = await ensureShoppingList(monday, effectiveHouseholdId);
    await repairShoppingListItems(list, effectiveHouseholdId, {
      context: "update-item"
    });

    const item = list.items.find((current) => {
      if (ingredientId && current.ingredientId) return String(current.ingredientId) === String(ingredientId);
      return current.canonicalName === canonicalName;
    });

    if (!item) return res.status(404).json({ ok: false, error: "Ingrediente no encontrado en la lista." });

    const normalizedStatus = status === "purchased" ? "purchased" : "pending";
    item.status = normalizedStatus;
    if (normalizedStatus === "purchased") {
      const validatedStoreId = await validateStoreSelection(storeId, effectiveHouseholdId);
      item.purchasedBy = req.kitchenUser._id;
      item.purchasedAt = new Date();
      item.storeId = validatedStoreId;
    } else {
      item.purchasedBy = null;
      item.purchasedAt = null;
      item.storeId = null;
    }

    await list.save();
    const payload = await getShoppingPayload(monday, effectiveHouseholdId);
    res.json({ ok: true, ...payload });
  } catch (error) {
    const handled = handleHouseholdError(res, error);
    if (handled) return handled;
    return res.status(500).json({ ok: false, error: "No se pudo actualizar la lista de compra." });
  }
});

router.put("/:weekStart/item/store", requireAuth, async (req, res) => {
  try {
    const weekStart = parseISODate(req.params.weekStart);
    if (!weekStart) return res.status(400).json({ ok: false, error: "Fecha inválida." });

    const { canonicalName, ingredientId, storeId } = req.body;
    if (!canonicalName && !ingredientId) {
      return res.status(400).json({ ok: false, error: "Ingrediente inválido." });
    }

    const effectiveHouseholdId = getEffectiveHouseholdId(req.user);
    const monday = getWeekStart(weekStart);
    const list = await ensureShoppingList(monday, effectiveHouseholdId);
    await repairShoppingListItems(list, effectiveHouseholdId, {
      context: "update-item-store"
    });

    const item = list.items.find((current) => {
      if (ingredientId && current.ingredientId) return String(current.ingredientId) === String(ingredientId);
      return current.canonicalName === canonicalName;
    });

    if (!item || item.status !== "purchased") {
      return res.status(404).json({ ok: false, error: "Ingrediente comprado no encontrado." });
    }

    item.storeId = await validateStoreSelection(storeId, effectiveHouseholdId);
    await list.save();

    const payload = await getShoppingPayload(monday, effectiveHouseholdId);
    return res.json({ ok: true, ...payload });
  } catch (error) {
    const handled = handleHouseholdError(res, error);
    if (handled) return handled;
    return res.status(500).json({ ok: false, error: "No se pudo actualizar el supermercado." });
  }
});

router.post("/:weekStart/purchased/assign-store", requireAuth, async (req, res) => {
  try {
    const weekStart = parseISODate(req.params.weekStart);
    if (!weekStart) return res.status(400).json({ ok: false, error: "Fecha inválida." });

    const { storeId } = req.body;
    const effectiveHouseholdId = getEffectiveHouseholdId(req.user);
    const monday = getWeekStart(weekStart);
    const list = await ensureShoppingList(monday, effectiveHouseholdId);
    await repairShoppingListItems(list, effectiveHouseholdId, {
      context: "assign-store"
    });
    const validatedStoreId = await validateStoreSelection(storeId, effectiveHouseholdId);

    const today = new Date().toISOString().slice(0, 10);
    let changed = false;
    for (const item of list.items) {
      if (item.status !== "purchased" || item.storeId || !item.purchasedAt) continue;
      if (toDateGroup(item.purchasedAt) !== today) continue;
      item.storeId = validatedStoreId;
      changed = true;
    }

    if (changed) await list.save();

    const payload = await getShoppingPayload(monday, effectiveHouseholdId);
    return res.json({ ok: true, updated: changed, ...payload });
  } catch (error) {
    const handled = handleHouseholdError(res, error);
    if (handled) return handled;
    return res.status(500).json({ ok: false, error: "No se pudo asignar el supermercado." });
  }
});

router.post("/stores", requireAuth, async (req, res) => {
  try {
    const effectiveHouseholdId = getEffectiveHouseholdId(req.user);
    const name = String(req.body?.name || "").trim();
    if (!name) return res.status(400).json({ ok: false, error: "Debes indicar un nombre." });
    const canonicalName = normalizeStoreName(name);

    const store = await Store.findOneAndUpdate(
      { scope: "household", householdId: effectiveHouseholdId, canonicalName },
      { $setOnInsert: { scope: "household", householdId: effectiveHouseholdId, name, canonicalName } },
      { new: true, upsert: true }
    );

    return res.status(201).json({ ok: true, store });
  } catch (error) {
    const handled = handleHouseholdError(res, error);
    if (handled) return handled;
    return res.status(500).json({ ok: false, error: "No se pudo crear la tienda." });
  }
});

router.get("/stores/master", requireAuth, requireDiod, async (req, res) => {
  const stores = sortStores(
    await Store.find({ scope: "master", householdId: null }).select("_id name canonicalName active order scope")
  );
  return res.json({ ok: true, stores });
});

router.post("/stores/master", requireAuth, requireDiod, async (req, res) => {
  const name = String(req.body?.name || "").trim();
  if (!name) return res.status(400).json({ ok: false, error: "Debes indicar un nombre." });
  const canonicalName = normalizeStoreName(name);
  const requestedOrder = Number(req.body?.order);

  const store = await Store.findOneAndUpdate(
    { scope: "master", householdId: null, canonicalName },
    {
      $set: {
        name,
        canonicalName,
        active: req.body?.active !== false,
        order: Number.isFinite(requestedOrder) ? requestedOrder : null,
        scope: "master",
        householdId: null
      }
    },
    { new: true, upsert: true }
  );
  return res.status(201).json({ ok: true, store });
});

router.put("/stores/master/:storeId", requireAuth, requireDiod, async (req, res) => {
  const store = await Store.findOne({ _id: req.params.storeId, scope: "master", householdId: null });
  if (!store) return res.status(404).json({ ok: false, error: "Supermercado no encontrado." });

  if (req.body?.name !== undefined) {
    const name = String(req.body.name || "").trim();
    if (!name) return res.status(400).json({ ok: false, error: "Nombre inválido." });
    store.name = name;
    store.canonicalName = normalizeStoreName(name);
  }
  if (req.body?.active !== undefined) store.active = Boolean(req.body.active);
  if (req.body?.order !== undefined) {
    const requestedOrder = Number(req.body.order);
    store.order = Number.isFinite(requestedOrder) ? requestedOrder : null;
  }

  await store.save();
  return res.json({ ok: true, store });
});

router.delete("/stores/master/:storeId", requireAuth, requireDiod, async (req, res) => {
  const store = await Store.findOne({ _id: req.params.storeId, scope: "master", householdId: null });
  if (!store) return res.status(404).json({ ok: false, error: "Supermercado no encontrado." });
  store.active = false;
  await store.save();
  return res.json({ ok: true, store });
});

export default router;
