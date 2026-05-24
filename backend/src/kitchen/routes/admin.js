import express from "express";
import mongoose from "mongoose";
import { requireAuth, requireDiod } from "../middleware.js";
import { Household } from "../models/Household.js";
import { PurchaseAttempt } from "../models/PurchaseAttempt.js";
import { PackEntitlement } from "../models/PackEntitlement.js";
import { KitchenUser } from "../models/KitchenUser.js";
import { Invitation } from "../models/Invitation.js";
import { KitchenWeekPlan } from "../models/KitchenWeekPlan.js";
import { KitchenDish } from "../models/KitchenDish.js";
import { KitchenIngredient } from "../models/KitchenIngredient.js";
import { HouseholdCatalogPack } from "../models/HouseholdCatalogPack.js";
import { CatalogPack } from "../models/CatalogPack.js";
import { Category } from "../models/Category.js";
import { KitchenDishCategory } from "../models/KitchenDishCategory.js";
import { KitchenShoppingList } from "../models/KitchenShoppingList.js";
import { KitchenSwap } from "../models/KitchenSwap.js";
import { ShoppingTrip } from "../models/ShoppingTrip.js";
import { Store } from "../models/Store.js";
import { HouseholdOnboarding } from "../models/HouseholdOnboarding.js";
import { HouseholdWeeklyProgress } from "../models/HouseholdWeeklyProgress.js";
import { BitesTransaction } from "../models/BitesTransaction.js";
import { HiddenMaster } from "../models/HiddenMaster.js";
import {
  applyAdminSubscriptionActivation,
  applyAdminSubscriptionDeactivation,
  buildHouseholdSubscriptionResponse
} from "../subscriptionService.js";

const router = express.Router();

function normalizeActiveHouseholdIdInput(body = {}) {
  const hasActiveHouseholdId = Object.prototype.hasOwnProperty.call(body, "activeHouseholdId");
  const hasHouseholdId = Object.prototype.hasOwnProperty.call(body, "householdId");

  if (!hasActiveHouseholdId && !hasHouseholdId) return undefined;

  const rawHouseholdId = hasActiveHouseholdId ? body.activeHouseholdId : body.householdId;
  if (rawHouseholdId === null || rawHouseholdId === "") return null;
  if (typeof rawHouseholdId === "undefined") return undefined;
  return rawHouseholdId;
}

router.get("/households", requireAuth, requireDiod, async (req, res) => {
  try {
    const households = await Household.find(
      {},
      { name: 1, subscriptionPlan: 1, subscriptionStatus: 1, subscriptionEndsAt: 1, pendingDowngradeAt: 1, pendingDowngradeReason: 1, isPro: 1, planSource: 1, betaPro: 1, ownerUserId: 1, createdAt: 1, inviteCode: 1, freeBitesBalance: 1, purchasedBitesBalance: 1 }
    ).sort({ createdAt: 1 }).lean();

    const householdIds = households.map((h) => h._id);
    const memberCounts = await KitchenUser.aggregate([
      { $match: { householdId: { $in: householdIds }, type: { $ne: "placeholder" } } },
      { $group: { _id: "$householdId", count: { $sum: 1 } } }
    ]);
    const memberCountMap = Object.fromEntries(memberCounts.map((m) => [String(m._id), m.count]));

    return res.json({
      ok: true,
      households: households.map((household) => ({
        id: household._id,
        name: household.name,
        subscriptionPlan: household.subscriptionPlan || "basic",
        subscriptionStatus: household.subscriptionStatus || "inactive",
        subscriptionEndsAt: household.subscriptionEndsAt || null,
        pendingDowngradeAt: household.pendingDowngradeAt || null,
        pendingDowngradeReason: household.pendingDowngradeReason || "",
        isPro: Boolean(household.isPro),
        planSource: household.planSource || "manual",
        betaPro: household.betaPro
          ? {
            active: household.betaPro.active ?? false,
            unlockedAt: household.betaPro.unlockedAt ?? null,
            expiresAt: household.betaPro.expiresAt ?? null,
            expiredAt: household.betaPro.expiredAt ?? null,
            expirationReason: household.betaPro.expirationReason ?? ""
          }
          : null,
        memberCount: memberCountMap[String(household._id)] || 0,
        inviteCode: household.inviteCode || null,
        createdAt: household.createdAt || null,
        isActive: String(household._id) === String(req.kitchenUser.activeHouseholdId || ""),
        freeBitesBalance: household.freeBitesBalance ?? 0,
        purchasedBitesBalance: household.purchasedBitesBalance ?? 0
      })),
      activeHouseholdId: req.kitchenUser.activeHouseholdId || null
    });
  } catch (error) {
    return res.status(500).json({ ok: false, error: "No se pudieron cargar los hogares." });
  }
});

