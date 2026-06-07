import React, { useCallback, useEffect, useRef, useState } from "react";
import { Calendar, ChevronLeft, ChevronRight } from "lucide-react";

/* ─── helpers ─────────────────────────────────────────────────── */

function isoToUTCDate(iso) {
  return new Date(`${iso}T00:00:00Z`);
}

function getMondayISO(date) {
  const d = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  const day = d.getUTCDay();
  const diff = day === 0 ? -6 : 1 - day;
  d.setUTCDate(d.getUTCDate() + diff);
  return d.toISOString().slice(0, 10);
}

function addDaysISO(iso, n) {
  const d = isoToUTCDate(iso);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

function getCurrentWeekMonday() {
  const now = new Date();
  return getMondayISO(new Date(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate())));
}

function getTodayISO() {
  return new Date().toISOString().slice(0, 10);
}

function formatWeekRange(iso) {
  if (!iso) return "";
  const start = isoToUTCDate(iso);
  const end = new Date(start);
  end.setUTCDate(end.getUTCDate() + 6);
  const fmt = (d) =>
    d.toLocaleDateString("es-ES", { day: "numeric", month: "short", timeZone: "UTC" });
  return `${fmt(start)} – ${fmt(end)}`;
}

function formatMonthTitle(year, month) {
  const d = new Date(Date.UTC(year, month, 1));
  const label = d.toLocaleDateString("es-ES", { month: "long", year: "numeric", timeZone: "UTC" });
  return label.charAt(0).toUpperCase() + label.slice(1);
}

function buildMonthGrid(year, month) {
  const firstOfMonth = new Date(Date.UTC(year, month, 1));
  const dow = firstOfMonth.getUTCDay();
  const offsetToMonday = dow === 0 ? -6 : 1 - dow;
  const gridStart = new Date(firstOfMonth);
  gridStart.setUTCDate(gridStart.getUTCDate() + offsetToMonday);

  const todayISO = getTodayISO();
  const rows = [];
  const cursor = new Date(gridStart);

  for (let week = 0; week < 6; week++) {
    const row = [];
    for (let d = 0; d < 7; d++) {
      const iso = cursor.toISOString().slice(0, 10);
      row.push({
        iso,
        day: cursor.getUTCDate(),
        isCurrentMonth: cursor.getUTCMonth() === month,
        isToday: iso === todayISO,
      });
      cursor.setUTCDate(cursor.getUTCDate() + 1);
    }
    if (row.some((c) => c.isCurrentMonth)) {
      rows.push(row);
    }
  }
  return rows;
}

const DAY_LABELS = ["L", "M", "X", "J", "V", "S", "D"];

/* ─── component ───────────────────────────────────────────────── */

