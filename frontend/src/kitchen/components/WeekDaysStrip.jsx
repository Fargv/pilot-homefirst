import React, { useEffect, useMemo, useRef, useState } from "react";
import { getUnassignedColor, getUserColor } from "../utils/userColors";

const DAY_LABELS = ["D", "L", "M", "X", "J", "V", "S"];
const DAY_LONG = ["domingo", "lunes", "martes", "miércoles", "jueves", "viernes", "sábado"];

function getDayAbbreviation(dateString) {
  const date = new Date(dateString);
  return DAY_LABELS[date.getDay()];
}

function getDayLong(dateString) {
  const date = new Date(dateString);
  return DAY_LONG[date.getDay()];
}

function getInitials(name) {
  if (!name) return "";
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return "";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return `${parts[0][0]}${parts[1][0]}`.toUpperCase();
}

function ChevronIcon(props) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" {...props}>
      <path d="M15 18l-6-6 6-6" />
    </svg>
  );
}

export default function WeekDaysStrip({ days, userMap, selectedDay, onSelectDay }) {
  const scrollRef = useRef(null);
  const [isCarousel, setIsCarousel] = useState(false);

  const entries = useMemo(() => {
    return days.map((day) => {
      const dayKey = day.date.slice(0, 10);
      const cookUser = day.cookUserId ? userMap.get(day.cookUserId) : null;
      const initials = cookUser ? getInitials(cookUser.displayName) : "";
      return {
        key: dayKey,
        date: day.date,
        isAssigned: Boolean(day.cookUserId),
        cookUserId: day.cookUserId,
        cookName: cookUser?.displayName || "Sin asignar",
        initials
      };
    });
  }, [days, userMap]);

  useEffect(() => {
    const element = scrollRef.current;
    if (!element) return;

    const updateCarousel = () => {
      const shouldCarousel = element.scrollWidth > element.clientWidth + 1;
      setIsCarousel(shouldCarousel);
    };

    updateCarousel();
    const observer = new ResizeObserver(updateCarousel);
    observer.observe(element);
    window.addEventListener("resize", updateCarousel);

    return () => {
      observer.disconnect();
      window.removeEventListener("resize", updateCarousel);
    };
  }, []);

  const handleSelect = (entry) => {
    if (!entry) return;
    onSelectDay(entry.key);
  };

  const scrollByOffset = (direction) => {
    const element = scrollRef.current;
    if (!element) return;
    const scrollAmount = Math.min(240, element.clientWidth * 0.8);
    element.scrollBy({ left: direction * scrollAmount, behavior: "smooth" });
  };

  return (
    <section className="kitchen-weekdays-strip kitchen-card" aria-label="Panel de días">
      <div className={`kitchen-weekdays-carousel ${isCarousel ? "is-carousel" : ""}`}>
        {isCarousel ? (
          <button
            className="kitchen-weekdays-arrow is-left"
            type="button"
            onClick={() => scrollByOffset(-1)}
            aria-label="Desplazar días a la izquierda"
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
            const colors = entry.isAssigned ? getUserColor(entry.cookUserId) : getUnassignedColor();
            return (
              <button
                key={entry.key}
                type="button"
                className={`kitchen-weekdays-item ${isSelected ? "is-selected" : ""}`}
                onClick={() => handleSelect(entry)}
                aria-label={`${getDayLong(entry.date)}: ${entry.cookName}`}
                style={{
                  "--weekday-bg": colors.background,
                  "--weekday-text": colors.text,
                  "--weekday-border": colors.border || "transparent"
                }}
              >
                <span className="kitchen-weekdays-circle" aria-hidden="true">
                  {entry.isAssigned ? entry.initials : "+"}
                </span>
                <span className="kitchen-weekdays-label">{getDayAbbreviation(entry.date)}</span>
              </button>
            );
          })}
        </div>
        {isCarousel ? (
          <button
            className="kitchen-weekdays-arrow is-right"
            type="button"
            onClick={() => scrollByOffset(1)}
            aria-label="Desplazar días a la derecha"
          >
            <ChevronIcon className="kitchen-weekdays-arrow-icon is-next" />
          </button>
        ) : null}
      </div>
    </section>
  );
}
