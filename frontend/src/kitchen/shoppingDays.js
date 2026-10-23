export const SHOPPING_DAYS = [
  { key: "monday", label: "Lunes" }, { key: "tuesday", label: "Martes" },
  { key: "wednesday", label: "Miércoles" }, { key: "thursday", label: "Jueves" },
  { key: "friday", label: "Viernes" }, { key: "saturday", label: "Sábado" },
  { key: "sunday", label: "Domingo" }
];

export function getWeekDayDates(weekStart) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(weekStart || ""))) return [];
  const monday = new Date(`${weekStart}T00:00:00Z`);
  if (Number.isNaN(monday.getTime())) return [];
  return SHOPPING_DAYS.map((_, index) => {
    const date = new Date(monday);
    date.setUTCDate(date.getUTCDate() + index);
    return date.toISOString().slice(0, 10);
  });
}

export function toggleShoppingDay(currentDay, nextDay) {
  return currentDay === nextDay ? "" : nextDay;
}

export function getShoppingDaysWithDishes(items, weekStart) {
  const weekDates = getWeekDayDates(weekStart);
  const datesInWeek = new Set(weekDates);
  const dates = new Set();
  for (const item of items || []) {
    if (isManualShoppingItem(item)) continue;
    for (const source of item.sources || []) {
      if (!source?.dishName && !source?.dishId) continue;
      const date = getSourceDay(source);
      if (datesInWeek.has(date)) dates.add(date);
    }
  }
  return SHOPPING_DAYS.filter((_, index) => dates.has(weekDates[index]));
}

export function getShoppingRecipeReferences(item) {
  if (isManualShoppingItem(item)) return [];
  const references = new Map();
  for (const source of item?.sources || []) {
    const date = getSourceDay(source);
    const dishName = String(source?.dishName || "").trim();
    if (!date || !dishName) continue;
    const dishId = String(source?.dishId ?? "").trim();
    const identity = dishId ? `dish:${dishId}` : `name:${dishName.toLocaleLowerCase("es")}`;
    const key = `${identity}|${date}`;
    if (!references.has(key)) references.set(key, { key, dishName, date });
  }
  return [...references.values()];
}
export function hasReliableShoppingDays(item) {
  return Array.isArray(item?.sources) && item.sources.some((source) => getSourceDay(source) !== "");
}

export function isManualShoppingItem(item) {
  if (item?.source === "manual") return true;
  if (item?.source === "plan") return false;
  return !Array.isArray(item?.fromDishes) || item.fromDishes.length === 0;
}

function getSourceDay(source) {
  const day = String(source?.day || "").slice(0, 10);
  if (/^\d{4}-\d{2}-\d{2}$/.test(day)) return day;
  if (!source?.date) return "";
  const date = source.date instanceof Date ? source.date : new Date(source.date);
  return Number.isNaN(date.getTime()) ? "" : date.toISOString().slice(0, 10);
}

export function filterShoppingGroups(groups, selectedDays, weekStart) {
  if (!selectedDays?.size) return groups || [];
  const dates = getWeekDayDates(weekStart);
  const dayKeys = new Set([...selectedDays].map((key) => dates[SHOPPING_DAYS.findIndex((day) => day.key === key)]).filter(Boolean));
  return (groups || []).map((group) => ({
    ...group,
    items: (group.items || []).filter((item) => {
      if (isManualShoppingItem(item)) return false;
      const sources = Array.isArray(item.sources) ? item.sources : [];
      // Legacy plan entries without trustworthy dates stay visible in their own group.
      if (!hasReliableShoppingDays(item)) return false;
      return sources.some((source) => dayKeys.has(getSourceDay(source)));
    })
  })).filter((group) => group.items.length > 0);
}

export function filterShoppingItems(items, selectedDays, weekStart) {
  if (!selectedDays?.size) return items || [];
  const dates = getWeekDayDates(weekStart);
  const dayKeys = new Set([...selectedDays].map((key) => dates[SHOPPING_DAYS.findIndex((day) => day.key === key)]).filter(Boolean));
  return (items || []).filter((item) => {
    if (isManualShoppingItem(item)) return true;
    if (!hasReliableShoppingDays(item)) return true;
    const sources = item.sources;
    return sources.some((source) => dayKeys.has(getSourceDay(source)));
  });
}

export function getVisiblePendingGroups(groups, selectedDays, weekStart) {
  const plan = filterShoppingGroups(groups || [], selectedDays, weekStart);
  if (!selectedDays?.size) return plan;
  const manuals = (groups || []).map((group) => ({
    ...group,
    _section: "Añadidos manualmente",
    items: (group.items || []).filter(isManualShoppingItem)
  })).filter((group) => group.items.length);
  const legacy = (groups || []).map((group) => ({
    ...group,
    _section: "Sin día asignado",
    items: (group.items || []).filter((item) => !isManualShoppingItem(item) && !hasReliableShoppingDays(item))
  })).filter((group) => group.items.length);
  return [...plan, ...manuals, ...legacy];
}

export function getDayCoverage(items, dayKey, weekStart) {
  const date = getWeekDayDates(weekStart)[SHOPPING_DAYS.findIndex((day) => day.key === dayKey)];
  if (!date) return { purchased: 0, total: 0 };
  const byCanonical = new Map();
  for (const item of items || []) {
    if (isManualShoppingItem(item) || !(item.sources || []).some((source) => getSourceDay(source) === date)) continue;
    const identity = String(item.canonicalName || item.displayName || item.ingredientId || "").trim().toLocaleLowerCase("es");
    if (!identity) continue;
    const rows = byCanonical.get(identity) || [];
    rows.push(item);
    byCanonical.set(identity, rows);
  }
  // Unit-incompatible rows share one ingredient identity. Coverage counts it once
  // and considers it purchased only after every required row for that identity is purchased.
  return {
    purchased: Array.from(byCanonical.values()).filter((rows) => rows.every((item) => item.status === "purchased")).length,
    total: byCanonical.size
  };
}
