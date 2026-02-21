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
import { ensureShoppingList, rebuildShoppingList, resolveShoppingItemIngredientData } from "../shoppingService.js";
import {
  DEFAULT_CATEGORY_COLOR_BG,
  DEFAULT_CATEGORY_COLOR_TEXT,
  DEFAULT_CATEGORY_NAME,
  DEFAULT_CATEGORY_SLUG,
  ensureDefaultCategory
} from "../utils/categoryMatching.js";

const router = express.Router();

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

function toDateGroup(value) {
  if (!value) return "sin-fecha";
  return new Date(value).toISOString().slice(0, 10);
}

async function getShoppingPayload(weekStartDate, effectiveHouseholdId) {
  const list = await ensureShoppingList(weekStartDate, effectiveHouseholdId);

  const resolved = await resolveShoppingItemIngredientData(list.items.map((item) => item.toObject()), effectiveHouseholdId);
  if (resolved.changed) {
    list.items = resolved.resolvedItems;
    await list.save();
  }

  const fallbackCategory = await ensureDefaultCategory({
    Category,
    householdId: effectiveHouseholdId
  });

  const categories = await Category.find(buildScopedFilter(effectiveHouseholdId, {})).select(
    "_id name slug colorBg colorText"
  );
  const stores = sortStores(
    await Store.find(buildStoreVisibilityFilter(effectiveHouseholdId, { active: true }))
      .select("_id name order scope householdId")
      .lean()
  );

  const storeById = new Map(stores.map((store) => [String(store._id), store.name]));
  const categoryById = new Map(categories.map((category) => [String(category._id), category]));
  const purchaserIds = list.items
    .filter((item) => item.purchasedBy)
    .map((item) => String(item.purchasedBy));
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
      acc.get(key).items.push({
        ...item.toObject(),
        purchasedByName: item.purchasedBy ? purchaserById.get(String(item.purchasedBy)) || "Usuario" : null
      });
      return acc;
    }, new Map());

  const purchasedByStoreDay = list.items
    .filter((item) => item.status === "purchased")
    .reduce((acc, item) => {
      const dateKey = toDateGroup(item.purchasedAt);
      const storeKey = item.storeId ? String(item.storeId) : "no-store";
      const key = `${dateKey}::${storeKey}`;
      if (!acc.has(key)) {
        acc.set(key, {
          storeId: item.storeId || null,
          storeName: item.storeId ? storeById.get(String(item.storeId)) || "Supermercado" : "Sin supermercado",
          purchasedDate: dateKey,
          startedAt: item.purchasedAt,
          items: []
        });
      }
      acc.get(key).items.push({
        ...item.toObject(),
        purchasedByName: item.purchasedBy ? purchaserById.get(String(item.purchasedBy)) || "Usuario" : null
      });
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

    const item = list.items.find((current) => {
      if (ingredientId && current.ingredientId) return String(current.ingredientId) === String(ingredientId);
      return current.canonicalName === canonicalName;
    });

    if (!item) return res.status(404).json({ ok: false, error: "Ingrediente no encontrado en la lista." });

    const normalizedStatus = status === "purchased" ? "purchased" : "pending";
    item.status = normalizedStatus;
    if (normalizedStatus === "purchased") {
      item.purchasedBy = req.kitchenUser._id;
      item.purchasedAt = new Date();
      item.storeId = storeId || null;
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

    const item = list.items.find((current) => {
      if (ingredientId && current.ingredientId) return String(current.ingredientId) === String(ingredientId);
      return current.canonicalName === canonicalName;
    });

    if (!item || item.status !== "purchased") {
      return res.status(404).json({ ok: false, error: "Ingrediente comprado no encontrado." });
    }

    item.storeId = storeId || null;
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

    const today = new Date().toISOString().slice(0, 10);
    let changed = false;
    for (const item of list.items) {
      if (item.status !== "purchased" || item.storeId || !item.purchasedAt) continue;
      if (toDateGroup(item.purchasedAt) !== today) continue;
      item.storeId = storeId || null;
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
