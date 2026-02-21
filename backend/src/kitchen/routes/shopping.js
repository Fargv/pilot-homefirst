import express from "express";
import { Category } from "../models/Category.js";
import { Store } from "../models/Store.js";
import { ShoppingTrip } from "../models/ShoppingTrip.js";
import { KitchenUser } from "../models/KitchenUser.js";
import { KitchenIngredient } from "../models/KitchenIngredient.js";
import { requireAuth } from "../middleware.js";
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
  const stores = await Store.find(buildScopedFilter(effectiveHouseholdId, { active: true }))
    .sort({ name: 1 })
    .select("_id name");
  const activeTrip = await getActiveTrip(effectiveHouseholdId);

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
      const activeTrip = await getActiveTrip(effectiveHouseholdId);
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
    const canonicalName = name.toLowerCase();

    const store = await Store.findOneAndUpdate(
      buildScopedFilter(effectiveHouseholdId, { canonicalName }),
      { $setOnInsert: { householdId: effectiveHouseholdId, name, canonicalName } },
      { new: true, upsert: true }
    );

    return res.status(201).json({ ok: true, store });
  } catch (error) {
    const handled = handleHouseholdError(res, error);
    if (handled) return handled;
    return res.status(500).json({ ok: false, error: "No se pudo crear la tienda." });
  }
});

router.put("/trip/active", requireAuth, async (req, res) => {
  try {
    const effectiveHouseholdId = getEffectiveHouseholdId(req.user);
    const storeId = req.body?.storeId || null;
    const totalAmount = normalizeAmount(req.body?.totalAmount);

    let trip = await getActiveTrip(effectiveHouseholdId);
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