// Returns all catalog packs owned by a specific household (for admin pack management).
router.get("/households/:householdId/packs", requireAuth, requireDiod, async (req, res) => {
  try {
    const { householdId } = req.params;
    if (!mongoose.isValidObjectId(householdId)) {
      return res.status(400).json({ ok: false, error: "householdId inválido." });
    }

    const ownerships = await HouseholdCatalogPack.find({ householdId }).lean();
    if (ownerships.length === 0) return res.json({ ok: true, packs: [] });

    const packIds = ownerships.map((o) => o.packId);
    const catalogPacks = await CatalogPack.find(
      { _id: { $in: packIds } },
      { title: 1, slug: 1, priceBasic: 1 }
    ).lean();
    const packMap = Object.fromEntries(catalogPacks.map((p) => [String(p._id), p]));

    const result = ownerships.map((o) => {
      const cp = packMap[String(o.packId)] || {};
      const isPaid = ["purchase", "subscription"].includes(o.acquiredVia) || o.paymentStatus === "paid";
      const isInstalled = o.status === "installed";
      return {
        packId: String(o.packId),
        packTitle: cp.title || String(o.packId),
        packSlug: cp.slug || "",
        acquiredVia: o.acquiredVia || "unknown",
        isPaid,
        isInstalled,
        canRevoke: !(isPaid && isInstalled),
        acquiredAt: o.acquiredAt || null
      };
    });

    return res.json({ ok: true, packs: result });
  } catch (error) {
    return res.status(500).json({ ok: false, error: "No se pudieron cargar los packs del hogar." });
  }
});

router.post("/households", requireAuth, requireDiod, async (req, res) => {
  try {
    const name = String(req.body?.name || "").trim();
    if (!name) {
      return res.status(400).json({ ok: false, error: "El nombre del hogar es obligatorio." });
    }

    let ownerUserId = req.body?.ownerUserId ? String(req.body.ownerUserId).trim() : "";
    if (!ownerUserId && req.body?.ownerEmail) {
      const ownerByEmail = await KitchenUser.findOne({ email: String(req.body.ownerEmail).trim().toLowerCase() });
      ownerUserId = ownerByEmail?._id ? String(ownerByEmail._id) : "";
    }

    const household = await Household.create({
      name,
      ownerUserId: ownerUserId && mongoose.isValidObjectId(ownerUserId) ? ownerUserId : req.kitchenUser._id
    });

    return res.status(201).json({
      ok: true,
      household: { id: household._id, name: household.name, ownerUserId: household.ownerUserId }
    });
  } catch (error) {
    return res.status(500).json({ ok: false, error: "No se pudo crear el hogar." });
  }
});

router.put("/households/:id/owner", requireAuth, requireDiod, async (req, res) => {
  try {
    const householdId = String(req.params.id || "");
    const ownerUserId = String(req.body?.ownerUserId || "");
    if (!mongoose.isValidObjectId(householdId) || !mongoose.isValidObjectId(ownerUserId)) {
      return res.status(400).json({ ok: false, error: "Datos no válidos." });
    }

    const [household, ownerUser] = await Promise.all([
      Household.findById(householdId),
      KitchenUser.findById(ownerUserId)
    ]);
    if (!household) {
      return res.status(404).json({ ok: false, error: "No encontramos el hogar." });
    }
    if (!ownerUser) {
      return res.status(404).json({ ok: false, error: "No encontramos el usuario owner." });
    }

    household.ownerUserId = ownerUser._id;
    await household.save();
    return res.json({ ok: true, household: { id: household._id, ownerUserId: household.ownerUserId } });
  } catch (error) {
    return res.status(500).json({ ok: false, error: "No se pudo asignar el owner." });
  }
});

