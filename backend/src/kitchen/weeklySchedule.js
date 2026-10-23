import { getWeekDate, getWeekDates } from "./utils/dates.js";

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

export function applyWeeklySchedulePatch(currentSchedule, patch) {
  const next = {
    version: 1,
    ...(currentSchedule?.lunchDays !== undefined ? { lunchDays: [...currentSchedule.lunchDays] } : {}),
    ...(currentSchedule?.dinnerDays !== undefined ? { dinnerDays: [...currentSchedule.dinnerDays] } : {})
  };

  for (const field of ["lunchDays", "dinnerDays"]) {
    if (!Object.prototype.hasOwnProperty.call(patch, field)) continue;
    if (patch[field] === null) {
      delete next[field];
    } else {
      next[field] = [...patch[field]];
    }
  }

  return Object.keys(next).length === 1 ? null : next;
}
