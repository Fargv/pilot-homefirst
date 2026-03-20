const DAY_MS = 24 * 60 * 60 * 1000;

function startOfUtcDay(dateLike) {
  const date = new Date(dateLike);
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
}

function daysBetween(start, end) {
  return Math.round((startOfUtcDay(end).getTime() - startOfUtcDay(start).getTime()) / DAY_MS);
}

function getDaysInUtcMonth(year, monthIndex) {
  return new Date(Date.UTC(year, monthIndex + 1, 0)).getUTCDate();
}

function buildCycleAnchor(year, monthIndex, cycleStartDay) {
  const safeDay = Math.min(Math.max(1, Number(cycleStartDay) || 1), getDaysInUtcMonth(year, monthIndex));
  return new Date(Date.UTC(year, monthIndex, safeDay));
}

function getCycleRangeForDate(dateLike, cycleStartDay = 1) {
  const date = startOfUtcDay(dateLike);
  const currentAnchor = buildCycleAnchor(date.getUTCFullYear(), date.getUTCMonth(), cycleStartDay);

  if (date.getTime() >= currentAnchor.getTime()) {
    const nextMonth = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 1));
    return {
      start: currentAnchor,
      end: buildCycleAnchor(nextMonth.getUTCFullYear(), nextMonth.getUTCMonth(), cycleStartDay)
    };
  }

  const previousMonth = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() - 1, 1));
  return {
    start: buildCycleAnchor(previousMonth.getUTCFullYear(), previousMonth.getUTCMonth(), cycleStartDay),
    end: currentAnchor
  };
}

export function calculateWeeklyBudget({ weekStart, monthlyBudget, cycleStartDay = 1 }) {
  const amount = Number(monthlyBudget);
  if (!Number.isFinite(amount) || amount < 0 || !weekStart) {
    return null;
  }

  let total = 0;
  const safeWeekStart = startOfUtcDay(weekStart);
  for (let offset = 0; offset < 7; offset += 1) {
    const currentDay = new Date(safeWeekStart.getTime() + (offset * DAY_MS));
    const cycle = getCycleRangeForDate(currentDay, cycleStartDay);
    const cycleDays = Math.max(1, daysBetween(cycle.start, cycle.end));
    total += amount / cycleDays;
  }

  return Number(total.toFixed(2));
}

export function getWeekDateRange(weekStart) {
  const start = startOfUtcDay(weekStart);
  const end = new Date(start.getTime() + (7 * DAY_MS));
  return { start, end };
}