export default function WeekDatePicker({ selectedWeek, onWeekChange, className = "" }) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef(null);

  const seedDate = selectedWeek ? isoToUTCDate(selectedWeek) : new Date();
  const [calYear, setCalYear] = useState(seedDate.getUTCFullYear());
  const [calMonth, setCalMonth] = useState(seedDate.getUTCMonth());

  // Keep calendar in sync when chevrons move selectedWeek
  useEffect(() => {
    if (!selectedWeek || open) return;
    const d = isoToUTCDate(selectedWeek);
    setCalYear(d.getUTCFullYear());
    setCalMonth(d.getUTCMonth());
  }, [selectedWeek, open]);

  // Close on outside click/touch
  useEffect(() => {
    if (!open) return undefined;
    const handler = (e) => {
      if (containerRef.current?.contains(e.target)) return;
      setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    document.addEventListener("touchstart", handler, { passive: true });
    return () => {
      document.removeEventListener("mousedown", handler);
      document.removeEventListener("touchstart", handler);
    };
  }, [open]);

  const currentWeekMonday = getCurrentWeekMonday();
  const isCurrentWeek = selectedWeek === currentWeekMonday;

  const handlePrev = useCallback(() => {
    onWeekChange(addDaysISO(selectedWeek, -7));
  }, [selectedWeek, onWeekChange]);

  const handleNext = useCallback(() => {
    onWeekChange(addDaysISO(selectedWeek, 7));
  }, [selectedWeek, onWeekChange]);

  const handleGoToday = useCallback(() => {
    onWeekChange(currentWeekMonday);
    setOpen(false);
  }, [onWeekChange, currentWeekMonday]);

  const handleSelectWeek = useCallback(
    (mondayISO) => {
      onWeekChange(mondayISO);
      setOpen(false);
    },
    [onWeekChange]
  );

  const prevCalMonth = () => {
    if (calMonth === 0) { setCalYear((y) => y - 1); setCalMonth(11); }
    else setCalMonth((m) => m - 1);
  };
  const nextCalMonth = () => {
    if (calMonth === 11) { setCalYear((y) => y + 1); setCalMonth(0); }
    else setCalMonth((m) => m + 1);
  };

  const grid = buildMonthGrid(calYear, calMonth);

  return (
    <div className={`wdp-container${className ? ` ${className}` : ""}`} ref={containerRef}>
      {/* ── Strip: [<] [Cal date] [>] [Hoy?] ── */}
      <div className="wdp-strip">
        <button
          type="button"
          className="wdp-chevron"
          onClick={handlePrev}
          aria-label="Semana anterior"
        >
          <ChevronLeft size={14} />
        </button>

        <button
          type="button"
          className={`wdp-date-btn${open ? " is-open" : ""}`}
          onClick={() => setOpen((v) => !v)}
          aria-label="Seleccionar semana"
          aria-expanded={open}
          aria-haspopup="dialog"
        >
          <Calendar size={13} aria-hidden="true" />
          <span className="wdp-date-label">{formatWeekRange(selectedWeek)}</span>
        </button>

        <button
          type="button"
          className="wdp-chevron"
          onClick={handleNext}
          aria-label="Semana siguiente"
        >
          <ChevronRight size={14} />
        </button>

        {!isCurrentWeek ? (
          <button
            type="button"
            className="wdp-today-chip"
            onClick={handleGoToday}
            aria-label="Ir a la semana actual"
          >
            Hoy
          </button>
        ) : null}
      </div>

      {/* ── Calendar dropdown ── */}
      {open ? (
        <div className="wdp-dropdown" role="dialog" aria-label="Seleccionar semana" aria-modal="true">
          {/* Month navigation */}
          <div className="wdp-month-header">
            <button
              type="button"
              className="wdp-month-arrow"
              onClick={prevCalMonth}
              aria-label="Mes anterior"
            >
              <ChevronLeft size={15} />
            </button>
            <span className="wdp-month-title">{formatMonthTitle(calYear, calMonth)}</span>
            <button
              type="button"
              className="wdp-month-arrow"
              onClick={nextCalMonth}
              aria-label="Mes siguiente"
            >
              <ChevronRight size={15} />
            </button>
            <button
              type="button"
              className="wdp-today-inline-btn"
              onClick={handleGoToday}
            >
              Hoy
            </button>
          </div>

          {/* Day-of-week labels */}
          <div className="wdp-day-labels" aria-hidden="true">
            {DAY_LABELS.map((l) => (
              <span key={l} className="wdp-day-label">{l}</span>
            ))}
          </div>

          {/* Week rows — each row is a selectable button */}
          <div className="wdp-grid">
            {grid.map((row) => {
              const rowMonday = getMondayISO(isoToUTCDate(row[0].iso));
              const isSelected = rowMonday === selectedWeek;
              return (
                <button
                  key={rowMonday}
                  type="button"
                  className={`wdp-week-row${isSelected ? " is-selected" : ""}`}
                  onClick={() => handleSelectWeek(rowMonday)}
                  aria-label={formatWeekRange(rowMonday)}
                  aria-pressed={isSelected}
                >
                  {row.map((cell) => (
                    <span
                      key={cell.iso}
                      className={[
                        "wdp-cell",
                        !cell.isCurrentMonth ? "is-other-month" : "",
                        cell.isToday ? "is-today" : "",
                      ]
                        .filter(Boolean)
                        .join(" ")}
                    >
                      {cell.day}
                      {cell.isToday ? <span className="wdp-today-dot" aria-hidden="true" /> : null}
                    </span>
                  ))}
                </button>
              );
            })}
          </div>
        </div>
      ) : null}
    </div>
  );
}
