import { formatDateISO, getWeekDate, getWeekDates } from "./utils/dates.js";

export const WEEKDAY_IDS = Object.freeze(["mon", "tue", "wed", "thu", "fri", "sat", "sun"]);
const WEEKDAY_ID_BY_UTC_DAY = Object.freeze(["sun", "mon", "tue", "wed", "thu", "fri", "sat"]);

export function validateWeeklyScheduleDays(value) {
  if (!Array.isArray(value)) return "Debe ser una lista de días.";
  if (value.some((day) => !WEEKDAY_IDS.includes(day))) return "La lista contiene un día no válido.";
  if (new Set(value).size !== value.length) return "La lista no puede contener días duplicados.";
  return null;
}

export function getScheduledWeekDates(weekStart, scheduledDays) {
  if (!Array.isArray(scheduledDays)) return getWeekDates(weekStart);

  const selectedDays = new Set(scheduledDays);
  return Array.from({ length: 7 }, (_, offset) => getWeekDate(weekStart, offset))
    .filter((date) => selectedDays.has(WEEKDAY_ID_BY_UTC_DAY[date.getUTCDay()]));
}

export function isActualHouseholdOwner(user, household) {
  return Boolean(
    user
    && household?.ownerUserId
    && user.role === "owner"
    && String(user._id || user.id) === String(household.ownerUserId)
  );
}

export function buildWeeklyScheduleAtomicUpdate(patch) {
  const update = { $set: { "weeklySchedule.version": 1 } };
  const unset = {};
  for (const field of ["lunchDays", "dinnerDays"]) {
    if (!Object.prototype.hasOwnProperty.call(patch, field)) continue;
    const path = `weeklySchedule.${field}`;
    if (patch[field] === null) unset[path] = "";
    else update.$set[path] = [...patch[field]];
  }
  if (Object.keys(unset).length) update.$unset = unset;
  return update;
}

function isSameRemovedSlot(slot, date, mealType) {
  return slot?.date
    && slot.mealType === mealType
    && formatDateISO(new Date(slot.date)) === formatDateISO(new Date(date));
}

export function isRemovedPlanSlot(plan, date, mealType) {
  return (plan?.removedSlots || []).some((slot) => isSameRemovedSlot(slot, date, mealType));
}

export function recordRemovedPlanSlot(plan, date, mealType) {
  if (!Array.isArray(plan.removedSlots)) plan.removedSlots = [];
  if (isRemovedPlanSlot(plan, date, mealType)) return;
  const normalizedDate = new Date(date);
  plan.removedSlots.push({
    date: new Date(Date.UTC(normalizedDate.getUTCFullYear(), normalizedDate.getUTCMonth(), normalizedDate.getUTCDate())),
    mealType
  });
}

export function clearRemovedPlanSlot(plan, date, mealType) {
  if (!Array.isArray(plan.removedSlots)) return;
  plan.removedSlots = plan.removedSlots.filter((slot) => !isSameRemovedSlot(slot, date, mealType));
}
