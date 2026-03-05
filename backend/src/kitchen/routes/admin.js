import express from "express";
import mongoose from "mongoose";
import { requireAuth, requireDiod } from "../middleware.js";
import { Household } from "../models/Household.js";
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
    const households = await Household.find({}, { name: 1 }).sort({ createdAt: 1 }).lean();
    return res.json({
      ok: true,
      households: households.map((household) => ({
        id: household._id,
        name: household.name,
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

export default router;
