import React, { useEffect, useMemo, useRef, useState } from "react";
import { apiRequest } from "../api.js";
import { useAuth } from "../auth";
import KitchenLayout from "../Layout.jsx";

function getMondayISO(date = new Date()) {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const day = d.getUTCDay();
  const diff = (day === 0 ? -6 : 1) - day;
  d.setUTCDate(d.getUTCDate() + diff);
  return d.toISOString().slice(0, 10);
}

function formatDateLabel(dateString) {
  const date = new Date(dateString);
  return date.toLocaleDateString("es-ES", { weekday: "long", day: "numeric", month: "short" });
}

function formatWeekRange(dateString) {
  const startDate = new Date(dateString);
  const endDate = new Date(startDate);
  endDate.setDate(startDate.getDate() + 6);

  const startDay = startDate.toLocaleDateString("es-ES", { day: "numeric" });
  const startMonth = startDate.toLocaleDateString("es-ES", { month: "short" });
  const startYear = startDate.toLocaleDateString("es-ES", { year: "numeric" });
  const endDay = endDate.toLocaleDateString("es-ES", { day: "numeric" });
  const endMonth = endDate.toLocaleDateString("es-ES", { month: "short" });
  const endYear = endDate.toLocaleDateString("es-ES", { year: "numeric" });

  if (startYear === endYear && startMonth === endMonth) {
    return `${startDay}–${endDay} ${endMonth} ${endYear}`;
  }

  if (startYear === endYear) {
    return `${startDay} ${startMonth}–${endDay} ${endMonth} ${endYear}`;
  }

  return `${startDay} ${startMonth} ${startYear}–${endDay} ${endMonth} ${endYear}`;
}

