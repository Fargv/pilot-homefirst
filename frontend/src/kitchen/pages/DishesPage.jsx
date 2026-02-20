import React, { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { apiRequest } from "../api.js";
import KitchenLayout from "../Layout.jsx";
import { useAuth } from "../auth";
import DishModal from "../components/DishModal.jsx";
import IngredientModal from "../components/IngredientModal.jsx";
import CategoryChip from "../components/CategoryChip.jsx";
import { resolveCategoryColors } from "../components/categoryUtils.js";
import { normalizeIngredientName } from "../utils/normalize.js";

const ASSIGN_DAY_LABELS = ["D", "L", "M", "X", "J", "V", "S"];

function getMondayISO(date = new Date()) {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const day = d.getUTCDay();
  const diff = (day === 0 ? -6 : 1) - day;
  d.setUTCDate(d.getUTCDate() + diff);
  return d.toISOString().slice(0, 10);
}

function addDaysToISO(dateString, days) {
  const [year, month, day] = dateString.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function buildAssignDays(weekStart) {
  return Array.from({ length: 7 }, (_, index) => {
    const date = addDaysToISO(weekStart, index);
    return {
      date,
      label: getAssignDayLabel(date),
      number: getAssignDayNumber(date)
    };
  });
}

function formatWeekLabel(dateString) {
  if (!dateString) return "-";
  const date = new Date(`${dateString}T00:00:00Z`);
  if (Number.isNaN(date.getTime())) return "-";
  return date.toLocaleDateString("es-ES", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric"
  });
}

function getAssignDayLabel(dateString) {
  if (!dateString) return "-";
  const date = new Date(`${dateString}T00:00:00Z`);
  const dayIndex = date.getUTCDay();
  return ASSIGN_DAY_LABELS[dayIndex] || "-";
}

function getAssignDayNumber(dateString) {
  if (!dateString) return "-";
  const date = new Date(`${dateString}T00:00:00Z`);
  return date.getUTCDate();
}

function ChevronIcon(props) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" {...props}>
      <path d="M15 18l-6-6 6-6" />
    </svg>
  );
}

