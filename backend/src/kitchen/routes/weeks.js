import express from "express";
import { KitchenDish } from "../models/KitchenDish.js";
import { KitchenUser } from "../models/KitchenUser.js";
import { requireAuth, requireRole } from "../middleware.js";
import { formatDateISO, getWeekStart, isSameDay, parseISODate } from "../utils/dates.js";
import {
  buildScopedFilter,
  getEffectiveHouseholdId,
  handleHouseholdError
} from "../householdScope.js";
import { createOrGetWeekPlan, ensureWeekPlan, findWeekPlan } from "../weekPlanService.js";

const router = express.Router();

function isHouseholdAdmin(user) {
  return user?.globalRole === "diod" || user?.role === "owner" || user?.role === "admin";
}

function isSelfAssignment(req, userId) {
  if (!userId) return false;
  return String(userId) === String(req.kitchenUser?._id);
}

function hasAdministrativePlanChange(req, day, updates) {
  if (isHouseholdAdmin(req.kitchenUser)) return false;

  if (Object.prototype.hasOwnProperty.call(updates, "cookUserId")) {
    const requestedCook = updates.cookUserId || null;
    if (!requestedCook || !isSelfAssignment(req, requestedCook)) {
      return true;
    }
  }

  const clearsMainDish = Object.prototype.hasOwnProperty.call(updates, "mainDishId")
    && !updates.mainDishId
    && Boolean(day.mainDishId);
  const clearsSideDish = Object.prototype.hasOwnProperty.call(updates, "sideDishId")
    && !updates.sideDishId
    && Boolean(day.sideDishId);

  return clearsMainDish || clearsSideDish;
}

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

    if (hasAdministrativePlanChange(req, day, req.body || {})) {
      return res.status(403).json({
        ok: false,
        error: "Solo owner/admin puede reasignar a otros usuarios o quitar platos del día."
      });
    }

    if (cookUserId) {
      const assignedUser = await KitchenUser.findOne(
        buildScopedFilter(effectiveHouseholdId, { _id: cookUserId })
      ).select("_id");
      if (!assignedUser) {
        return res.status(400).json({ ok: false, error: "La persona asignada no pertenece a este hogar." });
      }
    }

    if (mainDishId) {
      const mainDish = await KitchenDish.findOne(
        buildScopedFilter(effectiveHouseholdId, { _id: mainDishId, sidedish: { $ne: true } })
      ).select("_id");
      if (!mainDish) {
        return res.status(400).json({ ok: false, error: "El plato principal no pertenece a este hogar." });
      }
    }

    if (sideDishId) {
      const sideDish = await KitchenDish.findOne(
        buildScopedFilter(effectiveHouseholdId, { _id: sideDishId, sidedish: true })
      ).select("_id");
      if (!sideDish) {
        return res.status(400).json({ ok: false, error: "La guarnición no pertenece a este hogar." });
      }
    }

    if (cookUserId !== undefined) day.cookUserId = cookUserId || null;
    if (cookUserId === undefined && mainDishId && !day.cookUserId) {
      day.cookUserId = req.kitchenUser._id;
    }
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

router.post("/:weekStart/day/:date/move", requireAuth, async (req, res) => {
  try {
    if (!isHouseholdAdmin(req.kitchenUser)) {
      return res.status(403).json({ ok: false, error: "Solo owner/admin puede mover asignaciones entre días." });
    }

    const weekStart = parseISODate(req.params.weekStart);
    const sourceDate = parseISODate(req.params.date);
    const targetDate = parseISODate(req.body?.targetDate);
    if (!weekStart || !sourceDate || !targetDate) {
      return res.status(400).json({ ok: false, error: "Debes indicar fecha origen, destino y semana válidas." });
    }

    const monday = getWeekStart(weekStart);
    if (getWeekStart(targetDate).getTime() !== monday.getTime()) {
      return res.status(400).json({ ok: false, error: "Solo puedes mover platos dentro de la misma semana." });
    }

    const effectiveHouseholdId = getEffectiveHouseholdId(req.user);
    const plan = await ensureWeekPlan(monday, effectiveHouseholdId);
    const sourceDay = plan.days.find((item) => isSameDay(item.date, sourceDate));
    const targetDay = plan.days.find((item) => isSameDay(item.date, targetDate));

    if (!sourceDay || !targetDay) {
      return res.status(404).json({ ok: false, error: "No encontramos los días de origen o destino en esa semana." });
    }

    targetDay.cookUserId = sourceDay.cookUserId || null;
    targetDay.cookTiming = sourceDay.cookTiming || "previous_day";
    targetDay.servings = sourceDay.servings || 4;
    targetDay.mainDishId = sourceDay.mainDishId || null;
    targetDay.sideDishId = sourceDay.sideDishId || null;
    targetDay.ingredientOverrides = Array.isArray(sourceDay.ingredientOverrides)
      ? sourceDay.ingredientOverrides.map((item) => ({
        displayName: item.displayName,
        canonicalName: item.canonicalName,
        ...(item.ingredientId ? { ingredientId: item.ingredientId } : {})
      }))
      : [];

    sourceDay.cookUserId = null;
    sourceDay.mainDishId = null;
    sourceDay.sideDishId = null;
    sourceDay.ingredientOverrides = [];

    await plan.save();
    return res.json({ ok: true, plan });
  } catch (error) {
    const handled = handleHouseholdError(res, error);
    if (handled) return handled;
    return res.status(500).json({ ok: false, error: "No se pudo mover la asignación de día." });
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
