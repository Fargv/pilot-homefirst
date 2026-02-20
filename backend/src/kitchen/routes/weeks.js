import express from "express";
import { KitchenDish } from "../models/KitchenDish.js";
import { requireAuth, requireRole } from "../middleware.js";
import { formatDateISO, getWeekStart, isSameDay, parseISODate } from "../utils/dates.js";
import {
  buildScopedFilter,
  getEffectiveHouseholdId,
  handleHouseholdError
} from "../householdScope.js";
import { createOrGetWeekPlan, ensureWeekPlan, findWeekPlan } from "../weekPlanService.js";

const router = express.Router();

router.get("/:weekStart", requireAuth, async (req, res) => {
  try {
    const weekStart = parseISODate(req.params.weekStart);
    if (!weekStart) return res.status(400).json({ ok: false, error: "Fecha de semana inválida." });

    const effectiveHouseholdId = getEffectiveHouseholdId(req.user);
    const monday = getWeekStart(weekStart);
    const plan = await findWeekPlan(monday, effectiveHouseholdId);

    res.json({
      ok: true,
      weekStart: formatDateISO(monday),
      plan
    });
  } catch (error) {
    const handled = handleHouseholdError(res, error);
    if (handled) return handled;
    return res.status(500).json({ ok: false, error: "No se pudo cargar el plan semanal." });
  }
});

router.put("/:weekStart/day/:date", requireAuth, async (req, res) => {
  try {
    const weekStart = parseISODate(req.params.weekStart);
    const date = parseISODate(req.params.date);
    if (!weekStart || !date) return res.status(400).json({ ok: false, error: "Fecha inválida." });

    const effectiveHouseholdId = getEffectiveHouseholdId(req.user);
    const monday = getWeekStart(weekStart);
    const plan = await ensureWeekPlan(monday, effectiveHouseholdId);

    const day = plan.days.find((item) => isSameDay(item.date, date));
    if (!day) return res.status(404).json({ ok: false, error: "Día fuera de la semana." });

    const { cookUserId, cookTiming, servings, mainDishId, sideDishId, ingredientOverrides } = req.body;
    if (cookUserId !== undefined) day.cookUserId = cookUserId || null;
    if (cookTiming) day.cookTiming = cookTiming === "same_day" ? "same_day" : "previous_day";
    if (servings) day.servings = Number(servings) || 4;
    if (mainDishId !== undefined) day.mainDishId = mainDishId || null;
    if (sideDishId !== undefined) day.sideDishId = sideDishId || null;
    if (Array.isArray(ingredientOverrides)) day.ingredientOverrides = ingredientOverrides;

    await plan.save();
    return res.json({ ok: true, plan });
  } catch (error) {
    const handled = handleHouseholdError(res, error);
    if (handled) return handled;
    return res.status(500).json({ ok: false, error: "No se pudo actualizar el día del plan." });
  }
});

router.post("/:weekStart/copy-from/:otherWeekStart", requireAuth, requireRole("admin"), async (req, res) => {
  try {
    const weekStart = parseISODate(req.params.weekStart);
    const otherWeekStart = parseISODate(req.params.otherWeekStart);
    if (!weekStart || !otherWeekStart) {
      return res.status(400).json({ ok: false, error: "Fecha inválida." });
    }

    const effectiveHouseholdId = getEffectiveHouseholdId(req.user);
    const monday = getWeekStart(weekStart);
    const sourceMonday = getWeekStart(otherWeekStart);

    const sourcePlan = await ensureWeekPlan(sourceMonday, effectiveHouseholdId);
    const targetPlan = await ensureWeekPlan(monday, effectiveHouseholdId);

    targetPlan.days = sourcePlan.days.map((day) => ({
      date: new Date(day.date),
      cookUserId: day.cookUserId,
      cookTiming: day.cookTiming,
      servings: day.servings,
      mainDishId: day.mainDishId,
      sideDishId: day.sideDishId,
      ingredientOverrides: day.ingredientOverrides
    }));

    await targetPlan.save();
    return res.json({ ok: true, plan: targetPlan });
  } catch (error) {
    const handled = handleHouseholdError(res, error);
    if (handled) return handled;
    return res.status(500).json({ ok: false, error: "No se pudo copiar el plan semanal." });
  }
});

router.post("/:weekStart", requireAuth, async (req, res) => {
  try {
    const weekStart = parseISODate(req.params.weekStart);
    if (!weekStart) return res.status(400).json({ ok: false, error: "Fecha de semana inválida." });

    const effectiveHouseholdId = getEffectiveHouseholdId(req.user);
    const monday = getWeekStart(weekStart);
    const { plan, created } = await createOrGetWeekPlan(monday, effectiveHouseholdId);

    return res.status(created ? 201 : 200).json({
      ok: true,
      weekStart: formatDateISO(monday),
      plan
    });
  } catch (error) {
    const handled = handleHouseholdError(res, error);
    if (handled) return handled;
    if (error?.code === "WEEK_PLAN_INDEX_CONFLICT") {
      return res.status(409).json({ ok: false, error: error.message });
    }
    return res.status(500).json({ ok: false, error: "No se pudo crear el plan semanal." });
  }
});

router.get("/:weekStart/summary", requireAuth, async (req, res) => {
  try {
    const weekStart = parseISODate(req.params.weekStart);
    if (!weekStart) return res.status(400).json({ ok: false, error: "Fecha inválida." });

    const effectiveHouseholdId = getEffectiveHouseholdId(req.user);
    const monday = getWeekStart(weekStart);
    const plan = await ensureWeekPlan(monday, effectiveHouseholdId);
    const dishIds = plan.days.flatMap((day) => [day.mainDishId, day.sideDishId]).filter(Boolean);
    const dishes = await KitchenDish.find(
      buildScopedFilter(effectiveHouseholdId, { _id: { $in: dishIds } })
    );

    res.json({ ok: true, weekStart: formatDateISO(monday), plan, dishes });
  } catch (error) {
    const handled = handleHouseholdError(res, error);
    if (handled) return handled;
    return res.status(500).json({ ok: false, error: "No se pudo cargar el resumen semanal." });
  }
});

export default router;