router.post("/subscription/activate", requireAuth, requireDiod, async (req, res) => {
  try {
    const householdId = String(req.body?.householdId || "");
    if (!mongoose.isValidObjectId(householdId)) {
      return res.status(400).json({ ok: false, error: "El householdId no es válido." });
    }

    const existing = await Household.findById(householdId).lean();
    if (!existing) {
      return res.status(404).json({ ok: false, error: "No encontramos el hogar." });
    }

    const draft = applyAdminSubscriptionActivation({ ...existing }, req.body?.plan);
    const update = {
      subscriptionPlan: draft.subscriptionPlan,
      subscriptionStatus: draft.subscriptionStatus,
      subscriptionRequestedPlan: draft.subscriptionRequestedPlan,
      trialEndsAt: draft.trialEndsAt,
      // Admin grants never expire via cron — no billing period to track
      subscriptionEndsAt: null,
      isPro: draft.isPro,
      assignedByAdmin: draft.assignedByAdmin,
      // Mark as admin-managed: clear Stripe subscription link and any pending downgrade
      stripeSubscriptionId: "",
      pendingDowngradeAt: null,
      pendingDowngradeReason: ""
    };
    await Household.updateOne({ _id: householdId }, { $set: update });

    return res.json({
      ok: true,
      household: {
        id: existing._id,
        name: existing.name,
        ...buildHouseholdSubscriptionResponse(draft)
      }
    });
  } catch (error) {
    if (error?.code === "SUBSCRIPTION_PLAN_INVALID") {
      return res.status(400).json({ ok: false, error: error.message });
    }
    console.error("[kitchen/admin] activate subscription failed", {
      userId: req.user?.id || null,
      body: req.body,
      error: error?.message,
      stack: error?.stack
    });
    return res.status(500).json({ ok: false, error: "No se pudo activar la suscripción." });
  }
});

router.post("/subscription/deactivate", requireAuth, requireDiod, async (req, res) => {
  try {
    const householdId = String(req.body?.householdId || "");
    if (!mongoose.isValidObjectId(householdId)) {
      return res.status(400).json({ ok: false, error: "El householdId no es válido." });
    }

    const existing = await Household.findById(householdId).lean();
    if (!existing) {
      return res.status(404).json({ ok: false, error: "No encontramos el hogar." });
    }

    const draft = applyAdminSubscriptionDeactivation({ ...existing });
    const update = {
      subscriptionPlan: draft.subscriptionPlan,
      subscriptionStatus: draft.subscriptionStatus,
      subscriptionRequestedPlan: draft.subscriptionRequestedPlan,
      trialEndsAt: draft.trialEndsAt,
      subscriptionEndsAt: draft.subscriptionEndsAt,
      isPro: draft.isPro,
      assignedByAdmin: draft.assignedByAdmin
    };
    await Household.updateOne({ _id: householdId }, { $set: update });

    return res.json({
      ok: true,
      household: {
        id: existing._id,
        name: existing.name,
        ...buildHouseholdSubscriptionResponse(draft)
      }
    });
  } catch (error) {
    console.error("[kitchen/admin] deactivate subscription failed", {
      userId: req.user?.id || null,
      body: req.body,
      error: error?.message,
      stack: error?.stack
    });
    return res.status(500).json({ ok: false, error: "No se pudo desactivar la suscripción." });
  }
});

