import React, { useEffect, useMemo, useState } from "react";
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

export default function WeekPage() {
  const { user } = useAuth();
  const [weekStart, setWeekStart] = useState(getMondayISO());
  const [plan, setPlan] = useState(null);
  const [dishes, setDishes] = useState([]);
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const loadData = async () => {
    setLoading(true);
    setError("");
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
      setError(err.message || "No se pudo cargar la semana.");
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

  const updateDay = async (day, updates) => {
    try {
      const data = await apiRequest(`/api/kitchen/weeks/${weekStart}/day/${day.date.slice(0, 10)}`, {
        method: "PUT",
        body: JSON.stringify(updates)
      });
      setPlan(data.plan);
    } catch (err) {
      setError(err.message || "No se pudo actualizar el día.");
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

  if (error) {
    return (
      <KitchenLayout>
        <div className="kitchen-card" style={{ color: "#b42318" }}>{error}</div>
      </KitchenLayout>
    );
  }

  if (!plan) {
    return (
      <KitchenLayout>
        <div className="kitchen-card kitchen-empty">
          <h3>No hay planificación todavía</h3>
          <p>Cuando guardes un día aparecerá aquí.</p>
        </div>
      </KitchenLayout>
    );
  }

  const weekLabel = new Date(weekStart).toLocaleDateString("es-ES", {
    day: "numeric",
    month: "long",
    year: "numeric"
  });

  return (
    <KitchenLayout>
      <section className="kitchen-week-header">
        <div className="kitchen-week-header-main">
          <span className="kitchen-eyebrow">Plan semanal</span>
          <h1 className="kitchen-title">Semana del {weekLabel}</h1>
          <p className="kitchen-muted">
            Planifica de lunes a viernes, con cocina por defecto el día anterior.
          </p>
        </div>
        <div className="kitchen-week-header-actions">
          <a className="kitchen-button" href="#week-grid">Planificar semana</a>
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
          const cookUser = day.cookUserId ? userMap.get(day.cookUserId) : null;
          return (
            <div key={day.date} className="kitchen-card kitchen-day-card">
              <div className="kitchen-day-header">
                <h3 className="kitchen-day-title">{formatDateLabel(day.date)}</h3>
                <div className="kitchen-day-meta">
                  <span>Cocina: {day.cookTiming === "same_day" ? "mismo día" : "día anterior"}</span>
                  <span>Cocinero: {cookUser?.displayName || "Sin asignar"}</span>
                </div>
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
                  defaultValue={(day.ingredientOverrides || []).map((item) => item.displayName).join(", ")}
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
            </div>
          );
        })}
      </div>
    </KitchenLayout>
  );
}
