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
import { Category } from "../models/Category.js";
import { KitchenShoppingList } from "../models/KitchenShoppingList.js";
import { KitchenSwap } from "../models/KitchenSwap.js";
import { ShoppingTrip } from "../models/ShoppingTrip.js";
import { Store } from "../models/Store.js";
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
      { name: 1, subscriptionPlan: 1, subscriptionStatus: 1, subscriptionEndsAt: 1, pendingDowngradeAt: 1, pendingDowngradeReason: 1, isPro: 1, ownerUserId: 1, createdAt: 1, inviteCode: 1 }
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
        memberCount: memberCountMap[String(household._id)] || 0,
        inviteCode: household.inviteCode || null,
        createdAt: household.createdAt || null,
        isActive: String(household._id) === String(req.kitchenUser.activeHouseholdId || "")
      })),
      activeHouseholdId: req.kitchenUser.activeHouseholdId || null
    });
  } catch (error) {
    return res.status(500).json({ ok: false, error: "No se pudieron cargar los hogares." });
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

export default router;
