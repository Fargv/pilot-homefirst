import { KitchenWeekPlan } from "./models/KitchenWeekPlan.js";
import { KitchenUser } from "./models/KitchenUser.js";
import { Household } from "./models/Household.js";
import { buildScopedFilter } from "./householdScope.js";
import { getWeekDates } from "./utils/dates.js";

function isActiveMember(member) {
  return member?.active !== false;
}

function buildDefaultAttendeeIds(members = []) {
  return members
    .filter((member) => isActiveMember(member))
    .map((member) => String(member._id))
    .filter(Boolean);
}

function getMemberDinnerActive(member) {
  return member?.dinnerActive !== false;
}

function buildDefaultDays(weekStartDate, attendeeIds = [], mealType = "lunch") {
  const isDinner = mealType === "dinner";
  return getWeekDates(weekStartDate).map((date) => ({
    date,
    mealType,
    attendeeIds: [...attendeeIds],
    attendeeCount: attendeeIds.length,
    cookTiming: "previous_day",
    servings: 4,
    includeMainIngredients: !isDinner,
    includeSideIngredients: !isDinner,
    ingredientOverrides: []
  }));
}

function isDuplicateKeyError(error) {
  return error?.code === 11000;
}

function dayMatchesMeal(day, mealType) {
  const normalized = day?.mealType === "dinner" ? "dinner" : "lunch";
  return normalized === mealType;
}

function hasMealSlot(plan, date, mealType) {
  return (plan.days || []).some(
    (day) => day?.date && new Date(day.date).getTime() === new Date(date).getTime() && dayMatchesMeal(day, mealType)
  );
}

async function ensureDinnerSlotsIfEnabled(plan, effectiveHouseholdId) {
  const household = await Household.findById(effectiveHouseholdId)
    .select("dinnersEnabled")
    .lean();
  if (!household?.dinnersEnabled) return plan;

  const members = await KitchenUser.find(buildScopedFilter(effectiveHouseholdId, {}))
    .select("_id active dinnerActive")
    .lean();
  const dinnerAttendees = members
    .filter((member) => isActiveMember(member) && getMemberDinnerActive(member))
    .map((member) => String(member._id))
    .filter(Boolean);

  const weekDates = getWeekDates(plan.weekStart);
  let changed = false;
  for (const date of weekDates) {
    if (hasMealSlot(plan, date, "dinner")) continue;
    plan.days.push({
      date,
      mealType: "dinner",
      attendeeIds: [...dinnerAttendees],
      attendeeCount: dinnerAttendees.length,
      cookTiming: "same_day",
      servings: 4,
      includeMainIngredients: false,
      includeSideIngredients: false,
      ingredientOverrides: []
    });
    changed = true;
  }

  if (changed) {
    plan.days.sort((a, b) => {
      const leftDate = new Date(a.date).getTime();
      const rightDate = new Date(b.date).getTime();
      if (leftDate !== rightDate) return leftDate - rightDate;
      const leftMeal = dayMatchesMeal(a, "dinner") ? 1 : 0;
      const rightMeal = dayMatchesMeal(b, "dinner") ? 1 : 0;
      return leftMeal - rightMeal;
    });
    await plan.save();
  }
  return plan;
}

export async function createOrGetWeekPlan(weekStartDate, effectiveHouseholdId) {
  const filter = buildScopedFilter(effectiveHouseholdId, { weekStart: weekStartDate });
  const existingPlan = await KitchenWeekPlan.findOne(filter);
  if (existingPlan) {
    const hydrated = await ensureDinnerSlotsIfEnabled(existingPlan, effectiveHouseholdId);
    return { plan: hydrated, created: false };
  }

  try {
    const members = await KitchenUser.find(buildScopedFilter(effectiveHouseholdId, {}))
      .select("_id active dinnerActive")
      .lean();
    const lunchAttendeeIds = buildDefaultAttendeeIds(members);
    const dinnerAttendeeIds = members
      .filter((member) => isActiveMember(member) && getMemberDinnerActive(member))
      .map((member) => String(member._id))
      .filter(Boolean);
    const household = await Household.findById(effectiveHouseholdId).select("dinnersEnabled").lean();
    const dinnersEnabled = Boolean(household?.dinnersEnabled);
    const days = [
      ...buildDefaultDays(weekStartDate, lunchAttendeeIds, "lunch"),
      ...(dinnersEnabled ? buildDefaultDays(weekStartDate, dinnerAttendeeIds, "dinner").map((day) => ({
        ...day,
        cookTiming: "same_day"
      })) : [])
    ];
    const createdPlan = await KitchenWeekPlan.create({
      weekStart: weekStartDate,
      householdId: effectiveHouseholdId,
      days
    });

    const hydrated = await ensureDinnerSlotsIfEnabled(createdPlan, effectiveHouseholdId);
    return { plan: hydrated, created: true };
  } catch (error) {
    if (isDuplicateKeyError(error)) {
      const concurrentPlan = await KitchenWeekPlan.findOne(filter);
      if (concurrentPlan) {
        return { plan: concurrentPlan, created: false };
      }

      const conflictError = new Error(
        "No se pudo crear el plan semanal por un conflicto de índices en la base de datos."
      );
      conflictError.code = "WEEK_PLAN_INDEX_CONFLICT";
      throw conflictError;
    }

    throw error;
  }
}

export async function ensureWeekPlan(weekStartDate, effectiveHouseholdId) {
  const { plan } = await createOrGetWeekPlan(weekStartDate, effectiveHouseholdId);
  return ensureDinnerSlotsIfEnabled(plan, effectiveHouseholdId);
}

export async function findWeekPlan(weekStartDate, effectiveHouseholdId) {
  const filter = buildScopedFilter(effectiveHouseholdId, { weekStart: weekStartDate });
  const plan = await KitchenWeekPlan.findOne(filter);
  if (!plan) return null;
  return ensureDinnerSlotsIfEnabled(plan, effectiveHouseholdId);
}