router.delete("/households/:id", requireAuth, requireDiod, async (req, res) => {
  try {
    const householdId = String(req.params.id || "");
    if (!mongoose.isValidObjectId(householdId)) {
      return res.status(400).json({ ok: false, error: "El hogar no es válido." });
    }
    if (String(req.kitchenUser.activeHouseholdId || "") === householdId) {
      req.kitchenUser.activeHouseholdId = null;
      await req.kitchenUser.save();
    }

    await Promise.all([
      KitchenWeekPlan.deleteMany({ householdId }),
      KitchenDish.deleteMany({ householdId }),
      KitchenIngredient.deleteMany({ householdId }),
      Category.deleteMany({ householdId }),
      KitchenShoppingList.deleteMany({ householdId }),
      KitchenSwap.deleteMany({ householdId }),
      ShoppingTrip.deleteMany({ householdId }),
      Store.deleteMany({ householdId }),
      HiddenMaster.deleteMany({ householdId }),
      Invitation.deleteMany({ householdId })
    ]);

    await KitchenUser.updateMany({ householdId }, { $set: { householdId: null, activeHouseholdId: null, role: "member" } });
    await Household.deleteOne({ _id: householdId });

    return res.json({ ok: true });
  } catch (error) {
    return res.status(500).json({ ok: false, error: "No se pudo eliminar el hogar." });
  }
});

router.get("/users", requireAuth, requireDiod, async (req, res) => {
  try {
    const users = await KitchenUser.find({}, {
      email: 1,
      displayName: 1,
      role: 1,
      globalRole: 1,
      householdId: 1,
      activeHouseholdId: 1
    })
      .sort({ createdAt: -1 })
      .lean();

    return res.json({
      ok: true,
      users: users.map((user) => ({
        id: user._id,
        email: user.email || "",
        displayName: user.displayName || "",
        role: user.role || "member",
        globalRole: user.globalRole || null,
        householdId: user.householdId || null,
        activeHouseholdId: user.activeHouseholdId || null
      }))
    });
  } catch (error) {
    return res.status(500).json({ ok: false, error: "No se pudieron cargar los usuarios globales." });
  }
});

async function setActiveHousehold(req, res) {
  try {
    if (!req.kitchenUser) {
      return res.status(401).json({ ok: false, error: "No hay sesión activa." });
    }

    const householdId = normalizeActiveHouseholdIdInput(req.body || {});

    if (householdId === undefined) {
      return res.status(400).json({
        ok: false,
        error: "Debes enviar activeHouseholdId (string válido, null o \"\")."
      });
    }

    if (householdId === null) {
      req.kitchenUser.activeHouseholdId = null;
      await req.kitchenUser.save();
      return res.json({ ok: true, activeHouseholdId: null });
    }

    if (typeof householdId !== "string" || !mongoose.isValidObjectId(householdId)) {
      return res.status(400).json({ ok: false, error: "activeHouseholdId no es válido." });
    }

    const household = await Household.findById(householdId);
    if (!household) {
      return res.status(404).json({ ok: false, error: "El hogar no existe." });
    }

    req.kitchenUser.activeHouseholdId = household._id;
    await req.kitchenUser.save();

    return res.json({
      ok: true,
      activeHouseholdId: req.kitchenUser.activeHouseholdId
    });
  } catch (error) {
    console.error("[kitchen/admin] setActiveHousehold failed", {
      userId: req.kitchenUser?._id?.toString?.(),
      body: req.body,
      error
    });
    return res.status(500).json({ ok: false, error: "No se pudo cambiar el hogar activo." });
  }
}

router.post("/active-household", requireAuth, requireDiod, setActiveHousehold);
router.put("/active-household", requireAuth, requireDiod, setActiveHousehold);


router.delete("/active-household", requireAuth, requireDiod, async (req, res) => {
  try {
    req.kitchenUser.activeHouseholdId = null;
    await req.kitchenUser.save();

    return res.json({ ok: true, activeHouseholdId: null });
  } catch (error) {
    return res.status(500).json({ ok: false, error: "No se pudo limpiar el hogar activo." });
  }
});

