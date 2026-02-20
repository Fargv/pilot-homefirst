import express from "express";
import mongoose from "mongoose";
import { requireAuth, requireDiod } from "../middleware.js";
import { Household } from "../models/Household.js";

const router = express.Router();

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

router.post("/active-household", requireAuth, requireDiod, async (req, res) => {
  try {
    const { householdId } = req.body;

    if (householdId === null || householdId === "") {
      req.kitchenUser.activeHouseholdId = null;
      await req.kitchenUser.save();
      return res.json({ ok: true, activeHouseholdId: null });
    }

    if (!householdId || !mongoose.isValidObjectId(householdId)) {
      return res.status(400).json({ ok: false, error: "householdId no es válido." });
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
    return res.status(500).json({ ok: false, error: "No se pudo cambiar el hogar activo." });
  }
});


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
  if (req.kitchenUser.globalRole === "diod") {
    return res.json({ ok: true, activeHouseholdId: req.kitchenUser.activeHouseholdId || null });
  }

  if (!req.kitchenUser.householdId) {
    return res.status(400).json({ ok: false, error: "active household required" });
  }

  return res.json({ ok: true, activeHouseholdId: req.kitchenUser.householdId });
});

export default router;
