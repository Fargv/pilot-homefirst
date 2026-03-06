import express from "express";
import mongoose from "mongoose";
import { KitchenDish } from "../models/KitchenDish.js";
import { KitchenUser } from "../models/KitchenUser.js";
import { KitchenWeekPlan } from "../models/KitchenWeekPlan.js";
import { Household } from "../models/Household.js";
import { requireAuth, requireRole } from "../middleware.js";
import { formatDateISO, getWeekStart, isSameDay, parseISODate } from "../utils/dates.js";
import {
  buildScopedFilter,
  getEffectiveHouseholdId,
  handleHouseholdError
} from "../householdScope.js";
import { createOrGetWeekPlan, ensureWeekPlan, findWeekPlan } from "../weekPlanService.js";
import { rebuildShoppingList } from "../shoppingService.js";
import { CATALOG_SCOPES } from "../utils/catalogScopes.js";

const router = express.Router();

function logKitchenError(context, error, extra = {}) {
  console.error(`[kitchen][weeks] ${context}`, {
    ...extra,
    message: error?.message,
    stack: error?.stack
  });
}

function validateObjectId(value, fieldName) {
  if (value === undefined || value === null || value === "") return null;
  if (!mongoose.isValidObjectId(value)) {
    return `${fieldName} no es un identificador válido.`;
  }
  return null;
}

function normalizeIngredientOverrides(ingredientOverrides = []) {
  return ingredientOverrides.map((item) => ({
    displayName: String(item?.displayName || "").trim(),
    canonicalName: String(item?.canonicalName || "").trim(),
    ...(item?.ingredientId ? { ingredientId: item.ingredientId } : {})
  }));
}

function buildDishVisibilityFilter(effectiveHouseholdId, extraFilter = {}) {
  const hasActiveFilter = Object.prototype.hasOwnProperty.call(extraFilter, "active");
  return {
    ...extraFilter,
    ...(hasActiveFilter ? {} : { active: true }),
    isArchived: { $ne: true },
    $or: [
      { scope: CATALOG_SCOPES.MASTER },
      { scope: CATALOG_SCOPES.HOUSEHOLD, householdId: effectiveHouseholdId },
      { scope: CATALOG_SCOPES.OVERRIDE, householdId: effectiveHouseholdId }
    ]
  };
}

async function rebuildShoppingListBestEffort({ monday, effectiveHouseholdId, context }) {
  try {
    await rebuildShoppingList(monday, effectiveHouseholdId);
    return null;
  } catch (error) {
    logKitchenError(`${context}:rebuild-shopping-list`, error, {
      weekStart: formatDateISO(monday),
      householdId: String(effectiveHouseholdId)
    });
    return "El plan se guardó, pero no se pudo reconstruir la lista de compra.";
  }
}

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

function isActiveMember(member) {
  return member?.active !== false;
}

function canAutoAssignCook(member) {
  const isPlaceholder = member?.isPlaceholder || member?.type === "placeholder";
  const canCook = typeof member?.canCook === "boolean" ? member.canCook : !isPlaceholder;
  return isActiveMember(member) && canCook;
}

function dedupeIds(items = []) {
  const seen = new Set();
  const result = [];
  for (const item of items) {
    const value = String(item || "").trim();
    if (!value || seen.has(value)) continue;
    seen.add(value);
    result.push(value);
  }
  return result;
}

function buildDefaultAttendeeIds(members = []) {
  return dedupeIds(
    members
      .filter((member) => isActiveMember(member))
      .map((member) => member?._id)
  );
}

function resolveDayAttendeeIds(day, defaultAttendeeIds = []) {
  if (Array.isArray(day?.attendeeIds)) {
    return dedupeIds(day.attendeeIds);
  }
  return [...defaultAttendeeIds];
}

function applyAttendeesToDay(day, attendeeIds) {
  day.attendeeIds = dedupeIds(attendeeIds);
  day.attendeeCount = day.attendeeIds.length;
}

async function loadHouseholdMembers(effectiveHouseholdId) {
  return KitchenUser.find(buildScopedFilter(effectiveHouseholdId, {}))
    .select("_id active canCook isPlaceholder type")
    .lean();
}

