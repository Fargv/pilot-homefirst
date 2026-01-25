import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { apiRequest } from "../api.js";
import { useAuth } from "../auth";
import WeekDaysStrip from "../components/WeekDaysStrip.jsx";
import IngredientPicker from "../components/IngredientPicker.jsx";
import KitchenLayout from "../Layout.jsx";
import { normalizeIngredientName } from "../utils/normalize.js";

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
  const [categories, setCategories] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [dayStatus, setDayStatus] = useState({});
  const [dayErrors, setDayErrors] = useState({});
  const [extraIngredientsByDay, setExtraIngredientsByDay] = useState({});
  const [selectedDay, setSelectedDay] = useState("");
  const [editingDays, setEditingDays] = useState({});
  const [sideDishEnabled, setSideDishEnabled] = useState({});
  const [showCarouselControls, setShowCarouselControls] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const [mainDishQueries, setMainDishQueries] = useState({});
  const [mainDishOpen, setMainDishOpen] = useState({});
  const ingredientCache = useRef(new Map());
  const saveTimers = useRef({});
  const carouselRef = useRef(null);
  const dayRefs = useRef(new Map());
  const mainDishRefs = useRef(new Map());
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

  const loadCategories = async () => {
    try {
      const data = await apiRequest("/api/categories");
      setCategories(data.categories || []);
    } catch (err) {
      setLoadError(err.message || "No se pudieron cargar las categorías.");
    }
  };

  useEffect(() => {
    loadCategories();
  }, []);

  const userMap = useMemo(() => {
    const map = new Map();
    users.forEach((u) => map.set(u.id, u));
    return map;
  }, [users]);

  const fetchIngredientMatch = useCallback(async (canonicalName) => {
    if (!canonicalName) return null;
    if (ingredientCache.current.has(canonicalName)) {
      return ingredientCache.current.get(canonicalName);
    }
    try {
      const data = await apiRequest(`/api/kitchenIngredients?q=${encodeURIComponent(canonicalName)}`);
      const match = (data.ingredients || []).find((item) => item.canonicalName === canonicalName);
      ingredientCache.current.set(canonicalName, match || null);
      return match || null;
    } catch (err) {
      return null;
    }
  }, []);

  const resolveIngredients = useCallback(
    async (ingredients = []) => {
      const resolved = await Promise.all(
        ingredients.map(async (item) => {
          const displayName = String(item?.displayName || "").trim();
          const canonicalName = String(
            item?.canonicalName || normalizeIngredientName(displayName)
          ).trim();
          const match = await fetchIngredientMatch(canonicalName);
          const ingredientId = item?.ingredientId || match?._id;
          return {
            ingredientId,
            displayName,
            canonicalName,
            category: match?.categoryId || null,
            status: ingredientId ? "resolved" : "pending"
          };
        })
      );
      return resolved.filter((entry) => entry.displayName);
    },
    [fetchIngredientMatch]
  );

  useEffect(() => {
    if (!plan?.days) {
      return;
    }
    let active = true;
    const loadExtras = async () => {
      const resolved = await Promise.all(
        plan.days.map(async (day) => {
          const key = day.date.slice(0, 10);
          const items = await resolveIngredients(day.ingredientOverrides || []);
          return [key, items];
        })
      );
      if (!active) return;
      setExtraIngredientsByDay((prev) => {
        const next = { ...prev };
        resolved.forEach(([key, items]) => {
          next[key] = items;
        });
        return next;
      });
    };
    loadExtras();
    return () => {
      active = false;
    };
  }, [plan, resolveIngredients]);

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
  const dishMap = useMemo(() => {
    const map = new Map();
    dishes.forEach((dish) => {
      map.set(dish._id, dish);
    });
    return map;
  }, [dishes]);
  const sideDishes = useMemo(() => dishes.filter((dish) => dish.isSide), [dishes]);
  const showCookTiming = useMemo(() => {
    if (!plan?.days?.length) {
      return false;
    }
    const [first] = plan.days;
    return plan.days.some((day) => day.cookTiming !== first.cookTiming);
  }, [plan]);

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
      return data.plan;
    } catch (err) {
      const message = err.message || "No se pudo actualizar el día.";
      setDayErrors((prev) => ({ ...prev, [dayKey]: message }));
      setDayStatus((prev) => ({ ...prev, [dayKey]: "error" }));
      return null;
    }
  };

  const onAssignSelf = async (day) => {
    return updateDay(day, { cookUserId: user?.id || user?._id });
  };

  const startEditingDay = (day) => {
    const dayKey = day.date.slice(0, 10);
    const dishName = day.mainDishId ? dishMap.get(day.mainDishId)?.name : "";
    setEditingDays((prev) => ({ ...prev, [dayKey]: true }));
    setSideDishEnabled((prev) => ({ ...prev, [dayKey]: Boolean(day.sideDishId) }));
    setMainDishQueries((prev) => ({ ...prev, [dayKey]: dishName || "" }));
    setMainDishOpen((prev) => ({ ...prev, [dayKey]: false }));
  };

  const stopEditingDay = (dayKey) => {
    setEditingDays((prev) => ({ ...prev, [dayKey]: false }));
    setMainDishOpen((prev) => ({ ...prev, [dayKey]: false }));
  };

  const focusMainDish = (dayKey) => {
    window.requestAnimationFrame(() => {
      const node = mainDishRefs.current.get(dayKey);
      if (node) {
        node.focus();
      }
    });
  };

  const handleAssignCta = async (day, canEdit, isAssigned) => {
    const dayKey = day.date.slice(0, 10);
    if (canEdit) {
      startEditingDay(day);
      focusMainDish(dayKey);
      return;
    }
    if (!isAssigned && user) {
      const updatedPlan = await onAssignSelf(day);
      if (updatedPlan) {
        startEditingDay(day);
        focusMainDish(dayKey);
      }
    }
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

  const handleCategoryCreated = useCallback(async (name, color) => {
    const payload = { name };
    if (color?.colorBg) {
      payload.colorBg = color.colorBg;
      payload.colorText = color.colorText;
    }
    const data = await apiRequest("/api/categories", {
      method: "POST",
      body: JSON.stringify(payload)
    });
    const category = data.category;
    setCategories((prev) => {
      if (prev.some((item) => item._id === category._id)) {
        return prev;
      }
      return [...prev, category];
    });
    return category;
  }, []);

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
          const canEdit = user?.role === "admin" || isAssignedToSelf;
          const isEditing = Boolean(editingDays[dayKey]);
          const mainDish = day.mainDishId ? dishMap.get(day.mainDishId) : null;
          const sideDish = day.sideDishId ? dishMap.get(day.sideDishId) : null;
          const showSideDish = Boolean(sideDish);
          const sideDishOn = Boolean(sideDishEnabled[dayKey]);
          const baseIngredients = mainDish?.ingredients || [];
          const extraIngredients = day.ingredientOverrides || [];
          const extraIngredientsValue =
            extraIngredientsByDay[dayKey] ||
            extraIngredients.map((item) => ({
              ingredientId: item.ingredientId,
              displayName: item.displayName,
              canonicalName: item.canonicalName,
              status: item.ingredientId ? "resolved" : "pending"
            }));
          const mainDishQuery = mainDishQueries[dayKey] ?? mainDish?.name ?? "";
          const filteredMainDishes = dishes.filter((dish) =>
            dish.name.toLowerCase().includes(mainDishQuery.toLowerCase())
          );
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
                  {showCookTiming ? (
                    <span>Cocina: {day.cookTiming === "same_day" ? "mismo día" : "día anterior"}</span>
                  ) : null}
                  {cookUser?.displayName ? (
                    <span>Cocinero: {cookUser.displayName}</span>
                  ) : null}
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
                <div className="kitchen-day-cta">
                  {canEdit && !isEditing ? (
                    <button
                      type="button"
                      className="kitchen-button is-small"
                      onClick={() => startEditingDay(day)}
                    >
                      Editar
                    </button>
                  ) : null}
                  {isEditing ? (
                    <div className="kitchen-day-edit-actions">
                      <button
                        type="button"
                        className="kitchen-button is-small"
                        onClick={() => stopEditingDay(dayKey)}
                      >
                        Guardar
                      </button>
                      <button
                        type="button"
                        className="kitchen-button secondary is-small"
                        onClick={() => stopEditingDay(dayKey)}
                      >
                        Cancelar
                      </button>
                    </div>
                  ) : null}
                </div>
              </div>

              {!isEditing ? (
                <div className="kitchen-day-view">
                  <div className="kitchen-day-info">
                    <span className="kitchen-day-info-label">Plato principal</span>
                    <span className="kitchen-day-info-value">{mainDish?.name || "Sin plato"}</span>
                  </div>
                  {showSideDish ? (
                    <div className="kitchen-day-info">
                      <span className="kitchen-day-info-label">Guarnición</span>
                      <span className="kitchen-day-info-value">{sideDish?.name}</span>
                    </div>
                  ) : null}
                  {!isAssigned || !isPlanned ? (
                    <button
                      type="button"
                      className="kitchen-button"
                      onClick={() => handleAssignCta(day, canEdit, isAssigned)}
                    >
                      Asignar plato
                    </button>
                  ) : null}
                  <div className="kitchen-day-ingredients">
                    <span className="kitchen-label">Ingredientes</span>
                    <div className="kitchen-day-ingredient-pills">
                      {baseIngredients.length ? (
                        baseIngredients.map((item) => (
                          <span
                            key={item.ingredientId || item.canonicalName || item.displayName}
                            className="kitchen-ingredient-pill"
                          >
                            {item.displayName}
                          </span>
                        ))
                      ) : (
                        <span className="kitchen-muted">Sin ingredientes base.</span>
                      )}
                    </div>
                  </div>
                  {extraIngredients.length ? (
                    <div className="kitchen-day-ingredients">
                      <span className="kitchen-label">Extras</span>
                      <div className="kitchen-day-ingredient-pills is-extra">
                        {extraIngredients.map((item) => (
                          <span key={item.ingredientId || item.canonicalName || item.displayName} className="kitchen-ingredient-pill is-extra">
                            {item.displayName}
                          </span>
                        ))}
                      </div>
                    </div>
                  ) : null}
                </div>
              ) : (
                <>
                  <label className="kitchen-field">
                    <span className="kitchen-label">Plato principal</span>
                    <div className="kitchen-ingredient-search">
                      <input
                        ref={(node) => {
                          if (!node) {
                            mainDishRefs.current.delete(dayKey);
                            return;
                          }
                          mainDishRefs.current.set(dayKey, node);
                        }}
                        className="kitchen-input"
                        value={mainDishQuery}
                        placeholder="Busca un plato…"
                        onFocus={() => setMainDishOpen((prev) => ({ ...prev, [dayKey]: true }))}
                        onBlur={() => {
                          const trimmed = mainDishQuery.trim();
                          const match = dishes.find(
                            (dish) => dish.name.toLowerCase() === trimmed.toLowerCase()
                          );
                          if (!trimmed) {
                            updateDay(day, { mainDishId: null });
                            setMainDishQueries((prev) => ({ ...prev, [dayKey]: "" }));
                          } else if (match) {
                            updateDay(day, { mainDishId: match._id });
                            setMainDishQueries((prev) => ({ ...prev, [dayKey]: match.name }));
                          } else {
                            setMainDishQueries((prev) => ({
                              ...prev,
                              [dayKey]: mainDish?.name || ""
                            }));
                          }
                          setMainDishOpen((prev) => ({ ...prev, [dayKey]: false }));
                        }}
                        onChange={(event) => {
                          const value = event.target.value;
                          setMainDishQueries((prev) => ({ ...prev, [dayKey]: value }));
                          setMainDishOpen((prev) => ({ ...prev, [dayKey]: true }));
                        }}
                      />
                      {mainDishOpen[dayKey] ? (
                        <div className="kitchen-suggestion-list">
                          <button
                            className="kitchen-suggestion"
                            type="button"
                            onMouseDown={(event) => {
                              event.preventDefault();
                              updateDay(day, { mainDishId: null });
                              setMainDishQueries((prev) => ({ ...prev, [dayKey]: "" }));
                              setMainDishOpen((prev) => ({ ...prev, [dayKey]: false }));
                            }}
                          >
                            Sin plato
                          </button>
                          {filteredMainDishes.length ? (
                            filteredMainDishes.map((dish) => (
                              <button
                                className="kitchen-suggestion"
                                key={dish._id}
                                type="button"
                                onMouseDown={(event) => {
                                  event.preventDefault();
                                  updateDay(day, { mainDishId: dish._id });
                                  setMainDishQueries((prev) => ({ ...prev, [dayKey]: dish.name }));
                                  setMainDishOpen((prev) => ({ ...prev, [dayKey]: false }));
                                }}
                              >
                                <span className="kitchen-suggestion-name">{dish.name}</span>
                              </button>
                            ))
                          ) : (
                            <div className="kitchen-muted">Sin coincidencias.</div>
                          )}
                        </div>
                      ) : null}
                    </div>
                  </label>

                  <label className="kitchen-field">
                    <span className="kitchen-label">Añadir guarnición</span>
                    <input
                      type="checkbox"
                      checked={sideDishOn}
                      onChange={(event) => {
                        const nextValue = event.target.checked;
                        setSideDishEnabled((prev) => ({ ...prev, [dayKey]: nextValue }));
                        if (!nextValue) {
                          updateDay(day, { sideDishId: null });
                        }
                      }}
                    />
                  </label>

                  {sideDishOn ? (
                    <label className="kitchen-field">
                      <span className="kitchen-label">Guarnición</span>
                      <select
                        className="kitchen-select"
                        value={day.sideDishId || ""}
                        onChange={(event) => updateDay(day, { sideDishId: event.target.value || null })}
                      >
                        <option value="">Sin guarnición</option>
                        {sideDishes.map((dish) => (
                          <option key={dish._id} value={dish._id}>{dish.name}</option>
                        ))}
                      </select>
                    </label>
                  ) : null}

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

                  <div className="kitchen-day-ingredients">
                    <span className="kitchen-label">Ingredientes base</span>
                    <div className="kitchen-day-ingredient-pills">
                      {baseIngredients.length ? (
                        baseIngredients.map((item) => (
                          <span
                            key={item.ingredientId || item.canonicalName || item.displayName}
                            className="kitchen-ingredient-pill"
                          >
                            {item.displayName}
                          </span>
                        ))
                      ) : (
                        <span className="kitchen-muted">Sin ingredientes base.</span>
                      )}
                    </div>
                  </div>

                  <div className="kitchen-field kitchen-day-ingredients">
                    <span className="kitchen-label">Extras</span>
                    <IngredientPicker
                      value={extraIngredientsValue}
                      onChange={(next) => {
                        setExtraIngredientsByDay((prev) => ({ ...prev, [dayKey]: next }));
                        const overrides = next
                          .map((item) => ({
                            displayName: item.displayName,
                            canonicalName: item.canonicalName,
                            ...(item.ingredientId ? { ingredientId: item.ingredientId } : {})
                          }))
                          .filter((item) => item.displayName && item.canonicalName);
                        updateDay(day, { ingredientOverrides: overrides });
                      }}
                      categories={categories}
                      onCategoryCreated={handleCategoryCreated}
                    />
                  </div>

                  <div className="kitchen-actions">
                    {!isAssignedToSelf ? (
                      <button className="kitchen-button" onClick={() => onAssignSelf(day)}>
                        Me lo asigno
                      </button>
                    ) : null}
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
                </>
              )}
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
