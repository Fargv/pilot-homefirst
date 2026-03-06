import { KitchenWeekPlan } from "./models/KitchenWeekPlan.js";
import { KitchenUser } from "./models/KitchenUser.js";
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

function buildDefaultDays(weekStartDate, attendeeIds = []) {
  return getWeekDates(weekStartDate).map((date) => ({
    date,
    attendeeIds: [...attendeeIds],
    attendeeCount: attendeeIds.length,
    cookTiming: "previous_day",
    servings: 4,
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
      .select("_id active")
      .lean();
    const attendeeIds = buildDefaultAttendeeIds(members);
    const createdPlan = await KitchenWeekPlan.create({
      weekStart: weekStartDate,
      householdId: effectiveHouseholdId,
      days: buildDefaultDays(weekStartDate, attendeeIds)
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
  return KitchenWeekPlan.findOne(filter);
}
