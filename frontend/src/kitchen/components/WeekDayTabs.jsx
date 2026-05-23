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

function PlusIcon(props) {
  return (
    <svg viewBox="0 0 14 14" fill="none" aria-hidden="true" {...props}>
      <path d="M7 2v10M2 7h10" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" />
    </svg>
  );
}

export default function WeekDayTabs({
  days = [],
  selectedDay,
  onSelectDay,
  weekendAction = null
}) {
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
      {weekendAction ? (
        <button
          type="button"
          role="tab"
          aria-selected={false}
          className={`kitchen-weekday-tab kitchen-weekday-tab-finde${weekendAction.disabled ? " is-disabled" : ""}`}
          onClick={weekendAction.disabled ? undefined : weekendAction.onClick}
          disabled={weekendAction.disabled}
          title={weekendAction.title || "Añadir fin de semana"}
          aria-label={weekendAction.ariaLabel || "Añadir fin de semana"}
        >
          <PlusIcon className="kitchen-weekday-tab-finde-icon" />
        </button>
      ) : null}
    </div>
  );
}