router.get("/active-household", requireAuth, async (req, res) => {
  try {
    if (req.kitchenUser.globalRole === "diod") {
      return res.json({ ok: true, activeHouseholdId: req.kitchenUser.activeHouseholdId || null });
    }

    return res.json({ ok: true, activeHouseholdId: req.kitchenUser.householdId || null });
  } catch (error) {
    return res.status(500).json({ ok: false, error: "No se pudo obtener el hogar activo." });
  }
});

// ─── GET /api/kitchen/admin/payments/attempts ────────────────────────────────

router.get("/payments/attempts", requireAuth, requireDiod, async (req, res) => {
  try {
    const { status, type, email, householdId, mode, limit: limitParam, offset: offsetParam } = req.query;

    const filter = {};
    if (status) filter.status = status;
    if (type) filter.type = type;
    if (mode) filter.mode = mode;
    if (email) filter.email = { $regex: String(email).replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), $options: "i" };
    if (householdId && mongoose.isValidObjectId(householdId)) filter.householdId = householdId;

    const limit = Math.min(Number(limitParam) || 50, 200);
    const skip = Number(offsetParam) || 0;

    const [attempts, total] = await Promise.all([
      PurchaseAttempt.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit).lean(),
      PurchaseAttempt.countDocuments(filter)
    ]);

    return res.json({ ok: true, attempts, total, limit, offset: skip });
  } catch (error) {
    console.error("[admin] payments/attempts error", { error: error?.message });
    return res.status(500).json({ ok: false, error: "No se pudieron cargar los intentos de pago." });
  }
});

// ─── GET /api/kitchen/admin/payments/entitlements ────────────────────────────

router.get("/payments/entitlements", requireAuth, requireDiod, async (req, res) => {
  try {
    const { status, mode, householdId, packId, limit: limitParam, offset: offsetParam } = req.query;

    const filter = {};
    if (status) filter.status = status;
    if (mode) filter.mode = mode;
    if (householdId && mongoose.isValidObjectId(householdId)) filter.householdId = householdId;
    if (packId && mongoose.isValidObjectId(packId)) filter.packId = packId;

    const limit = Math.min(Number(limitParam) || 50, 200);
    const skip = Number(offsetParam) || 0;

    const [entitlements, total] = await Promise.all([
      PackEntitlement.find(filter)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .populate("packId", "slug title")
        .lean(),
      PackEntitlement.countDocuments(filter)
    ]);

    return res.json({ ok: true, entitlements, total, limit, offset: skip });
  } catch (error) {
    console.error("[admin] payments/entitlements error", { error: error?.message });
    return res.status(500).json({ ok: false, error: "No se pudieron cargar los entitlements de pago." });
  }
});

// ─── Categories ──────────────────────────────────────────────────────────────

router.get("/dish-categories", requireAuth, requireDiod, async (req, res) => {
  try {
    const categories = await KitchenDishCategory.find({})
      .select("_id name slug code colorBg colorText active")
      .sort({ name: 1 })
      .lean();
    return res.json({ ok: true, categories });
  } catch (err) {
    console.error("[admin] dish-categories error", err?.message);
    return res.status(500).json({ ok: false, error: "Error al cargar categorías de plato." });
  }
});

router.get("/ingredient-categories", requireAuth, requireDiod, async (req, res) => {
  try {
    const categories = await Category.find({ scope: "master", isArchived: { $ne: true } })
      .select("_id name slug colorBg colorText order forRecipes active")
      .sort({ order: 1, name: 1 })
      .lean();
    return res.json({ ok: true, categories });
  } catch (err) {
    console.error("[admin] ingredient-categories error", err?.message);
    return res.status(500).json({ ok: false, error: "Error al cargar categorías de ingrediente." });
  }
});

// ─── Beta Insights ────────────────────────────────────────────────────────────

