import express from "express";
import mongoose from "mongoose";
import { requireAuth, requireDiod } from "../middleware.js";
import { Household } from "../models/Household.js";

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
