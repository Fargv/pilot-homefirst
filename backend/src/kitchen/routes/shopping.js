import express from "express";
import { Category } from "../models/Category.js";
import { Store } from "../models/Store.js";
import { ShoppingTrip } from "../models/ShoppingTrip.js";
import { KitchenUser } from "../models/KitchenUser.js";
import { KitchenIngredient } from "../models/KitchenIngredient.js";
import { KitchenShoppingList } from "../models/KitchenShoppingList.js";
import { requireAuth, requireDiod } from "../middleware.js";
import { formatDateISO, getWeekStart, parseISODate } from "../utils/dates.js";
import {
  buildScopedFilter,
  getEffectiveHouseholdId,
  handleHouseholdError
} from "../householdScope.js";
import { ensureShoppingList, rebuildShoppingList } from "../shoppingService.js";
import {
  DEFAULT_CATEGORY_COLOR_BG,
  DEFAULT_CATEGORY_COLOR_TEXT,
  DEFAULT_CATEGORY_NAME,
  DEFAULT_CATEGORY_SLUG,
  ensureDefaultCategory
} from "../utils/categoryMatching.js";

const router = express.Router();
const AUTO_CLOSE_MS = 2 * 60 * 60 * 1000;

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

function normalizeAmount(value) {
  if (value === null || value === undefined || value === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

async function getActiveTrip(effectiveHouseholdId) {
  return ShoppingTrip.findOne(
    buildScopedFilter(effectiveHouseholdId, { closedAt: null })
  ).sort({ startedAt: -1 });
}

async function autoCloseExpiredTrip(effectiveHouseholdId) {
  const trip = await getActiveTrip(effectiveHouseholdId);
  if (!trip) return null;
  const isExpired = Date.now() - new Date(trip.startedAt).getTime() > AUTO_CLOSE_MS;
  if (!isExpired) return trip;
  trip.closedAt = new Date();
  await trip.save();
  return null;
}

async function ensureActiveTrip(effectiveHouseholdId, userId) {
  const current = await autoCloseExpiredTrip(effectiveHouseholdId);
  if (current) return current;
  return ShoppingTrip.create({
    householdId: effectiveHouseholdId,
    createdBy: userId,
    startedAt: new Date()
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

async function getShoppingPayload(weekStartDate, effectiveHouseholdId) {
  const list = await ensureShoppingList(weekStartDate, effectiveHouseholdId);

  const missingCategoryIngredientIds = list.items
    .filter((item) => !item.categoryId && item.ingredientId)
    .map((item) => item.ingredientId);

  if (missingCategoryIngredientIds.length) {
    const ingredientDocs = await KitchenIngredient.find(
      buildScopedFilter(effectiveHouseholdId, { _id: { $in: missingCategoryIngredientIds } })
    ).select("_id categoryId");
    const categoryByIngredientId = new Map(ingredientDocs.map((item) => [String(item._id), item.categoryId || null]));
    let changed = false;
    for (const item of list.items) {
      if (!item.categoryId && item.ingredientId) {
        const resolvedCategoryId = categoryByIngredientId.get(String(item.ingredientId)) || null;
        if (resolvedCategoryId) {
          item.categoryId = resolvedCategoryId;
          changed = true;
        }
      }
    }
    if (changed) {
      await list.save();
    }
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
  const activeTrip = await autoCloseExpiredTrip(effectiveHouseholdId);

  const purchasedTripIds = list.items
    .filter((item) => item.tripId)
    .map((item) => String(item.tripId));

  const trips = purchasedTripIds.length
    ? await ShoppingTrip.find(buildScopedFilter(effectiveHouseholdId, { _id: { $in: purchasedTripIds } }))
        .sort({ startedAt: -1 })
        .lean()
    : [];

  const storeById = new Map(stores.map((store) => [String(store._id), store.name]));
  const tripById = new Map(trips.map((trip) => [String(trip._id), trip]));

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

  const purchasedByTrip = list.items
    .filter((item) => item.status === "purchased")
    .reduce((acc, item) => {
      const key = item.tripId ? String(item.tripId) : "no-trip";
      if (!acc.has(key)) {
        const trip = item.tripId ? tripById.get(String(item.tripId)) : null;
        acc.set(key, {
          tripId: trip?._id || null,
          storeName: trip?.storeId ? storeById.get(String(trip.storeId)) || "Tienda" : "Sin tienda",
          totalAmount: trip?.totalAmount ?? null,
          startedAt: trip?.startedAt || item.purchasedAt,
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
    activeTrip,
    activeTripPurchasedCount: activeTrip
      ? list.items.filter((item) => item.status === "purchased" && item.tripId && String(item.tripId) === String(activeTrip._id)).length
      : 0,
    pendingByCategory: Array.from(pendingByCategory.values()),
    purchasedByTrip: Array.from(purchasedByTrip.values()).sort(
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

    const { canonicalName, status, ingredientId } = req.body;
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
      const activeTrip = await ensureActiveTrip(effectiveHouseholdId, req.kitchenUser._id);
      item.purchasedBy = req.kitchenUser._id;
      item.purchasedAt = new Date();
      item.tripId = activeTrip?._id || null;
    } else {
      item.purchasedBy = null;
      item.purchasedAt = null;
      item.tripId = null;
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

router.put("/trip/active", requireAuth, async (req, res) => {
  try {
    const effectiveHouseholdId = getEffectiveHouseholdId(req.user);
    const storeId = req.body?.storeId || null;
    const totalAmount = normalizeAmount(req.body?.totalAmount);

    let trip = await autoCloseExpiredTrip(effectiveHouseholdId);
    if (!trip && (storeId || totalAmount !== null)) {
      trip = await ShoppingTrip.create({
        householdId: effectiveHouseholdId,
        storeId,
        totalAmount,
        createdBy: req.kitchenUser._id,
        startedAt: new Date()
      });
    } else if (trip) {
      trip.storeId = storeId;
      trip.totalAmount = totalAmount;
      await trip.save();
    }

    return res.json({ ok: true, activeTrip: trip });
  } catch (error) {
    const handled = handleHouseholdError(res, error);
    if (handled) return handled;
    return res.status(500).json({ ok: false, error: "No se pudo actualizar la compra activa." });
  }
});

router.post("/trip/active/close", requireAuth, async (req, res) => {
  try {
    const effectiveHouseholdId = getEffectiveHouseholdId(req.user);
    const trip = await getActiveTrip(effectiveHouseholdId);
    if (!trip) return res.status(404).json({ ok: false, error: "No hay compra activa." });

    const openList = await KitchenShoppingList.findOne(
      buildScopedFilter(effectiveHouseholdId, { "items.tripId": trip._id, "items.status": "purchased" })
    );
    if (!openList) {
      return res.status(400).json({ ok: false, error: "Marca algún ítem para cerrar compra." });
    }

    trip.closedAt = new Date();
    await trip.save();

    return res.json({ ok: true, trip });
  } catch (error) {
    const handled = handleHouseholdError(res, error);
    if (handled) return handled;
    return res.status(500).json({ ok: false, error: "No se pudo cerrar la compra." });
  }
});

export default router;