router.get("/beta-insights", requireAuth, requireDiod, async (req, res) => {
  try {
    const now = new Date();
    const ms7  = 7  * 24 * 3600 * 1000;
    const ms14 = 14 * 24 * 3600 * 1000;
    const ms30 = 30 * 24 * 3600 * 1000;
    const day7ago  = new Date(now - ms7);
    const day30ago = new Date(now - ms30);
    const isoDay7ago  = day7ago.toISOString().slice(0, 10);
    const isoDay30ago = day30ago.toISOString().slice(0, 10);

    const households = await Household.find({}, {
      name: 1, ownerUserId: 1, subscriptionPlan: 1, planSource: 1,
      betaPro: 1, createdAt: 1, lastMeaningfulActivityAt: 1,
      freeBitesBalance: 1, purchasedBitesBalance: 1, totalBitesSpent: 1
    }).sort({ createdAt: -1 }).lean();

    if (households.length === 0) return res.json({ ok: true, households: [] });

    const householdIds = households.map((h) => h._id);

    // Owner emails — filter to valid ObjectIds only; String(undefined) === "undefined"
    // which is truthy and would cause a Mongoose cast error.
    const ownerIds = [...new Set(
      households
        .map((h) => h.ownerUserId)
        .filter((id) => id && mongoose.isValidObjectId(id))
    )];
    const ownerUsers = ownerIds.length
      ? await KitchenUser.find({ _id: { $in: ownerIds } }, { email: 1 }).lean()
      : [];
    const ownerEmailMap = Object.fromEntries(ownerUsers.map((u) => [String(u._id), u.email || ""]));

    // Onboarding status
    const onboardings = await HouseholdOnboarding.find(
      { householdId: { $in: householdIds } },
      { householdId: 1, status: 1, completedAt: 1 }
    ).lean();
    const onboardingMap = Object.fromEntries(onboardings.map((o) => [String(o.householdId), o]));

    // Weekly progress — all records, sorted newest-first per household
    const allWeekly = await HouseholdWeeklyProgress.find(
      { householdId: { $in: householdIds } },
      { householdId: 1, weekStart: 1, completedChallenges: 1, appActiveDays: 1 }
    ).sort({ weekStart: -1 }).lean();

    const weeklyByHousehold = {};
    for (const wp of allWeekly) {
      const hid = String(wp.householdId);
      if (!weeklyByHousehold[hid]) {
        weeklyByHousehold[hid] = { current: null, totalCompleted: 0, days7: new Set(), days30: new Set() };
      }
      const e = weeklyByHousehold[hid];
      if (!e.current) e.current = wp;
      e.totalCompleted += (wp.completedChallenges || []).length;
      for (const d of (wp.appActiveDays || [])) {
        if (d >= isoDay7ago)  e.days7.add(d);
        if (d >= isoDay30ago) e.days30.add(d);
      }
    }

    // Run all aggregations in parallel
    const [meals7, dishes30, ing30, shopItems7, shopLists30, packs, bitesEarned] = await Promise.all([
      KitchenWeekPlan.aggregate([
        { $match: { householdId: { $in: householdIds }, weekStart: { $gte: new Date(now - ms14) } } },
        { $unwind: "$days" },
        { $match: { "days.date": { $gte: day7ago }, "days.mainDishId": { $exists: true, $ne: null } } },
        { $group: { _id: "$householdId", count: { $sum: 1 } } }
      ]),
      KitchenDish.aggregate([
        { $match: { householdId: { $in: householdIds }, createdAt: { $gte: day30ago } } },
        { $group: { _id: "$householdId", count: { $sum: 1 } } }
      ]),
      KitchenIngredient.aggregate([
        { $match: { householdId: { $in: householdIds }, createdAt: { $gte: day30ago } } },
        { $group: { _id: "$householdId", count: { $sum: 1 } } }
      ]),
      KitchenShoppingList.aggregate([
        { $match: { householdId: { $in: householdIds } } },
        { $unwind: "$items" },
        { $match: { "items.status": "purchased", "items.purchasedAt": { $gte: day7ago } } },
        { $group: { _id: "$householdId", count: { $sum: 1 } } }
      ]),
      KitchenShoppingList.aggregate([
        { $match: { householdId: { $in: householdIds }, updatedAt: { $gte: day30ago }, "items.0": { $exists: true } } },
        { $project: {
          householdId: 1,
          total: { $size: "$items" },
          bought: { $size: { $filter: { input: "$items", as: "i", cond: { $eq: ["$$i.status", "purchased"] } } } }
        }},
        { $match: { $expr: { $and: [{ $gt: ["$total", 0] }, { $eq: ["$total", "$bought"] }] } } },
        { $group: { _id: "$householdId", count: { $sum: 1 } } }
      ]),
      HouseholdCatalogPack.aggregate([
        { $match: { householdId: { $in: householdIds }, status: "installed" } },
        { $group: { _id: "$householdId", count: { $sum: 1 } } }
      ]),
      BitesTransaction.aggregate([
        { $match: { householdId: { $in: householdIds }, amount: { $gt: 0 } } },
        { $group: { _id: "$householdId", total: { $sum: "$amount" } } }
      ])
    ]);

    const toMap  = (arr, key = "count") => Object.fromEntries(arr.map((r) => [String(r._id), r[key]]));
    const meals7Map    = toMap(meals7);
    const dishes30Map  = toMap(dishes30);
    const ing30Map     = toMap(ing30);
    const shopItems7Map = toMap(shopItems7);
    const shopLists30Map = toMap(shopLists30);
    const packsMap     = toMap(packs);
    const earnedMap    = toMap(bitesEarned, "total");

    const result = households.map((h) => {
      const hid = String(h._id);
      const onb  = onboardingMap[hid];
      const we   = weeklyByHousehold[hid];
      const cur  = we?.current;

      const weekCompletedCount    = (cur?.completedChallenges || []).length;
      const totalChallengesCompleted = we?.totalCompleted || 0;
      const activeDays7  = we?.days7.size  || 0;
      const activeDays30 = we?.days30.size || 0;
      const m7  = meals7Map[hid]    || 0;
      const d30 = dishes30Map[hid]  || 0;
      const i30 = ing30Map[hid]     || 0;
      const si7 = shopItems7Map[hid] || 0;
      const sl30 = shopLists30Map[hid] || 0;
      const pi  = packsMap[hid]     || 0;
      const bitesBalance = (h.freeBitesBalance || 0) + (h.purchasedBitesBalance || 0);
      const earned = earnedMap[hid] || 0;
      const spent  = h.totalBitesSpent || 0;

      // Health score (0-100)
      let score = 0;
      if (onb?.status === "completed") score += 20;
      if      (activeDays7 >= 4) score += 20;
      else if (activeDays7 >= 2) score += 12;
      else if (activeDays7 >= 1) score += 6;
      if      (m7 >= 4) score += 15;
      else if (m7 >= 2) score += 10;
      else if (m7 >= 1) score += 5;
      if      (weekCompletedCount >= 3) score += 15;
      else if (weekCompletedCount >= 1) score += 8;
      if      (sl30 >= 1) score += 10;
      else if (si7 >= 3)  score += 6;
      else if (si7 >= 1)  score += 3;
      if      (d30 + i30 >= 3) score += 8;
      else if (d30 + i30 >= 1) score += 4;
      if      (pi >= 2) score += 7;
      else if (pi >= 1) score += 4;
      if (h.lastMeaningfulActivityAt) {
        const daysSince = (now - new Date(h.lastMeaningfulActivityAt)) / (24 * 3600 * 1000);
        if      (daysSince < 3)  score += 5;
        else if (daysSince < 7)  score += 3;
        else if (daysSince < 30) score += 1;
      }

      return {
        id: hid,
        name: h.name,
        ownerEmail: ownerEmailMap[String(h.ownerUserId)] || "",
        plan: h.subscriptionPlan || "basic",
        planSource: h.planSource || "manual",
        betaPro: h.betaPro ? {
          active: h.betaPro.active ?? false,
          unlockedAt: h.betaPro.unlockedAt ?? null,
          expiresAt: h.betaPro.expiresAt ?? null,
          expiredAt: h.betaPro.expiredAt ?? null,
          expirationReason: h.betaPro.expirationReason ?? ""
        } : null,
        createdAt: h.createdAt || null,
        lastMeaningfulActivityAt: h.lastMeaningfulActivityAt || null,
        onboardingStatus: onb?.status || "not_started",
        onboardingCompletedAt: onb?.completedAt || null,
        weekCompletedCount,
        totalChallengesCompleted,
        activeDays7,
        activeDays30,
        meals7: m7,
        dishes30: d30,
        ingredients30: i30,
        shoppingItems7: si7,
        shoppingListsCompleted: sl30,
        packsInstalled: pi,
        bitesBalance,
        bitesEarned: earned,
        bitesSpent: spent,
        healthScore: Math.min(100, score)
      };
    });

    return res.json({ ok: true, households: result });
  } catch (error) {
    console.error("[admin] beta-insights error", { error: error?.message, stack: error?.stack });
    return res.status(500).json({ ok: false, error: "No se pudieron cargar las métricas Beta." });
  }
});