export default function WeekPage() {
  const { user } = useAuth();
  const [weekStart, setWeekStart] = useState(getMondayISO());
  const [plan, setPlan] = useState(null);
  const [dishes, setDishes] = useState([]);
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [dayStatus, setDayStatus] = useState({});
  const [dayErrors, setDayErrors] = useState({});
  const [ingredientInputs, setIngredientInputs] = useState({});
  const lastSyncedIngredients = useRef({});
  const saveTimers = useRef({});

  const loadData = async () => {
    setLoading(true);
    setLoadError("");
    try {
      const [planData, dishesData] = await Promise.all([
        apiRequest(`/api/kitchen/weeks/${weekStart}`),
        apiRequest("/api/kitchen/dishes")
      ]);
      setPlan(planData.plan);
      setDishes(dishesData.dishes || []);
      if (user?.role === "admin") {
        const usersData = await apiRequest("/api/kitchen/users");
        setUsers(usersData.users || []);
      }
    } catch (err) {
      setLoadError(err.message || "No se pudo cargar la semana.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [weekStart]);

  const userMap = useMemo(() => {
    const map = new Map();
    users.forEach((u) => map.set(u.id, u));
    return map;
  }, [users]);

  useEffect(() => {
    if (!plan?.days) {
      return;
    }
    setIngredientInputs((prev) => {
      const next = { ...prev };
      plan.days.forEach((day) => {
        const key = day.date.slice(0, 10);
        const serverValue = (day.ingredientOverrides || [])
          .map((item) => item.displayName)
          .join(", ");
        if (prev[key] === undefined || prev[key] === lastSyncedIngredients.current[key]) {
          next[key] = serverValue;
          lastSyncedIngredients.current[key] = serverValue;
        }
      });
      return next;
    });
  }, [plan]);

  const updateDay = async (day, updates) => {
    const dayKey = day.date.slice(0, 10);
    setDayErrors((prev) => ({ ...prev, [dayKey]: "" }));
    setDayStatus((prev) => ({ ...prev, [dayKey]: "saving" }));
    try {
      const data = await apiRequest(`/api/kitchen/weeks/${weekStart}/day/${day.date.slice(0, 10)}`, {
        method: "PUT",
        body: JSON.stringify(updates)
      });
      setPlan(data.plan);
      setDayStatus((prev) => ({ ...prev, [dayKey]: "saved" }));
      if (saveTimers.current[dayKey]) {
        clearTimeout(saveTimers.current[dayKey]);
      }
      saveTimers.current[dayKey] = window.setTimeout(() => {
        setDayStatus((prev) => ({ ...prev, [dayKey]: "" }));
      }, 2000);
    } catch (err) {
      const message = err.message || "No se pudo actualizar el día.";
      setDayErrors((prev) => ({ ...prev, [dayKey]: message }));
      setDayStatus((prev) => ({ ...prev, [dayKey]: "error" }));
    }
  };

  const onAssignSelf = (day) => {
    updateDay(day, { cookUserId: user?.id || user?._id });
  };

  if (loading) {
    return (
      <KitchenLayout>
        <div className="kitchen-card">Cargando semana...</div>
      </KitchenLayout>
    );
  }

  if (!plan) {
    return (
      <KitchenLayout>
        <div className="kitchen-card kitchen-empty">
          <h3>No hay planificación todavía</h3>
          <p>Cuando guardes un día aparecerá aquí.</p>
          {loadError ? <p className="kitchen-inline-error">{loadError}</p> : null}
        </div>
      </KitchenLayout>
    );
  }

  const weekRange = formatWeekRange(weekStart);

  return (
    <KitchenLayout>
      <section className="kitchen-week-header">
        <div className="kitchen-week-header-main">
          <h1 className="kitchen-title">Semana</h1>
          <p className="kitchen-muted kitchen-week-subtitle">{weekRange}</p>
          {loadError ? <p className="kitchen-inline-error">{loadError}</p> : null}
        </div>
        <div className="kitchen-week-header-actions">
          <label className="kitchen-field">
            <span className="kitchen-label">Cambiar semana (lunes)</span>
            <input
              className="kitchen-input"
              type="date"
              value={weekStart}
              onChange={(event) => setWeekStart(event.target.value)}
            />
          </label>
        </div>
      </section>

      <div className="kitchen-grid" id="week-grid">
        {plan.days.map((day) => {
          const dayKey = day.date.slice(0, 10);
          const cookUser = day.cookUserId ? userMap.get(day.cookUserId) : null;
          const isAssigned = Boolean(day.cookUserId);
          const isPlanned = Boolean(day.mainDishId);
          const isAssignedToSelf = day.cookUserId
            && (day.cookUserId === user?.id || day.cookUserId === user?._id);
          const statusLabels = [];
          if (isAssigned) {
            statusLabels.push({
              label: isAssignedToSelf ? "Asignado a ti" : "Asignado",
              type: "assigned"
            });
          }
          if (isPlanned) {
            statusLabels.push({ label: "Planificado", type: "planned" });
          }
          return (
            <div key={day.date} className="kitchen-card kitchen-day-card">
              <div className="kitchen-day-header">
                <h3 className="kitchen-day-title">{formatDateLabel(day.date)}</h3>
                <div className="kitchen-day-meta">
                  <span>Cocina: {day.cookTiming === "same_day" ? "mismo día" : "día anterior"}</span>
                  <span>Cocinero: {cookUser?.displayName || "Sin asignar"}</span>
                </div>
                {statusLabels.length ? (
                  <div className="kitchen-day-status" aria-label="Estado del día">
                    {statusLabels.map((item) => (
                      <span key={item.label} className={`kitchen-status-pill ${item.type}`}>
                        {item.label}
                      </span>
                    ))}
                  </div>
                ) : null}
              </div>

              <label className="kitchen-field">
                <span className="kitchen-label">Plato principal</span>
                <select
                  className="kitchen-select"
                  value={day.mainDishId || ""}
                  onChange={(event) => updateDay(day, { mainDishId: event.target.value || null })}
                >
                  <option value="">Sin plato</option>
                  {dishes.map((dish) => (
                    <option key={dish._id} value={dish._id}>{dish.name}</option>
                  ))}
                </select>
              </label>

              <label className="kitchen-field">
                <span className="kitchen-label">Guarnición (opcional)</span>
                <select
                  className="kitchen-select"
                  value={day.sideDishId || ""}
                  onChange={(event) => updateDay(day, { sideDishId: event.target.value || null })}
                >
                  <option value="">Sin guarnición</option>
                  {dishes.map((dish) => (
                    <option key={dish._id} value={dish._id}>{dish.name}</option>
                  ))}
                </select>
              </label>

              <label className="kitchen-field">
                <span className="kitchen-label">Cuándo se cocina</span>
                <select
                  className="kitchen-select"
                  value={day.cookTiming}
                  onChange={(event) => updateDay(day, { cookTiming: event.target.value })}
                >
                  <option value="previous_day">Día anterior</option>
                  <option value="same_day">Mismo día</option>
                </select>
              </label>

              <label className="kitchen-field">
                <span className="kitchen-label">Ingredientes extra (separados por coma)</span>
                <textarea
                  className="kitchen-textarea"
                  rows="2"
                  value={ingredientInputs[dayKey] ?? ""}
                  onChange={(event) => {
                    setIngredientInputs((prev) => ({ ...prev, [dayKey]: event.target.value }));
                  }}
                  onBlur={(event) => {
                    const list = event.target.value
                      .split(",")
                      .map((value) => ({ displayName: value.trim() }))
                      .filter((item) => item.displayName);
                    updateDay(day, { ingredientOverrides: list });
                  }}
                />
              </label>

              <div className="kitchen-actions">
                <button className="kitchen-button" onClick={() => onAssignSelf(day)}>
                  Me lo asigno
                </button>
                {user?.role === "admin" ? (
                  <select
                    className="kitchen-select"
                    value={day.cookUserId || ""}
                    onChange={(event) => updateDay(day, { cookUserId: event.target.value || null })}
                  >
                    <option value="">Sin asignar</option>
                    {users.map((u) => (
                      <option key={u.id} value={u.id}>{u.displayName}</option>
                    ))}
                  </select>
                ) : null}
              </div>
              <div className="kitchen-day-feedback" aria-live="polite">
                {dayStatus[dayKey] === "saving" ? (
                  <span className="kitchen-day-feedback-text saving">Guardando...</span>
                ) : null}
                {dayStatus[dayKey] === "saved" ? (
                  <span className="kitchen-day-feedback-text saved">Guardado</span>
                ) : null}
                {dayErrors[dayKey] ? (
                  <span className="kitchen-day-feedback-text error" role="alert">{dayErrors[dayKey]}</span>
                ) : null}
              </div>
            </div>
          );
        })}
      </div>
    </KitchenLayout>
  );
}
