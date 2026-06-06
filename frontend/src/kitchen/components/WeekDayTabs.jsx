import React from "react";

const DAY_ABBR = ["D", "L", "M", "X", "J", "V", "S"];
const DAY_LONG = ["domingo", "lunes", "martes", "miércoles", "jueves", "viernes", "sábado"];

// Parse a "YYYY-MM-DD" key as a LOCAL date to avoid UTC midnight
// shifting the weekday in timezones west of UTC.
function parseDayKey(isoKey) {
  const [y, m, d] = isoKey.split("-").map(Number);
  if (!y || !m || !d) return null;
  const date = new Date(y, m - 1, d);
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

  return (
    <div className="kitchen-weekday-tabs" role="tablist" aria-label="Días de la semana">
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
      {weekendChips ? (
        <>
          {hasSat ? (
            <span
              className="kitchen-weekend-chip kitchen-weekend-chip-active"
              aria-label="Sábado añadido"
              title="Sábado añadido"
            >
              Sáb ✓
            </span>
          ) : (
            <button
              type="button"
              className="kitchen-weekend-chip kitchen-weekend-chip-add"
              onClick={weekendChips.onAddSat}
              disabled={busy}
              aria-label="Añadir sábado"
              title="Añadir sábado"
            >
              + Sáb
            </button>
          )}
          {hasSat && !hasSun ? (
            <button
              type="button"
              className="kitchen-weekend-chip kitchen-weekend-chip-add"
              onClick={weekendChips.onAddSun}
              disabled={busy}
              aria-label="Añadir domingo"
              title="Añadir domingo"
            >
              + Dom
            </button>
          ) : hasSat && hasSun ? (
            <span
              className="kitchen-weekend-chip kitchen-weekend-chip-active"
              aria-label="Domingo añadido"
              title="Domingo añadido"
            >
              Dom ✓
            </span>
          ) : null}
        </>
      ) : null}
    </div>
  );
}
