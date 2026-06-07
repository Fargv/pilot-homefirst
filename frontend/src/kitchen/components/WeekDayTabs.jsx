import React from "react";

const DAY_ABBR = ["D", "L", "M", "X", "J", "V", "S"];
const DAY_LONG = ["domingo", "lunes", "martes", "miercoles", "jueves", "viernes", "sabado"];

function parseDayKey(isoKey) {
  const [year, month, day] = String(isoKey || "").split("-").map(Number);
  if (!year || !month || !day) return null;
  const date = new Date(year, month - 1, day);
  return Number.isNaN(date.getTime()) ? null : date;
}

function getDayAbbr(isoKey) {
  const date = parseDayKey(isoKey);
  return date ? DAY_ABBR[date.getDay()] : "?";
}

function getDayLong(isoKey) {
  const date = parseDayKey(isoKey);
  return date ? DAY_LONG[date.getDay()] : "";
}

export default function WeekDayTabs({
  days = [],
  selectedDay,
  onSelectDay,
  weekendChips = null,
}) {
  const hasSat = weekendChips?.hasSaturday ?? false;
  const hasSun = weekendChips?.hasSunday ?? false;
  const busy = weekendChips?.busy ?? false;
  const canAddWeekend = Boolean(weekendChips) && (!hasSat || !hasSun);

  const addWeekendDays = () => {
    const missing = [
      !hasSat ? "saturday" : null,
      !hasSun ? "sunday" : null
    ].filter(Boolean);

    if (missing.length === 2 && typeof weekendChips?.onAddWeekend === "function") {
      weekendChips.onAddWeekend(missing);
      return;
    }
    if (missing.includes("saturday")) {
      weekendChips?.onAddSat?.();
      return;
    }
    if (missing.includes("sunday")) {
      weekendChips?.onAddSun?.();
    }
  };

  return (
    <div className="kitchen-weekday-tabs" role="tablist" aria-label="Dias de la semana">
      {days.map((day) => {
        const dayKey = day?.date?.slice(0, 10);
        if (!dayKey) return null;
        const abbr = getDayAbbr(dayKey);
        const long = getDayLong(dayKey);
        const isActive = selectedDay === dayKey;
        return (
          <button
            key={dayKey}
            type="button"
            role="tab"
            aria-selected={isActive}
            aria-label={long}
            title={long}
            className={`kitchen-weekday-tab${isActive ? " is-active" : ""}`}
            onClick={() => onSelectDay(dayKey)}
          >
            {abbr}
          </button>
        );
      })}
      {canAddWeekend ? (
        <button
          type="button"
          className="kitchen-weekend-chip kitchen-weekend-chip-add"
          onClick={addWeekendDays}
          disabled={busy}
          aria-label="Anadir fin de semana"
          title="Anadir fin de semana"
        >
          + Finde
        </button>
      ) : null}
    </div>
  );
}
