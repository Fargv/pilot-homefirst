import { KitchenWeekPlan } from "./models/KitchenWeekPlan.js";
import { KitchenUser } from "./models/KitchenUser.js";
import { Household } from "./models/Household.js";
import { buildScopedFilter } from "./householdScope.js";
import { formatDateISO, getWeekStart } from "./utils/dates.js";
import { getScheduledWeekDates, isRemovedPlanSlot } from "./weeklySchedule.js";

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

function resetDayPlanning(day, attendeeIds = []) {
  const isDinner = day.mealType === "dinner";
  day.cookUserId = null;
  day.attendeeIds = [...attendeeIds];
  day.extraGuests = 0;
  day.attendeeCount = attendeeIds.length;
  day.cookTiming = isDinner ? "same_day" : "previous_day";
  day.servings = attendeeIds.length;
  day.mainDishId = null;
  day.includeMainIngredients = !isDinner;
  day.sideDishId = null;
  day.includeSideIngredients = !isDinner;
  day.isLeftovers = false;
  day.leftoversSourceDate = null;
  day.leftoversSourceMealType = null;
  day.leftoversSourceDishId = null;
  day.leftoversSourceDishName = null;
  day.ingredientOverrides = [];
  day.baseIngredientExclusions = [];
  return day;
}

export function resetScheduledMealSlots(plan, mealType, scheduledDates, attendeeIds = []) {
  const existingByDate = new Map(
    (plan.days || [])
      .filter((day) => day.mealType === mealType && day.date)
      .map((day) => [formatDateISO(new Date(day.date)), day])
  );

  for (const date of scheduledDates) {
    const dateKey = formatDateISO(date);
    const existingDay = existingByDate.get(dateKey);
    if (existingDay) {
      resetDayPlanning(existingDay, attendeeIds);
      continue;
    }
    if (isRemovedPlanSlot(plan, date, mealType)) continue;
    const [slot] = buildDefaultDays(getWeekStart(date), attendeeIds, mealType, [
      ["sun", "mon", "tue", "wed", "thu", "fri", "sat"][date.getUTCDay()]
    ]);
    plan.days.push(slot);
  }

  // Reset applies to the scheduled slots. Manually added slots outside the
  // household agenda keep their dishes, attendees, and assignments intact.
  return plan;
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

export async function addPendingDinnerSlotsToUpcomingPlans(
  effectiveHouseholdId,
  { explicitlyActivated = false, fromDate = new Date() } = {}
) {
  if (!explicitlyActivated) return { updatedPlans: 0, createdSlots: 0 };
  const fromWeekStart = getWeekStart(fromDate);
  const household = await Household.findById(effectiveHouseholdId)
    .select("dinnersEnabled dinnersIncludeInShopping weeklySchedule")
    .lean();
  if (!household?.dinnersEnabled) return { updatedPlans: 0, createdSlots: 0 };

  const members = await KitchenUser.find(buildScopedFilter(effectiveHouseholdId, {}))
    .select("_id active dinnerActive")
    .lean();
  const dinnerAttendeeIds = members
    .filter((member) => isActiveMember(member) && getMemberDinnerActive(member))
    .map((member) => String(member._id))
    .filter(Boolean);
  const plans = await KitchenWeekPlan.find(buildScopedFilter(effectiveHouseholdId, {
    weekStart: { $gte: fromWeekStart }
  }))
    .sort({ weekStart: 1 })
    .select("_id weekStart days removedSlots")
    .lean();

  let updatedPlans = 0;
  let createdSlots = 0;
  for (const plan of plans) {
    let planChanged = false;
    const dinnerDates = getScheduledWeekDates(plan.weekStart, household.weeklySchedule?.dinnerDays);
    for (const date of dinnerDates) {
      const dateKey = formatDateISO(date);
      const alreadyExists = (plan.days || []).some((day) =>
        day?.mealType === "dinner" && day?.date && formatDateISO(new Date(day.date)) === dateKey
      );
      if (alreadyExists || isRemovedPlanSlot(plan, date, "dinner")) continue;

      const slot = {
        date,
        mealType: "dinner",
        attendeeIds: [...dinnerAttendeeIds],
        extraGuests: 0,
        attendeeCount: dinnerAttendeeIds.length,
        cookTiming: "same_day",
        servings: dinnerAttendeeIds.length,
        includeMainIngredients: Boolean(household.dinnersIncludeInShopping),
        includeSideIngredients: Boolean(household.dinnersIncludeInShopping),
        ingredientOverrides: []
      };
      const result = await KitchenWeekPlan.updateOne(
        buildScopedFilter(effectiveHouseholdId, {
          _id: plan._id,
          days: { $not: { $elemMatch: { date, mealType: "dinner" } } },
          removedSlots: { $not: { $elemMatch: { date, mealType: "dinner" } } }
        }),
        { $push: { days: slot } }
      );
      if (!result.modifiedCount) continue;
      createdSlots += 1;
      planChanged = true;
    }
    if (planChanged) updatedPlans += 1;
  }

  return { updatedPlans, createdSlots };
}
