import { KitchenWeekPlan } from "./models/KitchenWeekPlan.js";
import { KitchenUser } from "./models/KitchenUser.js";
import { Household } from "./models/Household.js";
import { buildScopedFilter } from "./householdScope.js";
import { getScheduledWeekDates } from "./weeklySchedule.js";

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

function buildDefaultDays(weekStartDate, attendeeIds = [], mealType = "lunch", scheduledDays) {
  const isDinner = mealType === "dinner";
  return getScheduledWeekDates(weekStartDate, scheduledDays).map((date) => ({
    date,
    mealType,
    attendeeIds: [...attendeeIds],
    extraGuests: 0,
    attendeeCount: attendeeIds.length,
    cookTiming: "previous_day",
    servings: attendeeIds.length,
    includeMainIngredients: !isDinner,
    includeSideIngredients: !isDinner,
    ingredientOverrides: []
  }));
}

function isDuplicateKeyError(error) {
  return error?.code === 11000;
}

export async function createOrGetWeekPlan(weekStartDate, effectiveHouseholdId) {
  const filter = buildScopedFilter(effectiveHouseholdId, { weekStart: weekStartDate });
  const existingPlan = await KitchenWeekPlan.findOne(filter);
  if (existingPlan) {
    return { plan: existingPlan, created: false };
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
    const household = await Household.findById(effectiveHouseholdId)
      .select("dinnersEnabled dinnersIncludeInShopping weeklySchedule")
      .lean();
    const dinnersEnabled = Boolean(household?.dinnersEnabled);
    const dinnerIncludeInShopping = Boolean(household?.dinnersIncludeInShopping);
    const weeklySchedule = household?.weeklySchedule;
    const days = [
      ...buildDefaultDays(weekStartDate, lunchAttendeeIds, "lunch", weeklySchedule?.lunchDays),
      ...(dinnersEnabled ? buildDefaultDays(weekStartDate, dinnerAttendeeIds, "dinner", weeklySchedule?.dinnerDays).map((day) => ({
        ...day,
        cookTiming: "same_day",
        includeMainIngredients: dinnerIncludeInShopping,
        includeSideIngredients: dinnerIncludeInShopping
      })) : [])
    ];
    const createdPlan = await KitchenWeekPlan.create({
      weekStart: weekStartDate,
      householdId: effectiveHouseholdId,
      days
    });

    return { plan: createdPlan, created: true };
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
  return plan;
}

export async function findWeekPlan(weekStartDate, effectiveHouseholdId) {
  const filter = buildScopedFilter(effectiveHouseholdId, { weekStart: weekStartDate });
  const plan = await KitchenWeekPlan.findOne(filter);
  if (!plan) return null;
  return plan;
}
