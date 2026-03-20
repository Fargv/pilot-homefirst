import React, { useEffect, useMemo, useRef, useState } from "react";
import { getUnassignedColor, getUserColorById } from "../utils/userColors";

const DAY_LABELS = ["D", "L", "M", "X", "J", "V", "S"];
const DAY_LONG = ["domingo", "lunes", "martes", "miÃ©rcoles", "jueves", "viernes", "sÃ¡bado"];

function getDayAbbreviation(dateString) {
  if (!dateString) return "-";
  const date = new Date(dateString);
  if (Number.isNaN(date.getTime())) {
    return "-";
  }
  return DAY_LABELS[date.getDay()];
}

function getDayLong(dateString) {
  if (!dateString) return "sin fecha";
  const date = new Date(dateString);
  if (Number.isNaN(date.getTime())) {
    return "sin fecha";
  }
  return DAY_LONG[date.getDay()];
}

function ChevronIcon(props) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" {...props}>
      <path d="M15 18l-6-6 6-6" />
    </svg>
  );
}

export default function WeekDaysStrip({
  days,
  userMap,
  selectedDay,
  onSelectDay,
  onCreateDish,
  weekendAction = null,
  utilityAction = null
}) {
  const scrollRef = useRef(null);
  const [isCarousel, setIsCarousel] = useState(false);
  const safeDays = useMemo(() => (Array.isArray(days) ? days : []), [days]);

  const entries = useMemo(() => {
    return safeDays.map((day, index) => {
      const dayKey = day?.date ? day.date.slice(0, 10) : `day-${index}`;
      const cookUser = day.cookUserId ? userMap.get(day.cookUserId) : null;
      return {
        key: dayKey,
        date: day.date,
        hasDish: Boolean(day.mainDishId),
        isAssigned: Boolean(day.cookUserId),
        cookUserId: day.cookUserId,
        cookName: cookUser?.displayName || "Sin asignar",
        dayLabel: getDayAbbreviation(day.date)
      };
    });
  }, [safeDays, userMap]);

  useEffect(() => {
    const element = scrollRef.current;
    if (!element) return;

    const updateCarousel = () => {
      const shouldCarousel = element.scrollWidth > element.clientWidth + 1;
      setIsCarousel(shouldCarousel);
    };

    updateCarousel();
    let observer;
    if (typeof ResizeObserver !== "undefined") {
      observer = new ResizeObserver(updateCarousel);
      observer.observe(element);
    }
    window.addEventListener("resize", updateCarousel);

    return () => {
      observer?.disconnect();
      window.removeEventListener("resize", updateCarousel);
    };
  }, []);

  useEffect(() => {
    const element = scrollRef.current;
    if (!element || !selectedDay) return;
    const target = element.querySelector(`[data-day-key="${selectedDay}"]`);
    if (!target) return;

    target.scrollIntoView({
      behavior: "smooth",
      block: "nearest",
      inline: "center"
    });
  }, [selectedDay, entries]);

  const handleSelect = (entry) => {
    if (!entry) return;
    if (!entry.hasDish && onCreateDish) {
      onCreateDish(entry.key);
      return;
    }
    onSelectDay(entry.key);
  };

  const scrollByOffset = (direction) => {
    const element = scrollRef.current;
    if (!element) return;
    const scrollAmount = Math.min(240, element.clientWidth * 0.8);
    element.scrollBy({ left: direction * scrollAmount, behavior: "smooth" });
  };

  return (
    <section className="kitchen-weekdays-strip kitchen-card" aria-label="Panel de dÃ­as">
      <div className={`kitchen-weekdays-carousel ${isCarousel ? "is-carousel" : ""}`}>
        {isCarousel ? (
          <button
            className="kitchen-weekdays-arrow is-left"
            type="button"
            onClick={() => scrollByOffset(-1)}
            aria-label="Desplazar dÃ­as a la izquierda"
          >
            <ChevronIcon className="kitchen-weekdays-arrow-icon" />
          </button>
        ) : null}
        <div
          ref={scrollRef}
          className={`kitchen-weekdays-list ${isCarousel ? "is-carousel" : ""}`}
          role="list"
        >
          {entries.map((entry) => {
            const isSelected = selectedDay === entry.key;
            const cookUser = entry.cookUserId ? userMap.get(entry.cookUserId) : null;
            const colors = entry.isAssigned
              ? getUserColorById(cookUser?.colorId, entry.cookUserId)
              : getUnassignedColor();
            return (
              <button
                key={entry.key}
                data-day-key={entry.key}
                type="button"
                className={`kitchen-weekdays-item ${isSelected ? "is-selected" : ""}`}
                onClick={() => handleSelect(entry)}
                aria-label={`${getDayLong(entry.date)}: ${entry.cookName}`}
                style={{
                  "--weekday-bg": colors.background,
                  "--weekday-text": colors.text,
                  "--weekday-border": colors.border || "transparent",
                  "--weekday-label-text": entry.isAssigned ? colors.text : "#475467"
                }}
              >
                <span className="kitchen-weekdays-circle" aria-hidden="true">
                  {entry.isAssigned ? entry.dayLabel : "+"}
                </span>
                <span
                  className={`kitchen-weekdays-label ${entry.isAssigned ? "is-assigned" : "is-day"}`}
                  title={entry.isAssigned ? entry.cookName : getDayLong(entry.date)}
                >
                  {entry.isAssigned ? entry.cookName : entry.dayLabel}
                </span>
              </button>
            );
          })}
          {weekendAction ? (
            <button
              data-day-key="weekend-action"
              type="button"
              className={`kitchen-weekdays-item kitchen-weekdays-item-action ${weekendAction.disabled ? "is-disabled" : ""}`}
              onClick={weekendAction.disabled ? undefined : weekendAction.onClick}
              disabled={weekendAction.disabled}
              aria-label={weekendAction.ariaLabel || "Anadir fin de semana"}
              title={weekendAction.title || ""}
            >
              <span className="kitchen-weekdays-circle kitchen-weekdays-circle-action" aria-hidden="true">
                +
              </span>
              <span className="kitchen-weekdays-label">
                {weekendAction.label || "FINDE"}
              </span>
            </button>
          ) : null}
        </div>
        {isCarousel ? (
          <button
            className="kitchen-weekdays-arrow is-right"
            type="button"
            onClick={() => scrollByOffset(1)}
            aria-label="Desplazar dÃ­as a la derecha"
          >
            <ChevronIcon className="kitchen-weekdays-arrow-icon is-next" />
          </button>
        ) : null}
      </div>
      {utilityAction ? <div className="kitchen-weekdays-utility-row">{utilityAction}</div> : null}
    </section>
  );
}
