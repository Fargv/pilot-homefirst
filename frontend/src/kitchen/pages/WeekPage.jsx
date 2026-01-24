import React, { useEffect, useMemo, useRef, useState } from "react";
import { apiRequest } from "../api.js";
import { useAuth } from "../auth";
import WeekDaysStrip from "../components/WeekDaysStrip.jsx";
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

function addDaysToISO(dateString, days) {
  const [year, month, day] = dateString.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function ChevronIcon(props) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" {...props}>
      <path d="M15 18l-6-6 6-6" />
    </svg>
  );
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
  const [selectedDay, setSelectedDay] = useState("");
  const [showCarouselControls, setShowCarouselControls] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const lastSyncedIngredients = useRef({});
  const saveTimers = useRef({});
  const carouselRef = useRef(null);
  const dayRefs = useRef(new Map());
  const selectedDayRef = useRef(selectedDay);

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
      if (user) {
        const usersEndpoint = user?.role === "admin" ? "/api/kitchen/users" : "/api/kitchen/users/members";
        const usersData = await apiRequest(usersEndpoint);
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

  useEffect(() => {
    if (!plan?.days?.length) {
      return;
    }
    const todayKey = new Date().toISOString().slice(0, 10);
    const fallbackDay = plan.days[0]?.date?.slice(0, 10) || "";
    const defaultDay = plan.days.some((day) => day.date.slice(0, 10) === todayKey)
      ? todayKey
      : fallbackDay;
    setSelectedDay((prev) => {
      if (prev && plan.days.some((day) => day.date.slice(0, 10) === prev)) {
        return prev;
      }
      return defaultDay;
    });
  }, [plan]);

  useEffect(() => {
    selectedDayRef.current = selectedDay;
  }, [selectedDay]);

  const dayKeys = useMemo(() => plan?.days?.map((day) => day.date.slice(0, 10)) || [], [plan]);

  useEffect(() => {
    const element = carouselRef.current;
    if (!element) return;

    const updateControls = () => {
      const shouldShow = element.scrollWidth > element.clientWidth + 1;
      setShowCarouselControls(shouldShow);
    };

    updateControls();
    const observer = new ResizeObserver(updateControls);
    observer.observe(element);
    window.addEventListener("resize", updateControls);

    return () => {
      observer.disconnect();
      window.removeEventListener("resize", updateControls);
    };
  }, [dayKeys.length]);

  useEffect(() => {
    const element = carouselRef.current;
    if (!element || !dayKeys.length) return;

    let frame = null;
    const handleScroll = () => {
      if (frame) {
        cancelAnimationFrame(frame);
      }
      frame = requestAnimationFrame(() => {
        const center = element.scrollLeft + element.clientWidth / 2;
        let closestIndex = 0;
        let closestDistance = Number.POSITIVE_INFINITY;
        dayKeys.forEach((key, index) => {
          const node = dayRefs.current.get(key);
          if (!node) return;
          const nodeCenter = node.offsetLeft + node.offsetWidth / 2;
          const distance = Math.abs(center - nodeCenter);
          if (distance < closestDistance) {
            closestDistance = distance;
            closestIndex = index;
          }
        });
        const nextKey = dayKeys[closestIndex];
        setActiveIndex(closestIndex);
        if (nextKey && nextKey !== selectedDayRef.current) {
          setSelectedDay(nextKey);
        }
      });
    };

    element.addEventListener("scroll", handleScroll, { passive: true });
    handleScroll();
    return () => {
      element.removeEventListener("scroll", handleScroll);
      if (frame) {
        cancelAnimationFrame(frame);
      }
    };
  }, [dayKeys]);

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

  const handleWeekShift = (days) => {
    setWeekStart((prev) => addDaysToISO(prev, days));
  };

  const handleSelectDay = (dayKey) => {
    setSelectedDay(dayKey);
    const target = dayRefs.current.get(dayKey) || document.getElementById(`kitchen-day-${dayKey}`);
    if (target) {
      target.scrollIntoView({ behavior: "smooth", block: "nearest", inline: "start" });
      target.focus?.({ preventScroll: true });
    }
  };

  const handleCarouselScroll = (direction) => {
    const element = carouselRef.current;
    if (!element) return;
    element.scrollBy({ left: direction * element.clientWidth, behavior: "smooth" });
  };

  return (
    <KitchenLayout>
      <div className="kitchen-week-controls">
        <section className="kitchen-week-header">
          <div className="kitchen-week-header-actions">
            <div className="kitchen-week-nav" role="group" aria-label="Cambiar semana">
              <button
                className="kitchen-week-arrow"
                type="button"
                onClick={() => handleWeekShift(-7)}
                aria-label="Ir a la semana anterior"
              >
                <ChevronIcon className="kitchen-week-arrow-icon" />
              </button>
              <label className="kitchen-field kitchen-week-picker">
                <input
                  className="kitchen-input"
                  type="date"
                  value={weekStart}
                  onChange={(event) => setWeekStart(event.target.value)}
                  aria-label="Semana"
                />
              </label>
              <button
                className="kitchen-week-arrow"
                type="button"
                onClick={() => handleWeekShift(7)}
                aria-label="Ir a la semana siguiente"
              >
                <ChevronIcon className="kitchen-week-arrow-icon is-next" />
              </button>
            </div>
            {loadError ? <p className="kitchen-inline-error">{loadError}</p> : null}
          </div>
        </section>
        <WeekDaysStrip
          days={plan.days}
          userMap={userMap}
          selectedDay={selectedDay}
          onSelectDay={handleSelectDay}
        />
      </div>

      <div className="kitchen-week-carousel">
        {showCarouselControls ? (
          <button
            className="kitchen-week-carousel-arrow is-left"
            type="button"
            onClick={() => handleCarouselScroll(-1)}
            aria-label="Mostrar día anterior"
          >
            <ChevronIcon className="kitchen-week-carousel-arrow-icon" />
          </button>
        ) : null}
        <div className="kitchen-grid kitchen-week-days" id="week-grid" ref={carouselRef}>
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
            <div
              key={day.date}
              id={`kitchen-day-${dayKey}`}
              className={`kitchen-card kitchen-day-card ${selectedDay === dayKey ? "is-selected" : ""}`}
              tabIndex={-1}
              ref={(node) => {
                if (!node) {
                  dayRefs.current.delete(dayKey);
                  return;
                }
                dayRefs.current.set(dayKey, node);
              }}
            >
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
        {showCarouselControls ? (
          <button
            className="kitchen-week-carousel-arrow is-right"
            type="button"
            onClick={() => handleCarouselScroll(1)}
            aria-label="Mostrar día siguiente"
          >
            <ChevronIcon className="kitchen-week-carousel-arrow-icon is-next" />
          </button>
        ) : null}
      </div>
      {dayKeys.length > 1 ? (
        <div className="kitchen-week-carousel-dots" role="tablist" aria-label="Días de la semana">
          {dayKeys.map((key, index) => (
            <button
              key={key}
              type="button"
              className={`kitchen-week-carousel-dot ${activeIndex === index ? "is-active" : ""}`}
              onClick={() => handleSelectDay(key)}
              aria-label={`Ir a ${formatDateLabel(key)}`}
              aria-current={activeIndex === index ? "true" : undefined}
            />
          ))}
        </div>
      ) : null}
    </KitchenLayout>
  );
}