function pickRandomItem(items = []) {
  if (!items.length) return null;
  const index = Math.floor(Math.random() * items.length);
  return items[index] || null;
}

function shuffleArray(items = []) {
  const copy = [...items];
  for (let i = copy.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

function normalizeAvoidRepeatsWeeks(value) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return 1;
  return Math.min(12, Math.max(1, Math.round(parsed)));
}

async function getRecentWeeksDishIds(effectiveHouseholdId, monday, weeks) {
  const windowStart = new Date(monday);
  windowStart.setUTCDate(windowStart.getUTCDate() - (weeks * 7));

  const recentPlans = await KitchenWeekPlan.find(
    buildScopedFilter(effectiveHouseholdId, {
      weekStart: { $gte: windowStart, $lt: monday }
    })
  )
    .select("days.mainDishId")
    .lean();

  const usedDishIds = new Set();
  for (const plan of recentPlans) {
    const days = Array.isArray(plan?.days) ? plan.days : [];
    for (const day of days) {
      if (day?.mainDishId) usedDishIds.add(String(day.mainDishId));
    }
  }
  return usedDishIds;
}

router.get("/:weekStart", requireAuth, async (req, res) => {
  try {
    const weekStart = parseISODate(req.params.weekStart);
    if (!weekStart) return res.status(400).json({ ok: false, error: "Fecha de semana inválida." });

    const effectiveHouseholdId = getEffectiveHouseholdId(req.user);
    const monday = getWeekStart(weekStart);
    const plan = await findWeekPlan(monday, effectiveHouseholdId);
    if (plan) {
      const members = await loadHouseholdMembers(effectiveHouseholdId);
      const defaultAttendeeIds = buildDefaultAttendeeIds(members);
      for (const day of plan.days || []) {
        const attendeeIds = resolveDayAttendeeIds(day, defaultAttendeeIds);
        applyAttendeesToDay(day, attendeeIds);
      }
    }

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
    if (!weekStart || !date) return res.status(400).json({ ok: false, error: "Fecha invalida." });

    const effectiveHouseholdId = getEffectiveHouseholdId(req.user);
    const monday = getWeekStart(weekStart);
    const plan = await ensureWeekPlan(monday, effectiveHouseholdId);

    const day = plan.days.find((item) => isSameDay(item.date, date));
    if (!day) return res.status(404).json({ ok: false, error: "Dia fuera de la semana." });

    const {
      cookUserId,
      cookTiming,
      servings,
      mainDishId,
      sideDishId,
      ingredientOverrides,
      attendeeIds
    } = req.body;

    const invalidIdMessage =
      validateObjectId(cookUserId, "cookUserId")
      || validateObjectId(mainDishId, "mainDishId")
      || validateObjectId(sideDishId, "sideDishId");
    if (invalidIdMessage) {
      return res.status(400).json({ ok: false, error: invalidIdMessage });
    }

    if (Array.isArray(ingredientOverrides)) {
      const invalidOverride = ingredientOverrides.find((item) =>
        item?.ingredientId && !mongoose.isValidObjectId(item.ingredientId)
      );
      if (invalidOverride) {
        return res.status(400).json({ ok: false, error: "Algun ingredientId de extras no es valido." });
      }
    }
    if (attendeeIds !== undefined && !Array.isArray(attendeeIds)) {
      return res.status(400).json({ ok: false, error: "attendeeIds debe ser una lista." });
    }
    if (Array.isArray(attendeeIds)) {
      const invalidAttendeeId = attendeeIds.find((item) => !mongoose.isValidObjectId(item));
      if (invalidAttendeeId) {
        return res.status(400).json({ ok: false, error: "Algun attendeeId no es valido." });
      }
    }

    if (hasAdministrativePlanChange(req, day, req.body || {})) {
      return res.status(403).json({
        ok: false,
        error: "Solo owner/admin puede reasignar a otros usuarios o quitar platos del dia."
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
        buildDishVisibilityFilter(effectiveHouseholdId, { _id: mainDishId, sidedish: { $ne: true } })
      ).select("_id");
      if (!mainDish) {
        return res.status(400).json({ ok: false, error: "El plato principal no pertenece a este hogar." });
      }
    }

    if (sideDishId) {
      const sideDish = await KitchenDish.findOne(
        buildDishVisibilityFilter(effectiveHouseholdId, { _id: sideDishId, sidedish: true })
      ).select("_id");
      if (!sideDish) {
        return res.status(400).json({ ok: false, error: "La guarnicion no pertenece a este hogar." });
      }
    }

    const members = await loadHouseholdMembers(effectiveHouseholdId);
    const validMemberIdSet = new Set(dedupeIds(members.map((member) => member._id)));
    const defaultAttendeeIds = buildDefaultAttendeeIds(members);
    const nextAttendeeIds = Array.isArray(attendeeIds)
      ? dedupeIds(attendeeIds)
      : resolveDayAttendeeIds(day, defaultAttendeeIds);
    if (nextAttendeeIds.some((id) => !validMemberIdSet.has(id))) {
      return res.status(400).json({ ok: false, error: "Algun comensal no pertenece a este hogar." });
    }

    if (cookUserId !== undefined) day.cookUserId = cookUserId || null;
    if (cookUserId === undefined && mainDishId && !day.cookUserId) {
      day.cookUserId = req.kitchenUser._id;
    }
    if (cookTiming) day.cookTiming = cookTiming === "same_day" ? "same_day" : "previous_day";
    if (servings) day.servings = Number(servings) || 4;
    if (mainDishId !== undefined) day.mainDishId = mainDishId || null;
    if (sideDishId !== undefined) day.sideDishId = sideDishId || null;
    if (Array.isArray(ingredientOverrides)) day.ingredientOverrides = normalizeIngredientOverrides(ingredientOverrides);
    applyAttendeesToDay(day, nextAttendeeIds);

    await plan.save();
    const warning = await rebuildShoppingListBestEffort({
      monday,
      effectiveHouseholdId,
      context: "update-day"
    });
    return res.json({ ok: true, plan, ...(warning ? { warning } : {}) });
  } catch (error) {
    const handled = handleHouseholdError(res, error);
    if (handled) return handled;
    logKitchenError("update-day", error, {
      weekStart: req.params.weekStart,
      date: req.params.date,
      userId: String(req.kitchenUser?._id || "")
    });
    if (error?.name === "ValidationError" || error?.name === "CastError") {
      return res.status(400).json({ ok: false, error: "Datos invalidos al actualizar el dia del plan." });
    }
    return res.status(500).json({ ok: false, error: "No se pudo actualizar el dia del plan." });
  }
});

router.post("/:weekStart/day/:date/toggle-attendance", requireAuth, async (req, res) => {
  try {
    const weekStart = parseISODate(req.params.weekStart);
    const date = parseISODate(req.params.date);
    if (!weekStart || !date) return res.status(400).json({ ok: false, error: "Fecha invalida." });

    const effectiveHouseholdId = getEffectiveHouseholdId(req.user);
    const monday = getWeekStart(weekStart);
    const plan = await ensureWeekPlan(monday, effectiveHouseholdId);
    const day = plan.days.find((item) => isSameDay(item.date, date));
    if (!day) return res.status(404).json({ ok: false, error: "Dia fuera de la semana." });

    const members = await loadHouseholdMembers(effectiveHouseholdId);
    const defaultAttendeeIds = buildDefaultAttendeeIds(members);
    const selfId = String(req.kitchenUser?._id || "");
    const nextAttendeeIds = resolveDayAttendeeIds(day, defaultAttendeeIds);
    const isPresent = nextAttendeeIds.includes(selfId);
    const toggledAttendees = isPresent
      ? nextAttendeeIds.filter((id) => id !== selfId)
      : [...nextAttendeeIds, selfId];

    applyAttendeesToDay(day, toggledAttendees);
    await plan.save();
    return res.json({
      ok: true,
      plan,
      attending: !isPresent,
      attendeeIds: day.attendeeIds,
      attendeeCount: day.attendeeCount
    });
  } catch (error) {
    const handled = handleHouseholdError(res, error);
    if (handled) return handled;
    logKitchenError("toggle-attendance", error, {
      weekStart: req.params.weekStart,
      date: req.params.date,
      userId: String(req.kitchenUser?._id || "")
    });
    return res.status(500).json({ ok: false, error: "No se pudo actualizar asistencia." });
  }
});

router.post("/:weekStart/day/:date/random-main", requireAuth, async (req, res) => {
  try {
    const weekStart = parseISODate(req.params.weekStart);
    const date = parseISODate(req.params.date);
    if (!weekStart || !date) return res.status(400).json({ ok: false, error: "Fecha inválida." });

    const effectiveHouseholdId = getEffectiveHouseholdId(req.user);
    const monday = getWeekStart(weekStart);
    const plan = await ensureWeekPlan(monday, effectiveHouseholdId);
    const day = plan.days.find((item) => isSameDay(item.date, date));
    if (!day) return res.status(404).json({ ok: false, error: "Día fuera de la semana." });

    const isAdmin = isHouseholdAdmin(req.kitchenUser);
    const isSelf = day.cookUserId && String(day.cookUserId) === String(req.kitchenUser?._id);
    if (day.cookUserId && !isAdmin && !isSelf) {
      return res.status(403).json({
        ok: false,
        error: "Solo owner/admin puede reasignar a otros usuarios o quitar platos del día."
      });
    }

    const usedMainDishIds = new Set(
      plan.days
        .filter((entry) => !isSameDay(entry.date, date))
        .map((entry) => entry?.mainDishId)
        .filter(Boolean)
        .map((dishId) => String(dishId))
    );

    const baseDishFilter = buildDishVisibilityFilter(effectiveHouseholdId, {
      sidedish: { $ne: true },
      special: { $ne: true }
    });
    const allEligible = await KitchenDish.find(baseDishFilter).select("_id name householdId scope").lean();
    if (!allEligible.length) {
      const allVisibleCount = await KitchenDish.countDocuments(
        buildDishVisibilityFilter(effectiveHouseholdId, { sidedish: { $ne: true } })
      );
      if (allVisibleCount > 0) {
        return res.json({ ok: true, dish: null, reason: "only_special" });
      }
      return res.json({ ok: true, dish: null, reason: "no_dishes" });
    }

    const household = await Household.findById(effectiveHouseholdId)
      .select("avoidRepeatsEnabled avoidRepeatsWeeks")
      .lean();
    const avoidRepeatsEnabled = Boolean(household?.avoidRepeatsEnabled);
    const avoidRepeatsWeeks = normalizeAvoidRepeatsWeeks(household?.avoidRepeatsWeeks);
    const recentDishIds = avoidRepeatsEnabled
      ? await getRecentWeeksDishIds(effectiveHouseholdId, monday, avoidRepeatsWeeks)
      : new Set();

    const candidatesRelaxed = allEligible.filter((dish) => !usedMainDishIds.has(String(dish._id)));
    const candidatesStrict = candidatesRelaxed.filter((dish) => !recentDishIds.has(String(dish._id)));

    if (candidatesStrict.length) {
      const dish = pickRandomItem(candidatesStrict);
      return res.json({
        ok: true,
        dish,
        reason: null
      });
    }

    if (candidatesRelaxed.length) {
      const dish = pickRandomItem(candidatesRelaxed);
      return res.json({
        ok: true,
        dish,
        reason: avoidRepeatsEnabled ? "avoid_repeats_relaxed" : null
      });
    }

    if (!candidatesRelaxed.length) {
      return res.json({ ok: true, dish: null, reason: "all_used" });
    }
    return res.json({ ok: true, dish: null, reason: "no_dishes" });
  } catch (error) {
    const handled = handleHouseholdError(res, error);
    if (handled) return handled;
    logKitchenError("random-main", error, {
      weekStart: req.params.weekStart,
      date: req.params.date,
      userId: String(req.kitchenUser?._id || "")
    });
    return res.status(500).json({ ok: false, error: "No se pudo seleccionar un plato aleatorio." });
  }
});

router.post("/:weekStart/randomize", requireAuth, async (req, res) => {
  try {
    const weekStart = parseISODate(req.params.weekStart);
    if (!weekStart) return res.status(400).json({ ok: false, error: "Fecha inválida." });

    const effectiveHouseholdId = getEffectiveHouseholdId(req.user);
    const monday = getWeekStart(weekStart);
    const plan = await ensureWeekPlan(monday, effectiveHouseholdId);
    const overwriteAll = Boolean(req.body?.overwriteAll);

    const targetDays = overwriteAll
      ? plan.days
      : plan.days.filter((day) => !day.mainDishId);

    if (!targetDays.length) {
      return res.json({
        ok: true,
        plan,
        assignedCount: 0,
        targetCount: 0,
        insufficient: false
      });
    }

    const usedInCurrentWeek = new Set(
      plan.days
        .filter((day) => !targetDays.includes(day))
        .map((day) => day?.mainDishId)
        .filter(Boolean)
        .map((dishId) => String(dishId))
    );

    const candidates = await KitchenDish.find(
      buildDishVisibilityFilter(effectiveHouseholdId, {
        sidedish: { $ne: true },
        special: { $ne: true }
      })
    )
      .select("_id")
      .lean();

    const allDishIds = candidates.map((dish) => String(dish._id));
    if (!allDishIds.length) {
      const allVisibleCount = await KitchenDish.countDocuments(
        buildDishVisibilityFilter(effectiveHouseholdId, { sidedish: { $ne: true } })
      );
      if (allVisibleCount > 0) {
        return res.json({
          ok: true,
          plan,
          assignedCount: 0,
          targetCount: targetDays.length,
          insufficient: true,
          warnings: ["No hay platos disponibles para randomizar (los platos especiales están excluidos)."],
          warningCodes: ["only_special_excluded"]
        });
      }
      return res.json({
        ok: true,
        plan,
        assignedCount: 0,
        targetCount: targetDays.length,
        insufficient: true,
        warnings: ["No hay platos disponibles en este household para randomizar la semana."],
        warningCodes: ["no_dishes"]
      });
    }

    const household = await Household.findById(effectiveHouseholdId)
      .select("avoidRepeatsEnabled avoidRepeatsWeeks")
      .lean();
    const avoidRepeatsEnabled = Boolean(household?.avoidRepeatsEnabled);
    const avoidRepeatsWeeks = normalizeAvoidRepeatsWeeks(household?.avoidRepeatsWeeks);
    const recentDishIds = avoidRepeatsEnabled
      ? await getRecentWeeksDishIds(effectiveHouseholdId, monday, avoidRepeatsWeeks)
      : new Set();

    const randomizedDays = shuffleArray([...targetDays]);
    let assignedCount = 0;
    let relaxedCrossWeekRule = false;
    let relaxedSameWeekRule = false;
    const members = await loadHouseholdMembers(effectiveHouseholdId);
    const defaultAttendeeIds = buildDefaultAttendeeIds(members);
    const uniqueDishCapacity = allDishIds.filter((dishId) => !usedInCurrentWeek.has(dishId)).length;
    const mustKeepSameWeekUnique = uniqueDishCapacity >= targetDays.length;

    for (const day of randomizedDays) {
      const strictEligible = allDishIds.filter(
        (dishId) => !usedInCurrentWeek.has(dishId) && !recentDishIds.has(dishId)
      );
      let pickedDishId = pickRandomItem(strictEligible);

      if (!pickedDishId) {
        const sameWeekEligible = allDishIds.filter((dishId) => !usedInCurrentWeek.has(dishId));
        pickedDishId = pickRandomItem(sameWeekEligible);
        if (pickedDishId) {
          relaxedCrossWeekRule = true;
        } else {
          if (mustKeepSameWeekUnique) {
            continue;
          }
          pickedDishId = pickRandomItem(allDishIds);
          if (pickedDishId) {
            relaxedCrossWeekRule = true;
            relaxedSameWeekRule = true;
          }
        }
      }

      if (!pickedDishId) continue;

      day.mainDishId = pickedDishId;
      applyAttendeesToDay(day, resolveDayAttendeeIds(day, defaultAttendeeIds));
      usedInCurrentWeek.add(pickedDishId);
      assignedCount += 1;
    }

    const userPool = shuffleArray(
      members
        .filter((member) => canAutoAssignCook(member))
        .map((member) => String(member._id))
        .filter(Boolean)
    );

    for (let index = 0; index < randomizedDays.length; index += 1) {
      const day = randomizedDays[index];
      if (!day.mainDishId) continue;
      day.cookUserId = userPool.length ? userPool[index % userPool.length] : null;
    }

    await plan.save();
    const warning = await rebuildShoppingListBestEffort({
      monday,
      effectiveHouseholdId,
      context: "randomize-week"
    });

    const warnings = [];
    const warningCodes = [];
    if (relaxedCrossWeekRule && avoidRepeatsEnabled) {
      warnings.push(
        `No se pudo evitar repetir platos en las ultimas ${avoidRepeatsWeeks} semanas por falta de platos disponibles. Se ha aplicado la regla hasta donde ha sido posible.`
      );
      warningCodes.push("avoid_repeats_relaxed");
    }
    if (relaxedSameWeekRule) {
      warnings.push(
        "No habia platos suficientes para evitar repeticiones dentro de la misma semana. Se permitieron repeticiones para completar la planificacion."
      );
      warningCodes.push("same_week_repeat_relaxed");
    }

    return res.json({
      ok: true,
      plan,
      assignedCount,
      targetCount: targetDays.length,
      insufficient: assignedCount < targetDays.length,
      warnings,
      warningCodes,
      ...(warning ? { warning } : {})
    });
  } catch (error) {
    const handled = handleHouseholdError(res, error);
    if (handled) return handled;
    logKitchenError("randomize-week", error, {
      weekStart: req.params.weekStart,
      userId: String(req.kitchenUser?._id || "")
    });
    return res.status(500).json({ ok: false, error: "No se pudo randomizar la semana." });
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
      attendeeIds: Array.isArray(day.attendeeIds) ? dedupeIds(day.attendeeIds) : undefined,
      attendeeCount: Array.isArray(day.attendeeIds)
        ? dedupeIds(day.attendeeIds).length
        : (typeof day.attendeeCount === "number" ? day.attendeeCount : undefined),
      cookTiming: day.cookTiming,
      servings: day.servings,
      mainDishId: day.mainDishId,
      sideDishId: day.sideDishId,
      ingredientOverrides: day.ingredientOverrides
    }));

    await targetPlan.save();
    const warning = await rebuildShoppingListBestEffort({
      monday,
      effectiveHouseholdId,
      context: "copy-week"
    });
    return res.json({ ok: true, plan: targetPlan, ...(warning ? { warning } : {}) });
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
    const warning = await rebuildShoppingListBestEffort({
      monday,
      effectiveHouseholdId,
      context: "move-day"
    });
    return res.json({ ok: true, plan, ...(warning ? { warning } : {}) });
  } catch (error) {
    const handled = handleHouseholdError(res, error);
    if (handled) return handled;
    logKitchenError("move-day", error, {
      weekStart: req.params.weekStart,
      date: req.params.date,
      userId: String(req.kitchenUser?._id || "")
    });
    if (error?.name === "ValidationError" || error?.name === "CastError") {
      return res.status(400).json({ ok: false, error: "Datos inválidos al mover la asignación." });
    }
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
    const members = await loadHouseholdMembers(effectiveHouseholdId);
    const defaultAttendeeIds = buildDefaultAttendeeIds(members);
    for (const day of plan.days || []) {
      applyAttendeesToDay(day, resolveDayAttendeeIds(day, defaultAttendeeIds));
    }
    const dishIds = plan.days.flatMap((day) => [day.mainDishId, day.sideDishId]).filter(Boolean);
    const dishes = await KitchenDish.find(
      buildDishVisibilityFilter(effectiveHouseholdId, { _id: { $in: dishIds } })
    );

    res.json({ ok: true, weekStart: formatDateISO(monday), plan, dishes });
  } catch (error) {
    const handled = handleHouseholdError(res, error);
    if (handled) return handled;
    return res.status(500).json({ ok: false, error: "No se pudo cargar el resumen semanal." });
  }
});

export default router;


