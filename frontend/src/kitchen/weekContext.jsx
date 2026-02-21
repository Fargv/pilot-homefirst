import React, { createContext, useContext, useMemo, useState } from "react";

function getMondayISO(date = new Date()) {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const day = d.getUTCDay();
  const diff = (day === 0 ? -6 : 1) - day;
  d.setUTCDate(d.getUTCDate() + diff);
  return d.toISOString().slice(0, 10);
}

function normalizeWeekStart(value) {
  if (!value) return getMondayISO();
  const parsed = new Date(`${value}T00:00:00Z`);
  if (Number.isNaN(parsed.getTime())) return getMondayISO();
  return getMondayISO(parsed);
}

const ActiveWeekContext = createContext(null);

export function ActiveWeekProvider({ children }) {
  const [activeWeek, setActiveWeekState] = useState(() => normalizeWeekStart(localStorage.getItem("kitchen_active_week") || ""));

  const setActiveWeek = (valueOrUpdater) => {
    setActiveWeekState((prev) => {
      const resolved = typeof valueOrUpdater === "function" ? valueOrUpdater(prev) : valueOrUpdater;
      const normalized = normalizeWeekStart(resolved);
      localStorage.setItem("kitchen_active_week", normalized);
      return normalized;
    });
  };

  const contextValue = useMemo(() => ({ activeWeek, setActiveWeek }), [activeWeek]);
  return <ActiveWeekContext.Provider value={contextValue}>{children}</ActiveWeekContext.Provider>;
}

export function useActiveWeek() {
  const context = useContext(ActiveWeekContext);
  if (!context) {
    throw new Error("useActiveWeek debe usarse dentro de ActiveWeekProvider");
  }
  return context;
}