export default function DishesPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [dishes, setDishes] = useState([]);
  const [categories, setCategories] = useState([]);
  const [loading, setLoading] = useState(true);
  const [dishError, setDishError] = useState("");
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [activeDish, setActiveDish] = useState(null);
  const [dishSearchTerm, setDishSearchTerm] = useState("");
  const [activeTab, setActiveTab] = useState("main");
  const [initialSidedish, setInitialSidedish] = useState(false);
  const [ingredients, setIngredients] = useState([]);
  const [ingredientsLoading, setIngredientsLoading] = useState(false);
  const [ingredientsError, setIngredientsError] = useState("");
  const [ingredientSearchTerm, setIngredientSearchTerm] = useState("");
  const [isIngredientModalOpen, setIsIngredientModalOpen] = useState(false);
  const [activeIngredient, setActiveIngredient] = useState(null);
  const [assignModalOpen, setAssignModalOpen] = useState(false);
  const [assignDish, setAssignDish] = useState(null);
  const [assignDate, setAssignDate] = useState("");
  const todayKey = new Date().toISOString().slice(0, 10);
  const currentWeekStart = useMemo(
    () => getMondayISO(new Date(`${todayKey}T00:00:00Z`)),
    [todayKey]
  );
  const [assignWeekStart, setAssignWeekStart] = useState(currentWeekStart);
  const [assignWeekData, setAssignWeekData] = useState({
    status: "idle",
    occupied: {},
    dishNames: {}
  });
  const isDiodGlobalMode = user?.globalRole === "diod" && !user?.activeHouseholdId;

  const loadDishes = async () => {
    setLoading(true);
    setDishError("");
    try {
      const data = await apiRequest("/api/kitchen/dishes");
      setDishes(data.dishes || []);
    } catch (err) {
      setDishError(err.message || "No se pudieron cargar los platos.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadDishes();
  }, []);

  const loadCategories = async () => {
    try {
      const data = await apiRequest("/api/categories");
      setCategories(data.categories || []);
    } catch (err) {
      setDishError(err.message || "No se pudieron cargar las categorías.");
    }
  };

  useEffect(() => {
    loadCategories();
  }, []);

  const startEdit = useCallback(
    (dish) => {
      setDishError("");
      setActiveDish(dish);
      setIsModalOpen(true);
    },
    []
  );

  const startCreate = () => {
    setActiveDish(null);
    setDishError("");
    setInitialSidedish(activeTab === "side");
    setIsModalOpen(true);
  };

  const closeModal = () => {
    setIsModalOpen(false);
    setActiveDish(null);
  };

  const onCategoryCreated = async (name, colors = null) => {
    const data = await apiRequest("/api/categories", {
      method: "POST",
      body: JSON.stringify({
        name,
        colorBg: colors?.colorBg,
        colorText: colors?.colorText,
        ...(isDiodGlobalMode ? { scope: "master" } : {})
      })
    });
    const category = data.category;
    setCategories((prev) => {
      const exists = prev.find((item) => item._id === category._id);
      if (exists) return prev;
      return [...prev, category];
    });
    return category;
  };

  const normalizedSearch = useMemo(
    () => normalizeIngredientName(dishSearchTerm),
    [dishSearchTerm]
  );
  const tabFilteredDishes = useMemo(() => {
    const shouldShowSide = activeTab === "side";
    return dishes.filter((dish) => Boolean(dish.sidedish) === shouldShowSide);
  }, [activeTab, dishes]);
  const visibleDishes = useMemo(() => {
    if (!normalizedSearch) return tabFilteredDishes;
    return tabFilteredDishes.filter((dish) => {
      const nameMatch = normalizeIngredientName(dish.name || "").includes(normalizedSearch);
      if (nameMatch) return true;
      return (dish.ingredients || []).some((item) => {
        const displayName = normalizeIngredientName(item.displayName || "");
        const canonicalName = normalizeIngredientName(item.canonicalName || "");
        return displayName.includes(normalizedSearch) || canonicalName.includes(normalizedSearch);
      });
    });
  }, [normalizedSearch, tabFilteredDishes]);
  const dishMap = useMemo(() => {
    const map = new Map();
    dishes.forEach((dish) => {
      if (dish?._id) map.set(dish._id, dish);
    });
    return map;
  }, [dishes]);

  const emptyMessage = useMemo(() => {
    if (dishes.length === 0) {
      return "No hay platos aún. Crea el primero.";
    }
    if (visibleDishes.length === 0) {
      if (dishSearchTerm.trim()) {
        return "No encontramos platos con ese criterio.";
      }
      return activeTab === "side"
        ? "No hay guarniciones aún. Crea la primera."
        : "No hay platos principales aún. Crea el primero.";
    }
    return "";
  }, [activeTab, dishSearchTerm, dishes.length, visibleDishes.length]);

  const loadIngredients = useCallback(async (query = "") => {
    setIngredientsLoading(true);
    setIngredientsError("");
    try {
      const params = new URLSearchParams({ includeInactive: "true", limit: "0" });
      if (query.trim()) params.set("q", query.trim());
      const data = await apiRequest(`/api/kitchenIngredients?${params.toString()}`);
      setIngredients(data.ingredients || []);
    } catch (err) {
      setIngredientsError(err.message || "No se pudieron cargar los ingredientes.");
    } finally {
      setIngredientsLoading(false);
    }
  }, []);

  useEffect(() => {
    if (activeTab !== "ingredients") return;
    const timeout = setTimeout(() => {
      loadIngredients(ingredientSearchTerm);
    }, 250);
    return () => clearTimeout(timeout);
  }, [activeTab, ingredientSearchTerm, loadIngredients]);

  const startIngredientCreate = () => {
    setActiveIngredient(null);
    setIngredientsError("");
    setIsIngredientModalOpen(true);
  };

  const startIngredientEdit = (ingredient) => {
    setActiveIngredient(ingredient);
    setIngredientsError("");
    setIsIngredientModalOpen(true);
  };

  const closeIngredientModal = () => {
    setIsIngredientModalOpen(false);
    setActiveIngredient(null);
  };

  const assignDays = useMemo(() => {
    return buildAssignDays(assignWeekStart);
  }, [assignWeekStart]);

  useEffect(() => {
    if (!assignModalOpen) return;
    let isActive = true;
    setAssignWeekData({ status: "loading", occupied: {}, dishNames: {} });

    apiRequest(`/api/kitchen/weeks/${assignWeekStart}`)
      .then((data) => {
        if (!isActive) return;
        const occupied = {};
        const dishNames = {};
        (data?.plan?.days || []).forEach((day) => {
          const dayKey = day?.date?.slice(0, 10);
          if (!dayKey) return;
          if (day.mainDishId) {
            occupied[dayKey] = true;
            const dishName = dishMap.get(day.mainDishId)?.name;
            if (dishName) {
              dishNames[dayKey] = dishName;
            }
          }
        });
        setAssignWeekData({ status: "ready", occupied, dishNames });
      })
      .catch(() => {
        if (!isActive) return;
        setAssignWeekData({ status: "error", occupied: {}, dishNames: {} });
      });

    return () => {
      isActive = false;
    };
  }, [assignModalOpen, assignWeekStart, dishMap]);

  useEffect(() => {
    if (!assignModalOpen) return;
    const occupancyReady = assignWeekData.status === "ready";
    const isDateInWeek = assignDays.some((day) => day.date === assignDate);
    const isCurrentValid =
      assignDate &&
      isDateInWeek &&
      assignDate >= todayKey &&
      (!occupancyReady || !assignWeekData.occupied[assignDate]);
    if (isCurrentValid) return;
    const nextDate =
      assignDays.find(
        (day) =>
          day.date >= todayKey &&
          (!occupancyReady || !assignWeekData.occupied[day.date])
      )?.date || "";
    if (nextDate !== assignDate) {
      setAssignDate(nextDate);
    }
  }, [assignModalOpen, assignDate, assignDays, assignWeekData, todayKey]);

  const openAssignModal = (dish) => {
    if (!dish) return;
    const initialWeekStart = getMondayISO();
    const initialDays = buildAssignDays(initialWeekStart);
    const initialDate = initialDays.find((day) => day.date >= todayKey)?.date || "";
    setAssignDish(dish);
    setAssignWeekStart(initialWeekStart);
    setAssignDate(initialDate);
    setAssignModalOpen(true);
  };

  const closeAssignModal = () => {
    setAssignModalOpen(false);
    setAssignDish(null);
    setAssignDate("");
    setAssignWeekData({ status: "idle", occupied: {}, dishNames: {} });
  };

  const confirmAssign = () => {
    if (!assignDish?._id || !assignDate) return;
    navigate(`/kitchen/semana?assignPlateId=${assignDish._id}&date=${assignDate}`);
    closeAssignModal();
  };

  const ingredientEmptyMessage = useMemo(() => {
    if (ingredients.length === 0) {
      return "No hay ingredientes aún. Crea el primero.";
    }
    if (ingredientSearchTerm.trim()) {
      return "No encontramos ingredientes con ese criterio.";
    }
    return "";
  }, [ingredientSearchTerm, ingredients.length]);

  const isIngredientsTab = activeTab === "ingredients";
  const headerTitle = isIngredientsTab ? "Ingredientes" : "Platos";
  const headerDescription = isIngredientsTab
    ? "Gestiona el catálogo de ingredientes con sus categorías y estado."
    : "Administra tus platos y sus ingredientes en un solo lugar.";
  const headerActionLabel = isIngredientsTab
    ? "Nuevo ingrediente"
    : activeTab === "side"
      ? "Nueva guarnición"
      : "Nuevo plato";
  const headerActionHandler = isIngredientsTab ? startIngredientCreate : startCreate;

  return (
    <KitchenLayout>
      <div className="kitchen-dishes-page">
        {isDiodGlobalMode ? (
          <div className="kitchen-alert">Modo global DIOD: estás editando catálogo master sin hogar activo.</div>
        ) : null}
        <div className="kitchen-dishes-header">
          <div>
            <h2>{headerTitle}</h2>
            <p className="kitchen-muted">{headerDescription}</p>
          </div>
          <button className="kitchen-button" type="button" onClick={headerActionHandler}>
            {headerActionLabel}
          </button>
        </div>
        <div className="kitchen-dishes-tabs" role="tablist" aria-label="Secciones de cocina">
          <button
            className={`kitchen-tab-button ${activeTab === "main" ? "is-active" : ""}`}
            type="button"
            role="tab"
            aria-selected={activeTab === "main"}
            onClick={() => setActiveTab("main")}
          >
            Platos
          </button>
          <button
            className={`kitchen-tab-button ${activeTab === "side" ? "is-active" : ""}`}
            type="button"
            role="tab"
            aria-selected={activeTab === "side"}
            onClick={() => setActiveTab("side")}
          >
            Guarniciones
          </button>
          <button
            className={`kitchen-tab-button ${activeTab === "ingredients" ? "is-active" : ""}`}
            type="button"
            role="tab"
            aria-selected={activeTab === "ingredients"}
            onClick={() => setActiveTab("ingredients")}
          >
            Ingredientes
          </button>
        </div>
        <div className="kitchen-dishes-search">
          <input
            className="kitchen-input"
            placeholder={
              isIngredientsTab ? "Buscar ingrediente…" : "Buscar por plato o ingrediente…"
            }
            value={isIngredientsTab ? ingredientSearchTerm : dishSearchTerm}
            onChange={(event) =>
              isIngredientsTab
                ? setIngredientSearchTerm(event.target.value)
                : setDishSearchTerm(event.target.value)
            }
          />
        </div>
        {isIngredientsTab ? (
          ingredientsLoading ? (
            <div className="kitchen-card kitchen-dishes-loading">Cargando ingredientes...</div>
          ) : ingredients.length === 0 ? (
            <div className="kitchen-card kitchen-empty">
              <p>{ingredientEmptyMessage}</p>
            </div>
          ) : (
            <div className="kitchen-dishes-grid">
              {ingredients.map((ingredient) => {
                const category = ingredient.categoryId || null;
                const colors = resolveCategoryColors(category);
                return (
                  <article className="kitchen-dish-card kitchen-ingredient-card" key={ingredient._id}>
                    <div>
                      <div className="kitchen-dish-title-row">
                        <h3 className="kitchen-dish-name">{ingredient.name}</h3>
                        <span
                          className={`kitchen-status-pill ${
                            ingredient.active ? "active" : "inactive"
                          }`}
                        >
                          {ingredient.active ? "Activo" : "Inactivo"}
                        </span>
                      </div>
                      <p className="kitchen-ingredient-canonical">
                        Canonical: {ingredient.canonicalName}
                      </p>
                      {category ? (
                        <div className="kitchen-ingredient-tags">
                          <CategoryChip
                            label={category.name}
                            colorBg={category.colorBg || colors.colorBg}
                            colorText={category.colorText || colors.colorText}
                          />
                        </div>
                      ) : null}
                    </div>
                    <div className="kitchen-dish-actions">
                      <button
                        className="kitchen-icon-button"
                        type="button"
                        onClick={() => startIngredientEdit(ingredient)}
                        aria-label={`Editar ${ingredient.name}`}
                      >
                        <svg viewBox="0 0 24 24" aria-hidden="true">
                          <path
                            d="M16.862 4.487a2.25 2.25 0 0 1 3.182 3.182l-9.19 9.19a2.25 2.25 0 0 1-1.06.592l-3.293.823.823-3.293a2.25 2.25 0 0 1 .592-1.06l9.19-9.19Z"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="1.5"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                          />
                          <path
                            d="M15.75 5.625 18.375 8.25"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="1.5"
                            strokeLinecap="round"
                          />
                        </svg>
                      </button>
                    </div>
                  </article>
                );
              })}
            </div>
          )
        ) : loading ? (
          <div className="kitchen-card kitchen-dishes-loading">Cargando platos...</div>
        ) : visibleDishes.length === 0 ? (
          <div className="kitchen-card kitchen-empty">
            <p>{emptyMessage}</p>
          </div>
        ) : (
          <div className="kitchen-dishes-grid">
            {visibleDishes.map((dish) => {
              const ingredientsText =
                (dish.ingredients || []).map((item) => item.displayName).join(", ") ||
                "Sin ingredientes";
              return (
                <article
                  className={`kitchen-dish-card ${dish.sidedish ? "is-sidedish" : ""}`}
                  key={dish._id}
                >
                  <div>
                    <div className="kitchen-dish-title-row">
                      <h3 className="kitchen-dish-name">{dish.name}</h3>
                      {dish.sidedish ? <span className="kitchen-dish-badge">Guarnición</span> : null}
                    </div>
                    <p className="kitchen-dish-ingredients-text" title={ingredientsText}>
                      {ingredientsText}
                    </p>
                  </div>
                  <div className="kitchen-dish-actions">
                    <button
                      className="kitchen-icon-button"
                      type="button"
                      onClick={() => startEdit(dish)}
                      aria-label={`Editar ${dish.name}`}
                    >
                      <svg viewBox="0 0 24 24" aria-hidden="true">
                        <path
                          d="M16.862 4.487a2.25 2.25 0 0 1 3.182 3.182l-9.19 9.19a2.25 2.25 0 0 1-1.06.592l-3.293.823.823-3.293a2.25 2.25 0 0 1 .592-1.06l9.19-9.19Z"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="1.5"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        />
                        <path
                          d="M15.75 5.625 18.375 8.25"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="1.5"
                          strokeLinecap="round"
                        />
                      </svg>
                    </button>
                    {!isDiodGlobalMode ? (
                    <button
                      className="kitchen-icon-button assign"
                      type="button"
                      onClick={() => openAssignModal(dish)}
                      aria-label="Asignar"
                      title="Asignar"
                    >
                      <svg viewBox="0 0 24 24" aria-hidden="true">
                        <path
                          d="M8 7V5a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2M5 10h14a2 2 0 0 1 2 2v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-7a2 2 0 0 1 2-2Z"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="1.5"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        />
                        <path
                          d="m8 15 2 2 4-4"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="1.5"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        />
                      </svg>
                    </button>
                    ) : null}
                    {dish.sidedish || user?.role === "admin" || user?.globalRole === "diod" ? (
                      <button
                        className="kitchen-icon-button danger"
                        type="button"
                        onClick={async () => {
                          await apiRequest(`/api/kitchen/dishes/${dish._id}`, { method: "DELETE" });
                          if (activeDish?._id === dish._id) closeModal();
                          loadDishes();
                        }}
                        aria-label={`Eliminar ${dish.name}`}
                      >
                        <svg viewBox="0 0 24 24" aria-hidden="true">
                          <path
                            d="M4 7h16M10 11v6m4-6v6M9 4h6l1 2H8l1-2Z"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="1.5"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                          />
                          <path
                            d="M6 7l1 12a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2l1-12"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="1.5"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                          />
                        </svg>
                      </button>
                    ) : null}
                  </div>
                </article>
              );
            })}
          </div>
        )}
        {dishError ? <div className="kitchen-alert error">{dishError}</div> : null}
        {ingredientsError && isIngredientsTab ? (
          <div className="kitchen-alert error">{ingredientsError}</div>
        ) : null}
      </div>

      <DishModal
        isOpen={isModalOpen}
        onClose={closeModal}
        onSaved={async () => {
          await loadDishes();
        }}
        categories={categories}
        onCategoryCreated={onCategoryCreated}
        initialDish={activeDish}
        initialSidedish={initialSidedish}
        scope={isDiodGlobalMode ? "master" : undefined}
      />
      <IngredientModal
        isOpen={isIngredientModalOpen}
        onClose={closeIngredientModal}
        onSaved={async () => {
          await loadIngredients(ingredientSearchTerm);
        }}
        categories={categories}
        onCategoryCreated={onCategoryCreated}
        initialIngredient={activeIngredient}
        scope={isDiodGlobalMode ? "master" : undefined}
      />
      {assignModalOpen ? (
        <div className="kitchen-modal-backdrop" role="presentation" onClick={closeAssignModal}>
          <div
            className="kitchen-modal kitchen-assign-modal"
            role="dialog"
            aria-modal="true"
            aria-label="Asignar plato"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="kitchen-modal-header">
              <div>
                <h3>Asignar plato</h3>
                <p className="kitchen-muted">
                  Selecciona el día en el que quieres planificar {assignDish?.name}.
                </p>
              </div>
              <button
                className="kitchen-icon-button"
                type="button"
                onClick={closeAssignModal}
                aria-label="Cerrar"
              >
                <svg viewBox="0 0 24 24" aria-hidden="true">
                  <path
                    d="M6 6l12 12M18 6 6 18"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.5"
                    strokeLinecap="round"
                  />
                </svg>
              </button>
            </div>
            <div className="kitchen-assign-body">
              <div className="kitchen-assign-week-header" role="group" aria-label="Cambiar semana">
                <button
                  className="kitchen-assign-week-nav"
                  type="button"
                  onClick={() => setAssignWeekStart((prev) => addDaysToISO(prev, -7))}
                  aria-label="Ir a la semana anterior"
                  disabled={assignWeekStart <= currentWeekStart}
                >
                  <ChevronIcon className="kitchen-assign-week-icon" />
                </button>
                <span className="kitchen-assign-week-label">
                  Semana del {formatWeekLabel(assignWeekStart)}
                </span>
                <button
                  className="kitchen-assign-week-nav"
                  type="button"
                  onClick={() => setAssignWeekStart((prev) => addDaysToISO(prev, 7))}
                  aria-label="Ir a la semana siguiente"
                >
                  <ChevronIcon className="kitchen-assign-week-icon is-next" />
                </button>
              </div>
              <div className="kitchen-assign-days" role="group" aria-label="Selecciona el día">
                {assignDays.map((day) => {
                  const occupancyReady = assignWeekData.status === "ready";
                  const isOccupied = occupancyReady && assignWeekData.occupied[day.date];
                  const isDisabled = day.date < todayKey || isOccupied;
                  const isSelected = assignDate === day.date;
                  const occupiedDishName = isOccupied ? assignWeekData.dishNames[day.date] : "";
                  return (
                    <button
                      key={day.date}
                      type="button"
                      className={`kitchen-assign-day ${isSelected ? "is-selected" : ""} ${
                        isOccupied ? "is-occupied" : ""
                      }`}
                      onClick={() => setAssignDate(day.date)}
                      disabled={isDisabled}
                      aria-pressed={isSelected}
                      title={occupiedDishName ? `Ocupado: ${occupiedDishName}` : undefined}
                    >
                      <span className="kitchen-assign-day-label">{day.label}</span>
                      <span className="kitchen-assign-day-number">{day.number}</span>
                      {isOccupied ? (
                        <span className="kitchen-assign-day-status">
                          Ocupado
                          {occupiedDishName ? (
                            <span className="kitchen-assign-day-detail">{occupiedDishName}</span>
                          ) : null}
                        </span>
                      ) : null}
                    </button>
                  );
                })}
              </div>
            </div>
            <div className="kitchen-modal-actions">
              <button className="kitchen-button" type="button" onClick={confirmAssign} disabled={!assignDate}>
                Confirmar día
              </button>
              <button className="kitchen-button secondary" type="button" onClick={closeAssignModal}>
                Cancelar
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </KitchenLayout>
  );
}