router.post("/beta-insights/:id/grant-beta-pro", requireAuth, requireDiod, async (req, res) => {
  const { id } = req.params;
  if (!mongoose.isValidObjectId(id)) return res.status(400).json({ ok: false, error: "ID inválido." });
  try {
    const days = Math.min(365, Math.max(1, Number(req.body?.daysFromNow) || 30));
    const now = new Date();
    const expiresAt = new Date(now.getTime() + days * 24 * 3600 * 1000);
    const h = await Household.findById(id).lean();
    if (!h) return res.status(404).json({ ok: false, error: "Hogar no encontrado." });
    await Household.updateOne({ _id: id }, {
      $set: {
        subscriptionPlan: "pro",
        planSource: "beta_pro",
        isPro: true,
        "betaPro.active": true,
        "betaPro.unlockedAt": h.betaPro?.unlockedAt || now,
        "betaPro.expiresAt": expiresAt,
        "betaPro.lastRenewedAt": now,
        "betaPro.expiredAt": null,
        "betaPro.expirationReason": ""
      }
    });
    // Audit log — plan changes are not bites transactions, so we log to console
    // with enough context to reconstruct who changed what and when.
    console.log("[admin] Beta Pro GRANTED", {
      householdId: id,
      householdName: h.name,
      daysFromNow: days,
      expiresAt: expiresAt.toISOString(),
      grantedByAdminId: String(req.kitchenUser?._id || "unknown"),
      at: now.toISOString()
    });
    return res.json({ ok: true, expiresAt });
  } catch (e) {
    console.error("[admin] grant-beta-pro error", e?.message);
    return res.status(500).json({ ok: false, error: "Error al conceder Beta Pro." });
  }
});

router.post("/beta-insights/:id/revoke-beta-pro", requireAuth, requireDiod, async (req, res) => {
  const { id } = req.params;
  if (!mongoose.isValidObjectId(id)) return res.status(400).json({ ok: false, error: "ID inválido." });
  try {
    const h = await Household.findById(id).lean();
    if (!h) return res.status(404).json({ ok: false, error: "Hogar no encontrado." });
    const now = new Date();
    await Household.updateOne({ _id: id }, {
      $set: {
        subscriptionPlan: "basic",
        planSource: "manual",
        isPro: false,
        "betaPro.active": false,
        "betaPro.expiredAt": now,
        "betaPro.expirationReason": "admin_revoke"
      }
    });
    // Audit log
    console.log("[admin] Beta Pro REVOKED", {
      householdId: id,
      householdName: h.name,
      revokedByAdminId: String(req.kitchenUser?._id || "unknown"),
      at: now.toISOString()
    });
    return res.json({ ok: true });
  } catch (e) {
    console.error("[admin] revoke-beta-pro error", e?.message);
    return res.status(500).json({ ok: false, error: "Error al revocar Beta Pro." });
  }
});

export default router;
