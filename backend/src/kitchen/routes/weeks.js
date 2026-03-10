import express from "express";
import mongoose from "mongoose";
import { KitchenDish } from "../models/KitchenDish.js";
import { KitchenDishCategory } from "../models/KitchenDishCategory.js";
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
import { resolveDishCatalogForHousehold } from "../utils/dishCatalog.js";

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

function buildRandomizableMainDishFilter(mealType) {
  return {
    sidedish: { $ne: true },
    special: { $ne: true },
    allowRandom: { $ne: false },
    isDinner: isDinnerMeal(mealType),
    active: true
  };
}

function normalizeBaseIngredientExclusions(values = []) {
  return dedupeIds(
    (Array.isArray(values) ? values : [])
      .map((value) => String(value || "").trim().toLowerCase())
      .filter(Boolean)
  );
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
  const isCurrentCook = day?.cookUserId && isSelfAssignment(req, day.cookUserId);

  if (clearsMainDish || clearsSideDish) {
    return !isCurrentCook;
  }
  return false;
}

function isActiveMember(member) {
  return member?.active !== false;
}

function normalizeMealType(value) {
  return String(value || "").toLowerCase() === "dinner" ? "dinner" : "lunch";
}

function isDinnerMeal(mealType) {
  return normalizeMealType(mealType) === "dinner";
}

function dayMealType(day) {
  return day?.mealType === "dinner" ? "dinner" : "lunch";
}

