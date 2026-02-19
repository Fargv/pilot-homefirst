import { KitchenWeekPlan } from "./models/KitchenWeekPlan.js";
import { buildScopedFilter } from "./householdScope.js";
import { getWeekDates } from "./utils/dates.js";

function buildDefaultDays(weekStartDate) {
  return getWeekDates(weekStartDate).map((date) => ({
    date,
    cookTiming: "previous_day",
    servings: 4,
    ingredientOverrides: []
  }));
}

export async function ensureWeekPlan(weekStartDate, effectiveHouseholdId) {
  const filter = buildScopedFilter(effectiveHouseholdId, { weekStart: weekStartDate });

  try {
    const plan = await KitchenWeekPlan.findOneAndUpdate(
      filter,
      {
        $setOnInsert: {
          weekStart: weekStartDate,
          householdId: effectiveHouseholdId,
          days: buildDefaultDays(weekStartDate)
        }
      },
      {
        upsert: true,
        new: true
      }
    );

    return plan;
  } catch (error) {
    if (error?.code === 11000) {
      const existingPlan = await KitchenWeekPlan.findOne(filter);
      if (existingPlan) {
        return existingPlan;
      }
    }
    throw error;
  }
}

export async function findWeekPlan(weekStartDate, effectiveHouseholdId) {
  const filter = buildScopedFilter(effectiveHouseholdId, { weekStart: weekStartDate });
  return KitchenWeekPlan.findOne(filter);
}