function canAutoAssignCook(member, mealType = "lunch") {
  const isPlaceholder = member?.isPlaceholder || member?.type === "placeholder";
  const canCook = isDinnerMeal(mealType)
    ? (typeof member?.dinnerCanCook === "boolean" ? member.dinnerCanCook : !isPlaceholder)
    : (typeof member?.canCook === "boolean" ? member.canCook : !isPlaceholder);
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

function isDefaultAttendee(member, mealType = "lunch") {
  if (!isActiveMember(member)) return false;
  if (isDinnerMeal(mealType)) return member?.dinnerActive !== false;
  return true;
}

function buildDefaultAttendeeIds(members = [], mealType = "lunch") {
  return dedupeIds(
    members
      .filter((member) => isDefaultAttendee(member, mealType))
      .map((member) => member?._id)
  );
}

function dishCategoryKey(dish) {
  if (!dish?.dishCategoryId) return "";
  return String(dish.dishCategoryId);
}

async function resolveExcludedGuarnicionesCategoryIds(dishes = []) {
  const categoryIds = dedupeIds(
    dishes
      .map((dish) => dishCategoryKey(dish))
      .filter(Boolean)
  );
  if (!categoryIds.length) return new Set();
  const categories = await KitchenDishCategory.find({
    _id: { $in: categoryIds },
    code: "guarniciones"
  })
    .select("_id")
    .lean();
  return new Set(categories.map((category) => String(category._id)));
}

function resolveDayAttendeeIds(day, defaultAttendeeIds = [], mealType = "lunch") {
  const normalizedMeal = normalizeMealType(mealType);
  const dayType = dayMealType(day);
  if (dayType !== normalizedMeal) {
    return [...defaultAttendeeIds];
  }
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
    .select("_id active canCook dinnerActive dinnerCanCook isPlaceholder type")
    .lean();
}

async function hydrateLeftoversDishNames(plan, effectiveHouseholdId) {
  if (!plan) return;
  const leftoversDishIds = dedupeIds(
    (plan.days || [])
      .map((day) => day?.leftoversSourceDishId)
      .filter(Boolean)
  );
  if (!leftoversDishIds.length) return;
  const dishes = await resolveDishCatalogForHousehold({
    Model: KitchenDish,
    householdId: effectiveHouseholdId,
    ids: leftoversDishIds
  });
  const nameById = new Map(dishes.map((dish) => [String(dish._id), dish.name]));
  for (const day of plan.days || []) {
    if (!day?.leftoversSourceDishId) continue;
    day.leftoversSourceDishName = nameById.get(String(day.leftoversSourceDishId)) || null;
  }
}

function findDayByDateAndMeal(plan, date, mealType = "lunch") {
  return (plan?.days || []).find(
    (item) => isSameDay(item.date, date) && dayMealType(item) === normalizeMealType(mealType)
  );
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

async function getRecentWeeksDishIds(effectiveHouseholdId, monday, weeks, mealType = "lunch") {
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
      if (dayMealType(day) !== normalizeMealType(mealType)) continue;
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
      for (const day of plan.days || []) {
        const mealType = dayMealType(day);
        const defaultAttendeeIds = buildDefaultAttendeeIds(members, mealType);
        const attendeeIds = resolveDayAttendeeIds(day, defaultAttendeeIds, mealType);
        applyAttendeesToDay(day, attendeeIds);
      }
      await hydrateLeftoversDishNames(plan, effectiveHouseholdId);
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
    const mealType = normalizeMealType(req.query?.mealType || req.body?.mealType || "lunch");

    const day = findDayByDateAndMeal(plan, date, mealType);
    if (!day) return res.status(404).json({ ok: false, error: "Dia fuera de la semana." });

    const {
      cookUserId,
      cookTiming,
      servings,
      mainDishId,
      sideDishId,
      ingredientOverrides,
      attendeeIds,
      baseIngredientExclusions,
      includeMainIngredients,
      includeSideIngredients,
      isLeftovers,
      leftoversSourceDate,
      leftoversSourceMealType,
      leftoversSourceDishId
    } = req.body;

    const invalidIdMessage =
      validateObjectId(cookUserId, "cookUserId")
      || validateObjectId(mainDishId, "mainDishId")
      || validateObjectId(sideDishId, "sideDishId")
      || validateObjectId(leftoversSourceDishId, "leftoversSourceDishId");
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
    if (baseIngredientExclusions !== undefined && !Array.isArray(baseIngredientExclusions)) {
      return res.status(400).json({ ok: false, error: "baseIngredientExclusions debe ser una lista." });
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
      const [mainDish] = await resolveDishCatalogForHousehold({
        Model: KitchenDish,
        householdId: effectiveHouseholdId,
        ids: [mainDishId],
        filter: {
          sidedish: { $ne: true },
          isDinner: isDinnerMeal(mealType),
          active: true
        }
      });
      if (!mainDish) {
        return res.status(400).json({ ok: false, error: "El plato principal no pertenece a este hogar." });
      }
    }

    if (sideDishId) {
      const [sideDish] = await resolveDishCatalogForHousehold({
        Model: KitchenDish,
        householdId: effectiveHouseholdId,
        ids: [sideDishId],
        filter: {
          sidedish: true,
          isDinner: isDinnerMeal(mealType),
          active: true
        }
      });
      if (!sideDish) {
        return res.status(400).json({ ok: false, error: "La guarnicion no pertenece a este hogar." });
      }
    }

    const members = await loadHouseholdMembers(effectiveHouseholdId);
    const validMemberIdSet = new Set(dedupeIds(members.map((member) => member._id)));
    const defaultAttendeeIds = buildDefaultAttendeeIds(members, mealType);
    const nextAttendeeIds = Array.isArray(attendeeIds)
      ? dedupeIds(attendeeIds)
      : resolveDayAttendeeIds(day, defaultAttendeeIds, mealType);
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
    if (typeof includeMainIngredients === "boolean") {
      day.includeMainIngredients = includeMainIngredients;
    }
    if (typeof includeSideIngredients === "boolean") {
      day.includeSideIngredients = includeSideIngredients;
    }
    if (mainDishId) {
      day.isLeftovers = false;
      day.leftoversSourceDate = null;
      day.leftoversSourceMealType = null;
      day.leftoversSourceDishId = null;
      day.leftoversSourceDishName = null;
      if (isDinnerMeal(mealType) && typeof includeMainIngredients !== "boolean") {
        day.includeMainIngredients = false;
      }
    }
    if (sideDishId && isDinnerMeal(mealType) && typeof includeSideIngredients !== "boolean") {
      day.includeSideIngredients = false;
    }
    if (typeof isLeftovers === "boolean" && isDinnerMeal(mealType)) {
      day.isLeftovers = isLeftovers;
    }
    if (!isDinnerMeal(mealType)) {
      day.isLeftovers = false;
      day.leftoversSourceDate = null;
      day.leftoversSourceMealType = null;
      day.leftoversSourceDishId = null;
      day.leftoversSourceDishName = null;
    } else if (day.isLeftovers) {
      day.leftoversSourceDate = leftoversSourceDate ? parseISODate(leftoversSourceDate) : null;
      day.leftoversSourceMealType = leftoversSourceMealType ? normalizeMealType(leftoversSourceMealType) : null;
      day.leftoversSourceDishId = leftoversSourceDishId || null;
      if (day.leftoversSourceDishId) {
        const [sourceDish] = await resolveDishCatalogForHousehold({
          Model: KitchenDish,
          householdId: effectiveHouseholdId,
          ids: [day.leftoversSourceDishId],
          filter: { active: true }
        });
        day.leftoversSourceDishName = sourceDish?.name || null;
      } else {
        day.leftoversSourceDishName = null;
      }
      day.mainDishId = day.leftoversSourceDishId || null;
      day.includeMainIngredients = false;
      if (typeof includeSideIngredients !== "boolean") {
        day.includeSideIngredients = false;
      }
      day.ingredientOverrides = [];
      day.baseIngredientExclusions = [];
    } else if (Object.prototype.hasOwnProperty.call(req.body || {}, "isLeftovers")) {
      day.leftoversSourceDate = null;
      day.leftoversSourceMealType = null;
      day.leftoversSourceDishId = null;
      day.leftoversSourceDishName = null;
    }
    if (Array.isArray(ingredientOverrides)) day.ingredientOverrides = normalizeIngredientOverrides(ingredientOverrides);
    if (Array.isArray(baseIngredientExclusions)) {
      day.baseIngredientExclusions = normalizeBaseIngredientExclusions(baseIngredientExclusions);
      if (process.env.NODE_ENV !== "production") {
        console.debug("[kitchen][weeks][update-day] base exclusions", {
          day: req.params.date,
          baseIngredientExclusions: day.baseIngredientExclusions
        });
      }
    }
    applyAttendeesToDay(day, nextAttendeeIds);

    await plan.save();
    await hydrateLeftoversDishNames(plan, effectiveHouseholdId);
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
    const mealType = normalizeMealType(req.query?.mealType || req.body?.mealType || "lunch");
    const day = findDayByDateAndMeal(plan, date, mealType);
    if (!day) return res.status(404).json({ ok: false, error: "Dia fuera de la semana." });

    const members = await loadHouseholdMembers(effectiveHouseholdId);
    const defaultAttendeeIds = buildDefaultAttendeeIds(members, mealType);
    const selfId = String(req.kitchenUser?._id || "");
    const nextAttendeeIds = resolveDayAttendeeIds(day, defaultAttendeeIds, mealType);
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
    const mealType = normalizeMealType(req.query?.mealType || req.body?.mealType || "lunch");
    const day = findDayByDateAndMeal(plan, date, mealType);
    if (!day) return res.status(404).json({ ok: false, error: "Día fuera de la semana." });

    const isAdmin = isHouseholdAdmin(req.kitchenUser);
    const isSelf = day.cookUserId && String(day.cookUserId) === String(req.kitchenUser?._id);
    if (day.cookUserId && !isAdmin && !isSelf) {
      return res.status(403).json({
        ok: false,
        error: "Solo owner/admin puede reasignar a otros usuarios o quitar platos del día."
      });
    }

    const previouslyAssignedDishIds = plan.days
      .filter((entry) => dayMealType(entry) === mealType && !isSameDay(entry.date, date))
      .map((entry) => entry?.mainDishId)
      .filter(Boolean)
      .map((dishId) => String(dishId));
    const usedMainDishIds = new Set(previouslyAssignedDishIds);

    const allEligibleRaw = await resolveDishCatalogForHousehold({
      Model: KitchenDish,
      householdId: effectiveHouseholdId,
      filter: buildRandomizableMainDishFilter(mealType)
    });
    const excludedGuarnicionesCategoryIds = await resolveExcludedGuarnicionesCategoryIds(allEligibleRaw);
    const allEligible = allEligibleRaw.filter((dish) => {
      const categoryId = dishCategoryKey(dish);
      return !categoryId || !excludedGuarnicionesCategoryIds.has(categoryId);
    });
    if (!allEligible.length) {
      const allVisible = await resolveDishCatalogForHousehold({
        Model: KitchenDish,
        householdId: effectiveHouseholdId,
        filter: buildRandomizableMainDishFilter(mealType)
      });
      const allVisibleCount = allVisible.length;
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
      ? await getRecentWeeksDishIds(effectiveHouseholdId, monday, avoidRepeatsWeeks, mealType)
      : new Set();

    const previouslyAssignedDishes = previouslyAssignedDishIds.length
      ? await resolveDishCatalogForHousehold({
          Model: KitchenDish,
          householdId: effectiveHouseholdId,
          ids: previouslyAssignedDishIds
        })
      : [];
    const usedCategoryIds = new Set(
      previouslyAssignedDishes
        .map((dish) => dishCategoryKey(dish))
        .filter(Boolean)
    );

    const candidatesNoDishRepeat = allEligible.filter((dish) => !usedMainDishIds.has(String(dish._id)));
    const candidatesNoDishAndCategoryAndRecent = candidatesNoDishRepeat.filter((dish) => {
      const categoryId = dishCategoryKey(dish);
      if (categoryId && usedCategoryIds.has(categoryId)) return false;
      return !recentDishIds.has(String(dish._id));
    });
    const candidatesNoDishAndCategory = candidatesNoDishRepeat.filter((dish) => {
      const categoryId = dishCategoryKey(dish);
      return !categoryId || !usedCategoryIds.has(categoryId);
    });
    const candidatesNoDishAndRecent = candidatesNoDishRepeat.filter((dish) => !recentDishIds.has(String(dish._id)));

    if (candidatesNoDishAndCategoryAndRecent.length) {
      const dish = pickRandomItem(candidatesNoDishAndCategoryAndRecent);
      return res.json({
        ok: true,
        dish,
        reason: null
      });
    }

    if (candidatesNoDishAndCategory.length) {
      const dish = pickRandomItem(candidatesNoDishAndCategory);
      return res.json({
        ok: true,
        dish,
        reason: avoidRepeatsEnabled ? "avoid_repeats_relaxed" : null
      });
    }

    if (candidatesNoDishAndRecent.length) {
      const dish = pickRandomItem(candidatesNoDishAndRecent);
      return res.json({
        ok: true,
        dish,
        reason: "category_relaxed"
      });
    }

    if (candidatesNoDishRepeat.length) {
      const dish = pickRandomItem(candidatesNoDishRepeat);
      return res.json({
        ok: true,
        dish,
        reason: avoidRepeatsEnabled ? "avoid_repeats_relaxed" : "category_relaxed"
      });
    }

    if (!candidatesNoDishRepeat.length) {
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
    const mealType = normalizeMealType(req.query?.mealType || req.body?.mealType || "lunch");

    const targetDays = overwriteAll
      ? plan.days.filter((day) => dayMealType(day) === mealType)
      : plan.days.filter((day) => dayMealType(day) === mealType && !day.mainDishId && !day.isLeftovers);

    if (!targetDays.length) {
      return res.json({
        ok: true,
        plan,
        assignedCount: 0,
        targetCount: 0,
        insufficient: false
      });
    }

    const alreadyAssignedDishIds = plan.days
      .filter((day) => dayMealType(day) === mealType && !targetDays.includes(day))
      .map((day) => day?.mainDishId)
      .filter(Boolean)
      .map((dishId) => String(dishId));
    const usedInCurrentWeek = new Set(alreadyAssignedDishIds);

    const candidatesRaw = await resolveDishCatalogForHousehold({
      Model: KitchenDish,
      householdId: effectiveHouseholdId,
      filter: buildRandomizableMainDishFilter(mealType)
    });
    const excludedGuarnicionesCategoryIds = await resolveExcludedGuarnicionesCategoryIds(candidatesRaw);
    const candidates = candidatesRaw.filter((dish) => {
      const categoryId = dishCategoryKey(dish);
      return !categoryId || !excludedGuarnicionesCategoryIds.has(categoryId);
    });

    const allDishIds = candidates.map((dish) => String(dish._id));
    const candidateById = new Map(candidates.map((dish) => [String(dish._id), dish]));
    if (!allDishIds.length) {
      const allVisible = await resolveDishCatalogForHousehold({
        Model: KitchenDish,
        householdId: effectiveHouseholdId,
        filter: buildRandomizableMainDishFilter(mealType)
      });
      const allVisibleCount = allVisible.length;
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
      ? await getRecentWeeksDishIds(effectiveHouseholdId, monday, avoidRepeatsWeeks, mealType)
      : new Set();

    const alreadyAssignedDishes = alreadyAssignedDishIds.length
      ? await resolveDishCatalogForHousehold({
          Model: KitchenDish,
          householdId: effectiveHouseholdId,
          ids: alreadyAssignedDishIds
        })
      : [];
    const usedCategoryIds = new Set(
      alreadyAssignedDishes
        .map((dish) => dishCategoryKey(dish))
        .filter(Boolean)
    );

    const randomizedDays = shuffleArray([...targetDays]);
    let assignedCount = 0;
    let relaxedCrossWeekRule = false;
    let relaxedCategoryRule = false;
    let relaxedSameWeekRule = false;
    const members = await loadHouseholdMembers(effectiveHouseholdId);
    const defaultAttendeeIds = buildDefaultAttendeeIds(members, mealType);
    const uniqueDishCapacity = allDishIds.filter((dishId) => !usedInCurrentWeek.has(dishId)).length;
    const mustKeepSameWeekUnique = uniqueDishCapacity >= targetDays.length;

    for (const day of randomizedDays) {
      const baseEligible = candidates.filter((dish) => !usedInCurrentWeek.has(String(dish._id)));
      const groupA = baseEligible.filter((dish) => {
        const categoryId = dishCategoryKey(dish);
        if (categoryId && usedCategoryIds.has(categoryId)) return false;
        return !recentDishIds.has(String(dish._id));
      });
      const groupB = baseEligible.filter((dish) => {
        const categoryId = dishCategoryKey(dish);
        return !categoryId || !usedCategoryIds.has(categoryId);
      });
      const groupC = baseEligible.filter((dish) => !recentDishIds.has(String(dish._id)));

      let pickedDishId = null;
      if (groupA.length) {
        pickedDishId = String(pickRandomItem(groupA)?._id || "");
      } else if (groupB.length) {
        pickedDishId = String(pickRandomItem(groupB)?._id || "");
        if (avoidRepeatsEnabled) relaxedCrossWeekRule = true;
      } else if (groupC.length) {
        pickedDishId = String(pickRandomItem(groupC)?._id || "");
        relaxedCategoryRule = true;
      } else if (baseEligible.length) {
        pickedDishId = String(pickRandomItem(baseEligible)?._id || "");
        relaxedCategoryRule = true;
        if (avoidRepeatsEnabled) relaxedCrossWeekRule = true;
      } else {
        if (mustKeepSameWeekUnique) {
          continue;
        }
        pickedDishId = String(pickRandomItem(candidates)?._id || "");
        if (pickedDishId) {
          relaxedCategoryRule = true;
          if (avoidRepeatsEnabled) relaxedCrossWeekRule = true;
          relaxedSameWeekRule = true;
        }
      }

      if (!pickedDishId) continue;

      day.mainDishId = pickedDishId;
      day.isLeftovers = false;
      day.leftoversSourceDate = null;
      day.leftoversSourceMealType = null;
      day.leftoversSourceDishId = null;
      day.leftoversSourceDishName = null;
      day.includeMainIngredients = isDinnerMeal(mealType) ? false : true;
      day.includeSideIngredients = isDinnerMeal(mealType) ? false : true;
      applyAttendeesToDay(day, resolveDayAttendeeIds(day, defaultAttendeeIds, mealType));
      usedInCurrentWeek.add(pickedDishId);
      const pickedCategoryId = dishCategoryKey(candidateById.get(pickedDishId));
      if (pickedCategoryId) {
        usedCategoryIds.add(pickedCategoryId);
      }
      assignedCount += 1;
    }

    const userPool = shuffleArray(
      members
        .filter((member) => canAutoAssignCook(member, mealType))
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
    if (relaxedCategoryRule) {
      warnings.push(
        "No se pudo evitar repetir categorías de plato en toda la semana por falta de variedad disponible. Se aplicó la regla hasta donde fue posible."
      );
      warningCodes.push("category_variety_relaxed");
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
      mealType: dayMealType(day),
      cookUserId: day.cookUserId,
      attendeeIds: Array.isArray(day.attendeeIds) ? dedupeIds(day.attendeeIds) : undefined,
      attendeeCount: Array.isArray(day.attendeeIds)
        ? dedupeIds(day.attendeeIds).length
        : (typeof day.attendeeCount === "number" ? day.attendeeCount : undefined),
      cookTiming: day.cookTiming,
      servings: day.servings,
      mainDishId: day.mainDishId,
      includeMainIngredients: typeof day.includeMainIngredients === "boolean"
        ? day.includeMainIngredients
        : (dayMealType(day) === "dinner" ? false : true),
      sideDishId: day.sideDishId,
      includeSideIngredients: typeof day.includeSideIngredients === "boolean"
        ? day.includeSideIngredients
        : (dayMealType(day) === "dinner" ? false : true),
      isLeftovers: Boolean(day.isLeftovers),
      leftoversSourceDate: day.leftoversSourceDate || null,
      leftoversSourceMealType: day.leftoversSourceMealType || null,
      leftoversSourceDishId: day.leftoversSourceDishId || null,
      leftoversSourceDishName: day.leftoversSourceDishName || null,
      ingredientOverrides: day.ingredientOverrides,
      baseIngredientExclusions: day.baseIngredientExclusions
    }));

    await targetPlan.save();
    const ensuredTargetPlan = await ensureWeekPlan(monday, effectiveHouseholdId);
    const warning = await rebuildShoppingListBestEffort({
      monday,
      effectiveHouseholdId,
      context: "copy-week"
    });
    return res.json({ ok: true, plan: ensuredTargetPlan, ...(warning ? { warning } : {}) });
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

router.get("/:weekStart/day/:date/leftovers", requireAuth, async (req, res) => {
  try {
    const weekStart = parseISODate(req.params.weekStart);
    const date = parseISODate(req.params.date);
    if (!weekStart || !date) return res.status(400).json({ ok: false, error: "Fecha invalida." });

    const mealType = normalizeMealType(req.query?.mealType || "dinner");
    if (!isDinnerMeal(mealType)) {
      return res.status(400).json({ ok: false, error: "Las sobras solo aplican a cenas." });
    }

    const effectiveHouseholdId = getEffectiveHouseholdId(req.user);
    const monday = getWeekStart(weekStart);
    await ensureWeekPlan(monday, effectiveHouseholdId);

    const endDate = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
    const startDate = new Date(endDate);
    startDate.setUTCDate(startDate.getUTCDate() - 7);
    const fromWeek = getWeekStart(startDate);

    const plans = await KitchenWeekPlan.find(
      buildScopedFilter(effectiveHouseholdId, { weekStart: { $gte: fromWeek, $lte: monday } })
    )
      .select("weekStart days.date days.mainDishId days.mealType days.isLeftovers")
      .lean();

    const candidateDays = [];
    const dishIds = new Set();
    for (const plan of plans) {
      for (const day of plan.days || []) {
        const dayDate = day?.date ? new Date(day.date) : null;
        if (!dayDate) continue;
        if (dayDate < startDate || dayDate > endDate) continue;
        if (!day?.mainDishId) continue;
        if (day?.isLeftovers) continue;
        const dishId = String(day.mainDishId);
        dishIds.add(dishId);
        candidateDays.push({
          date: dayDate.toISOString().slice(0, 10),
          mealType: dayMealType(day),
          mainDishId: dishId
        });
      }
    }

    const dishes = dishIds.size
      ? await resolveDishCatalogForHousehold({
          Model: KitchenDish,
          householdId: effectiveHouseholdId,
          ids: Array.from(dishIds)
        })
      : [];
    const dishNameById = new Map(dishes.map((dish) => [String(dish._id), dish.name]));

    const leftovers = candidateDays
      .map((item) => ({
        ...item,
        dishName: dishNameById.get(item.mainDishId) || "Plato"
      }))
      .sort((a, b) => String(b.date).localeCompare(String(a.date)));

    return res.json({ ok: true, leftovers });
  } catch (error) {
    const handled = handleHouseholdError(res, error);
    if (handled) return handled;
    logKitchenError("list-leftovers", error, {
      weekStart: req.params.weekStart,
      date: req.params.date,
      userId: String(req.kitchenUser?._id || "")
    });
    return res.status(500).json({ ok: false, error: "No se pudieron cargar las sobras disponibles." });
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
    const mealType = normalizeMealType(req.query?.mealType || req.body?.mealType || "lunch");
    const sourceDay = findDayByDateAndMeal(plan, sourceDate, mealType);
    const targetDay = findDayByDateAndMeal(plan, targetDate, mealType);

    if (!sourceDay || !targetDay) {
      return res.status(404).json({ ok: false, error: "No encontramos los días de origen o destino en esa semana." });
    }

    const cloneIngredientOverrides = (items = []) => (
      Array.isArray(items)
        ? items.map((item) => ({
          displayName: item.displayName,
          canonicalName: item.canonicalName,
          ...(item.ingredientId ? { ingredientId: item.ingredientId } : {})
        }))
        : []
    );
    const cloneAttendeeIds = (items = []) => (
      Array.isArray(items) ? dedupeIds(items) : []
    );

    const sourceSnapshot = {
      cookUserId: sourceDay.cookUserId || null,
      mealType: dayMealType(sourceDay),
      cookTiming: sourceDay.cookTiming || "previous_day",
      servings: sourceDay.servings || 4,
      mainDishId: sourceDay.mainDishId || null,
      includeMainIngredients: typeof sourceDay.includeMainIngredients === "boolean"
        ? sourceDay.includeMainIngredients
        : (dayMealType(sourceDay) === "dinner" ? false : true),
      sideDishId: sourceDay.sideDishId || null,
      includeSideIngredients: typeof sourceDay.includeSideIngredients === "boolean"
        ? sourceDay.includeSideIngredients
        : (dayMealType(sourceDay) === "dinner" ? false : true),
      isLeftovers: Boolean(sourceDay.isLeftovers),
      leftoversSourceDate: sourceDay.leftoversSourceDate || null,
      leftoversSourceMealType: sourceDay.leftoversSourceMealType || null,
      leftoversSourceDishId: sourceDay.leftoversSourceDishId || null,
      leftoversSourceDishName: sourceDay.leftoversSourceDishName || null,
      ingredientOverrides: cloneIngredientOverrides(sourceDay.ingredientOverrides),
      baseIngredientExclusions: normalizeBaseIngredientExclusions(sourceDay.baseIngredientExclusions),
      attendeeIds: cloneAttendeeIds(sourceDay.attendeeIds)
    };
    const targetSnapshot = {
      cookUserId: targetDay.cookUserId || null,
      mealType: dayMealType(targetDay),
      cookTiming: targetDay.cookTiming || "previous_day",
      servings: targetDay.servings || 4,
      mainDishId: targetDay.mainDishId || null,
      includeMainIngredients: typeof targetDay.includeMainIngredients === "boolean"
        ? targetDay.includeMainIngredients
        : (dayMealType(targetDay) === "dinner" ? false : true),
      sideDishId: targetDay.sideDishId || null,
      includeSideIngredients: typeof targetDay.includeSideIngredients === "boolean"
        ? targetDay.includeSideIngredients
        : (dayMealType(targetDay) === "dinner" ? false : true),
      isLeftovers: Boolean(targetDay.isLeftovers),
      leftoversSourceDate: targetDay.leftoversSourceDate || null,
      leftoversSourceMealType: targetDay.leftoversSourceMealType || null,
      leftoversSourceDishId: targetDay.leftoversSourceDishId || null,
      leftoversSourceDishName: targetDay.leftoversSourceDishName || null,
      ingredientOverrides: cloneIngredientOverrides(targetDay.ingredientOverrides),
      baseIngredientExclusions: normalizeBaseIngredientExclusions(targetDay.baseIngredientExclusions),
      attendeeIds: cloneAttendeeIds(targetDay.attendeeIds)
    };

    sourceDay.cookUserId = targetSnapshot.cookUserId;
    sourceDay.cookTiming = targetSnapshot.cookTiming;
    sourceDay.servings = targetSnapshot.servings;
    sourceDay.mainDishId = targetSnapshot.mainDishId;
    sourceDay.includeMainIngredients = targetSnapshot.includeMainIngredients;
    sourceDay.sideDishId = targetSnapshot.sideDishId;
    sourceDay.includeSideIngredients = targetSnapshot.includeSideIngredients;
    sourceDay.isLeftovers = targetSnapshot.isLeftovers;
    sourceDay.leftoversSourceDate = targetSnapshot.leftoversSourceDate;
    sourceDay.leftoversSourceMealType = targetSnapshot.leftoversSourceMealType;
    sourceDay.leftoversSourceDishId = targetSnapshot.leftoversSourceDishId;
    sourceDay.leftoversSourceDishName = targetSnapshot.leftoversSourceDishName;
    sourceDay.ingredientOverrides = targetSnapshot.ingredientOverrides;
    sourceDay.baseIngredientExclusions = targetSnapshot.baseIngredientExclusions;
    applyAttendeesToDay(sourceDay, targetSnapshot.attendeeIds);

    targetDay.cookUserId = sourceSnapshot.cookUserId;
    targetDay.cookTiming = sourceSnapshot.cookTiming;
    targetDay.servings = sourceSnapshot.servings;
    targetDay.mainDishId = sourceSnapshot.mainDishId;
    targetDay.includeMainIngredients = sourceSnapshot.includeMainIngredients;
    targetDay.sideDishId = sourceSnapshot.sideDishId;
    targetDay.includeSideIngredients = sourceSnapshot.includeSideIngredients;
    targetDay.isLeftovers = sourceSnapshot.isLeftovers;
    targetDay.leftoversSourceDate = sourceSnapshot.leftoversSourceDate;
    targetDay.leftoversSourceMealType = sourceSnapshot.leftoversSourceMealType;
    targetDay.leftoversSourceDishId = sourceSnapshot.leftoversSourceDishId;
    targetDay.leftoversSourceDishName = sourceSnapshot.leftoversSourceDishName;
    targetDay.ingredientOverrides = sourceSnapshot.ingredientOverrides;
    targetDay.baseIngredientExclusions = sourceSnapshot.baseIngredientExclusions;
    applyAttendeesToDay(targetDay, sourceSnapshot.attendeeIds);

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
    for (const day of plan.days || []) {
      const mealType = dayMealType(day);
      const defaultAttendeeIds = buildDefaultAttendeeIds(members, mealType);
      applyAttendeesToDay(day, resolveDayAttendeeIds(day, defaultAttendeeIds, mealType));
    }
    const dishIds = plan.days.flatMap((day) => [day.mainDishId, day.sideDishId, day.leftoversSourceDishId]).filter(Boolean);
    const dishes = await resolveDishCatalogForHousehold({
      Model: KitchenDish,
      householdId: effectiveHouseholdId,
      ids: dishIds
    });

    res.json({ ok: true, weekStart: formatDateISO(monday), plan, dishes });
  } catch (error) {
    const handled = handleHouseholdError(res, error);
    if (handled) return handled;
    return res.status(500).json({ ok: false, error: "No se pudo cargar el resumen semanal." });
  }
});

export default router;


