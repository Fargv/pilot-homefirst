import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { apiRequest } from "../api.js";
import KitchenLayout from "../Layout.jsx";
import { useAuth } from "../auth";
import DishModal from "../components/DishModal.jsx";
import IngredientModal from "../components/IngredientModal.jsx";
import CategoryIcon from "../components/CategoryIcon.jsx";
import { resolveCategoryCode } from "../components/categoryIconMap.js";
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
  const [dishCategories, setDishCategories] = useState([]);
  const [loading, setLoading] = useState(true);
  const [dishError, setDishError] = useState("");
  const [dishSuccess, setDishSuccess] = useState("");
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [activeDish, setActiveDish] = useState(null);
  const [dishSearchTerm, setDishSearchTerm] = useState("");
  const [selectedDishCategoryIds, setSelectedDishCategoryIds] = useState([]);
  const [activeTab, setActiveTab] = useState("main");
  const [initialSidedish, setInitialSidedish] = useState(false);
  const [ingredients, setIngredients] = useState([]);
  const [ingredientsLoading, setIngredientsLoading] = useState(false);
  const [ingredientsError, setIngredientsError] = useState("");
  const [ingredientSearchTerm, setIngredientSearchTerm] = useState("");
  const [isIngredientModalOpen, setIsIngredientModalOpen] = useState(false);
  const [activeIngredient, setActiveIngredient] = useState(null);
  const [ingredientInfoOpenId, setIngredientInfoOpenId] = useState(null);
  const [assignModalOpen, setAssignModalOpen] = useState(false);
  const [assignDish, setAssignDish] = useState(null);
  const [assignDate, setAssignDate] = useState("");
  const [deleteDishModal, setDeleteDishModal] = useState({ open: false, dish: null, deleting: false });
  const [dishInfoOpenId, setDishInfoOpenId] = useState(null);
  const [isInfoMobile, setIsInfoMobile] = useState(false);
  const infoPopoverRef = useRef(null);
  const ingredientInfoPopoverRef = useRef(null);
  const infoButtonRefs = useRef(new Map());
  const ingredientInfoButtonRefs = useRef(new Map());
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

  useEffect(() => {
    if (typeof window === "undefined" || typeof window.matchMedia !== "function") return undefined;
    const mediaQuery = window.matchMedia("(max-width: 600px)");
    const updateMediaState = () => {
      setIsInfoMobile(mediaQuery.matches);
    };
    updateMediaState();
    if (typeof mediaQuery.addEventListener === "function") {
      mediaQuery.addEventListener("change", updateMediaState);
      return () => mediaQuery.removeEventListener("change", updateMediaState);
    }
    mediaQuery.addListener(updateMediaState);
    return () => mediaQuery.removeListener(updateMediaState);
  }, []);

  const loadDishes = async () => {
    if (isDiodGlobalMode) {
      setDishes([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    setDishError("");
    try {
      const [mainData, sideData] = await Promise.all([
        apiRequest("/api/kitchen/dishes"),
        apiRequest("/api/kitchen/dishes?sidedish=true")
      ]);
      const merged = new Map();
      [...(mainData.dishes || []), ...(sideData.dishes || [])].forEach((dish) => {
        if (dish?._id) merged.set(dish._id, dish);
      });
      setDishes(Array.from(merged.values()));
    } catch (err) {
      setDishError(err.message || "No se pudieron cargar los platos.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadDishes();
  }, [isDiodGlobalMode, user?.activeHouseholdId, user?.id]);

  useEffect(() => {
    if (!dishSuccess) return undefined;
    const timer = window.setTimeout(() => setDishSuccess(""), 2200);
    return () => window.clearTimeout(timer);
  }, [dishSuccess]);

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

  const loadDishCategories = async () => {
    try {
      const data = await apiRequest("/api/kitchen/dish-categories");
      setDishCategories(data.categories || []);
    } catch (err) {
      setDishError(err.message || "No se pudieron cargar las categorías de plato.");
    }
  };

  useEffect(() => {
    loadDishCategories();
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
  const categoryFilteredDishes = useMemo(() => {
    if (!selectedDishCategoryIds.length) return tabFilteredDishes;
    const selectedSet = new Set(selectedDishCategoryIds.map((id) => String(id)));
    return tabFilteredDishes.filter((dish) => {
      const categoryId = dish?.dishCategoryId?._id || dish?.dishCategoryId || "";
      return categoryId ? selectedSet.has(String(categoryId)) : false;
    });
  }, [selectedDishCategoryIds, tabFilteredDishes]);
  const visibleDishes = useMemo(() => {
    if (!normalizedSearch) return categoryFilteredDishes;
    return categoryFilteredDishes.filter((dish) => {
      const nameMatch = normalizeIngredientName(dish.name || "").includes(normalizedSearch);
      if (nameMatch) return true;
      return (dish.ingredients || []).some((item) => {
        const displayName = normalizeIngredientName(item.displayName || "");
        const canonicalName = normalizeIngredientName(item.canonicalName || "");
        return displayName.includes(normalizedSearch) || canonicalName.includes(normalizedSearch);
      });
    });
  }, [categoryFilteredDishes, normalizedSearch]);
  const dishMap = useMemo(() => {
    const map = new Map();
    dishes.forEach((dish) => {
      if (dish?._id) map.set(dish._id, dish);
    });
    return map;
  }, [dishes]);
  const dishCategoryMap = useMemo(() => {
    const map = new Map();
    dishCategories.forEach((category) => {
      if (category?._id) map.set(String(category._id), category);
    });
    return map;
  }, [dishCategories]);
  const filterChips = useMemo(() => {
    const inTabIds = new Set(
      tabFilteredDishes
        .map((dish) => dish?.dishCategoryId?._id || dish?.dishCategoryId || "")
        .filter(Boolean)
        .map((id) => String(id))
    );
    const selectedSet = new Set(selectedDishCategoryIds.map((id) => String(id)));
    const activeCategories = dishCategories.filter((category) => category?.active !== false);
    const scoped = activeCategories.filter((category) => {
      const id = String(category?._id || "");
      return inTabIds.has(id) || selectedSet.has(id);
    });
    return scoped.length ? scoped : activeCategories;
  }, [dishCategories, selectedDishCategoryIds, tabFilteredDishes]);

  const emptyMessage = useMemo(() => {
    if (dishes.length === 0) {
      return "No hay platos aún. Crea el primero.";
    }
    if (visibleDishes.length === 0) {
      if (dishSearchTerm.trim()) {
        return "No encontramos platos con ese criterio.";
      }
      if (selectedDishCategoryIds.length) {
        return "No hay platos en las categorías seleccionadas.";
      }
      return activeTab === "side"
        ? "No hay guarniciones aún. Crea la primera."
        : "No hay platos principales aún. Crea el primero.";
    }
    return "";
  }, [activeTab, dishSearchTerm, dishes.length, selectedDishCategoryIds.length, visibleDishes.length]);

  useEffect(() => {
    setSelectedDishCategoryIds((previous) => {
      if (!previous.length) return previous;
      const available = new Set(dishCategories.map((category) => String(category?._id || "")));
      const next = previous.filter((id) => available.has(String(id)));
      return next.length === previous.length ? previous : next;
    });
  }, [dishCategories]);

  useEffect(() => {
    if (activeTab === "ingredients" && selectedDishCategoryIds.length) {
      setSelectedDishCategoryIds([]);
    }
  }, [activeTab, selectedDishCategoryIds.length]);

  const loadIngredients = useCallback(async (query = "") => {
    setIngredientsLoading(true);
    setIngredientsError("");
    try {
      const params = new URLSearchParams({ limit: "0" });
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

  useEffect(() => {
    const onCatalogInvalidated = () => {
      void loadCategories();
      if (activeTab === "ingredients") {
        void loadIngredients(ingredientSearchTerm);
      }
    };
    window.addEventListener("kitchen:catalog-invalidated", onCatalogInvalidated);
    return () => window.removeEventListener("kitchen:catalog-invalidated", onCatalogInvalidated);
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

  const duplicateIngredient = async (ingredient) => {
    if (!ingredient?._id) return;
    const sourceName = (ingredient.name || "Ingrediente").trim();
    const duplicateName = `${sourceName} (copia)`;
    await apiRequest("/api/kitchenIngredients", {
      method: "POST",
      body: JSON.stringify({
        name: duplicateName,
        categoryId: ingredient.categoryId?._id || ingredient.categoryId || undefined
      })
    });
    await loadIngredients(ingredientSearchTerm);
  };

  const deleteIngredient = async (ingredient) => {
    if (!ingredient?._id) return;
    const confirmed = window.confirm(`¿Estás seguro de eliminar ${ingredient.name}?`);
    if (!confirmed) return;
    await apiRequest(`/api/kitchenIngredients/${ingredient._id}`, { method: "DELETE" });
    if (activeIngredient?._id === ingredient._id) closeIngredientModal();
    if (ingredientInfoOpenId === ingredient._id) setIngredientInfoOpenId(null);
    await loadIngredients(ingredientSearchTerm);
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
    if (isDiodGlobalMode) {
      setAssignWeekData({ status: "error", occupied: {}, dishNames: {} });
      return;
    }
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
          const expectedMealType = assignDish?.isDinner ? "dinner" : "lunch";
          if (normalizeMealType(day?.mealType) !== expectedMealType) return;
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
  }, [assignModalOpen, assignWeekStart, dishMap, isDiodGlobalMode, assignDish?.isDinner]);

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
    if (!dish || isDiodGlobalMode) return;
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
    if (isDiodGlobalMode) return;
    if (!assignDish?._id || !assignDate) return;
    const mealType = assignDish?.isDinner ? "dinner" : "lunch";
    navigate(`/kitchen/semana?assignPlateId=${assignDish._id}&date=${assignDate}&mealType=${mealType}`);
    closeAssignModal();
  };

  const askDeleteDish = (dish) => {
    if (!dish?._id) return;
    setDeleteDishModal({ open: true, dish, deleting: false });
  };

  const confirmDeleteDish = async () => {
    if (!deleteDishModal.dish?._id || deleteDishModal.deleting) return;
    try {
      setDeleteDishModal((prev) => ({ ...prev, deleting: true }));
      const deletedId = String(deleteDishModal.dish._id);
      await apiRequest(`/api/kitchen/dishes/${deletedId}`, { method: "DELETE" });
      setDishes((prev) => prev.filter((item) => String(item?._id) !== deletedId));
      if (activeDish?._id === deletedId) closeModal();
      if (dishInfoOpenId === deletedId) closeDishInfo();
      setDeleteDishModal({ open: false, dish: null, deleting: false });
      setDishError("");
      setDishSuccess("Plato eliminado");
      await loadDishes();
    } catch (err) {
      setDishError(err.message || "No se pudo eliminar el plato.");
      setDeleteDishModal((prev) => ({ ...prev, deleting: false }));
    }
  };

  const closeDishInfo = useCallback(() => {
    setDishInfoOpenId(null);
  }, []);

  const toggleDishInfo = useCallback((dishId) => {
    setIngredientInfoOpenId(null);
    setDishInfoOpenId((previousId) => (previousId === dishId ? null : dishId));
  }, []);

  const registerInfoButton = useCallback((dishId, node) => {
    if (!dishId) return;
    if (node) {
      infoButtonRefs.current.set(dishId, node);
      return;
    }
    infoButtonRefs.current.delete(dishId);
  }, []);

  useEffect(() => {
    if (!dishInfoOpenId) return;
    const exists = dishes.some((dish) => dish?._id === dishInfoOpenId);
    if (!exists) {
      setDishInfoOpenId(null);
    }
  }, [dishInfoOpenId, dishes]);

  useEffect(() => {
    if (activeTab === "ingredients" && dishInfoOpenId) {
      setDishInfoOpenId(null);
    }
  }, [activeTab, dishInfoOpenId]);

  useEffect(() => {
    if (!dishInfoOpenId) return;
    const onKeyDown = (event) => {
      if (event.key === "Escape") {
        setDishInfoOpenId(null);
      }
    };
    const onPointerDown = (event) => {
      if (isInfoMobile) return;
      const popoverNode = infoPopoverRef.current;
      const buttonNode = infoButtonRefs.current.get(dishInfoOpenId);
      const target = event.target;
      if (popoverNode?.contains(target) || buttonNode?.contains(target)) return;
      setDishInfoOpenId(null);
    };
    document.addEventListener("keydown", onKeyDown);
    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("touchstart", onPointerDown);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("touchstart", onPointerDown);
    };
  }, [dishInfoOpenId, isInfoMobile]);

  const closeIngredientInfo = useCallback(() => {
    setIngredientInfoOpenId(null);
  }, []);

  const toggleIngredientInfo = useCallback((ingredientId) => {
    setDishInfoOpenId(null);
    setIngredientInfoOpenId((previousId) => (previousId === ingredientId ? null : ingredientId));
  }, []);

  const registerIngredientInfoButton = useCallback((ingredientId, node) => {
    if (!ingredientId) return;
    if (node) {
      ingredientInfoButtonRefs.current.set(ingredientId, node);
      return;
    }
    ingredientInfoButtonRefs.current.delete(ingredientId);
  }, []);

  useEffect(() => {
    if (!ingredientInfoOpenId) return;
    const exists = ingredients.some((ingredient) => ingredient?._id === ingredientInfoOpenId);
    if (!exists) {
      setIngredientInfoOpenId(null);
    }
  }, [ingredientInfoOpenId, ingredients]);

  useEffect(() => {
    if (activeTab !== "ingredients" && ingredientInfoOpenId) {
      setIngredientInfoOpenId(null);
    }
  }, [activeTab, ingredientInfoOpenId]);

  useEffect(() => {
    if (!ingredientInfoOpenId) return;
    const onKeyDown = (event) => {
      if (event.key === "Escape") {
        setIngredientInfoOpenId(null);
      }
    };
    const onPointerDown = (event) => {
      if (isInfoMobile) return;
      const popoverNode = ingredientInfoPopoverRef.current;
      const buttonNode = ingredientInfoButtonRefs.current.get(ingredientInfoOpenId);
      const target = event.target;
      if (popoverNode?.contains(target) || buttonNode?.contains(target)) return;
      setIngredientInfoOpenId(null);
    };
    document.addEventListener("keydown", onKeyDown);
    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("touchstart", onPointerDown);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("touchstart", onPointerDown);
    };
  }, [ingredientInfoOpenId, isInfoMobile]);

  const activeInfoIngredient = useMemo(
    () => ingredients.find((ingredient) => ingredient?._id === ingredientInfoOpenId) || null,
    [ingredientInfoOpenId, ingredients]
  );
  const activeInfoDish = useMemo(
    () => dishes.find((dish) => dish?._id === dishInfoOpenId) || null,
    [dishInfoOpenId, dishes]
  );
  if (isDiodGlobalMode) {
    return (
      <KitchenLayout>
        <div className="kitchen-card">
          <h3>Selecciona un hogar para gestionar platos</h3>
          <p className="kitchen-muted">En modo global DIOD solo está disponible el catálogo master.</p>
        </div>
      </KitchenLayout>
    );
  }

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
        {!isIngredientsTab ? (
          <div className="kitchen-dish-category-filters" role="toolbar" aria-label="Filtrar por categoría">
            <button
              type="button"
              className={`kitchen-filter-chip ${selectedDishCategoryIds.length === 0 ? "is-active is-all" : ""}`}
              onClick={() => setSelectedDishCategoryIds([])}
            >
              Todos
            </button>
            {filterChips.map((category) => {
              const categoryId = String(category?._id || "");
              const selected = selectedDishCategoryIds.some((id) => String(id) === categoryId);
              return (
                <button
                  key={categoryId}
                  type="button"
                  className={`kitchen-filter-chip ${selected ? "is-active" : ""}`}
                  style={selected ? { background: category.colorBg || "#eef2ff", borderColor: category.colorText || "#667085" } : undefined}
                  onClick={() => setSelectedDishCategoryIds((previous) => {
                    const exists = previous.some((id) => String(id) === categoryId);
                    if (exists) return previous.filter((id) => String(id) !== categoryId);
                    return [...previous, categoryId];
                  })}
                >
                  <span className="kitchen-filter-chip-dot" style={{ background: category.colorText || "#475467" }} />
                  <span>{category.name}</span>
                </button>
              );
            })}
          </div>
        ) : null}
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
                const categoryName = ingredient.categoryId?.name || "Sin categoría";
                const isInfoOpen = ingredientInfoOpenId === ingredient._id && !isInfoMobile;
                return (
                  <article className="kitchen-dish-card kitchen-ingredient-card" key={ingredient._id}>
                    <div className="kitchen-dish-main">
                      <div className="kitchen-dish-title-row">
                        <h3 className="kitchen-dish-name">{ingredient.name}</h3>
                      </div>
                      <p className="kitchen-card-subtitle">{categoryName}</p>
                      {!ingredient.active ? <p className="kitchen-card-inactive">Inactivo</p> : null}
                    </div>
                    <div className="kitchen-dish-actions-bar">
                      <div className="kitchen-dish-actions">
                        <div className="kitchen-dish-info-wrap">
                          <button
                            ref={(node) => registerIngredientInfoButton(ingredient._id, node)}
                            className="kitchen-icon-button info"
                            type="button"
                            onClick={() => toggleIngredientInfo(ingredient._id)}
                            aria-label={`Ver detalles de ${ingredient.name}`}
                            aria-expanded={ingredientInfoOpenId === ingredient._id}
                            aria-controls={`ingredient-info-${ingredient._id}`}
                            title="Información"
                          >
                            <svg viewBox="0 0 24 24" aria-hidden="true">
                              <path
                                d="M12 9.25a1.25 1.25 0 1 0 0-2.5 1.25 1.25 0 0 0 0 2.5Z"
                                fill="currentColor"
                              />
                              <path
                                d="M12 11v6m9-5a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z"
                                fill="none"
                                stroke="currentColor"
                                strokeWidth="1.5"
                                strokeLinecap="round"
                                strokeLinejoin="round"
                              />
                            </svg>
                          </button>
                          {isInfoOpen ? (
                            <div
                              id={`ingredient-info-${ingredient._id}`}
                              className="kitchen-dish-info-popover"
                              role="dialog"
                              aria-label={`Información de ${ingredient.name}`}
                              ref={ingredientInfoPopoverRef}
                            >
                              <h4 className="kitchen-dish-info-heading">{ingredient.name}</h4>
                              <p className="kitchen-dish-info-empty">{categoryName}</p>
                              {!ingredient.active ? (
                                <p className="kitchen-dish-info-empty">Estado: Inactivo</p>
                              ) : null}
                            </div>
                          ) : null}
                        </div>
                        <button
                          className="kitchen-icon-button"
                          type="button"
                          onClick={() => startIngredientEdit(ingredient)}
                          aria-label={`Editar ${ingredient.name}`}
                          title="Editar"
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
                        <button
                          className="kitchen-icon-button"
                          type="button"
                          onClick={() => duplicateIngredient(ingredient)}
                          aria-label={`Duplicar ${ingredient.name}`}
                          title="Duplicar"
                        >
                          <svg viewBox="0 0 24 24" aria-hidden="true">
                            <rect
                              x="9"
                              y="9"
                              width="10"
                              height="10"
                              rx="2"
                              fill="none"
                              stroke="currentColor"
                              strokeWidth="1.5"
                            />
                            <path
                              d="M6 15H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v1"
                              fill="none"
                              stroke="currentColor"
                              strokeWidth="1.5"
                              strokeLinecap="round"
                              strokeLinejoin="round"
                            />
                          </svg>
                        </button>
                        <button
                          className="kitchen-icon-button danger"
                          type="button"
                          onClick={() => deleteIngredient(ingredient)}
                          aria-label={`Eliminar ${ingredient.name}`}
                          title="Eliminar"
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
                      </div>
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
              const ingredientNames = (dish.ingredients || [])
                .map((item) => item.displayName)
                .filter(Boolean);
              const isInfoOpen = dishInfoOpenId === dish._id && !isInfoMobile;
              const categoryKey = dish?.dishCategoryId?._id || dish?.dishCategoryId || "";
              const dishCategory = categoryKey ? dishCategoryMap.get(String(categoryKey)) : null;
              const dishCategoryCode = resolveCategoryCode(dishCategory);
              const showCategoryIcon = !dish.sidedish && !dish.special && Boolean(dishCategoryCode);
              return (
                <article
                  className={`kitchen-dish-card ${dish.sidedish ? "is-sidedish" : ""}`}
                  key={dish._id}
                >
                  <div className="kitchen-dish-main">
                    <div className="kitchen-dish-title-row">
                      <div className={`kitchen-dish-title-inline ${dish.special ? "is-special" : ""}`}>
                        <h3 className="kitchen-dish-name">{dish.name}</h3>
                        {dish.special ? (
                          <CategoryIcon
                            categoryCode="especial"
                            className="kitchen-dish-special-inline-icon"
                            title="Plato especial (excluido de randomización)"
                          />
                        ) : null}
                      </div>
                    </div>
                    {!dish.sidedish ? (
                      <div className="kitchen-dish-category-meta">
                        <p className="kitchen-card-subtitle">{dishCategory?.name || "Sin categoría"}</p>
                        {showCategoryIcon ? (
                          <CategoryIcon
                            categoryCode={dishCategoryCode}
                            className="kitchen-dish-category-icon"
                            title={dishCategory?.name || dishCategoryCode}
                          />
                        ) : null}
                      </div>
                    ) : null}
                  </div>
                  <div className="kitchen-dish-actions-bar">
                    <div className="kitchen-dish-actions">
                      <div className="kitchen-dish-info-wrap">
                        <button
                          ref={(node) => registerInfoButton(dish._id, node)}
                          className="kitchen-icon-button info"
                          type="button"
                          onClick={() => toggleDishInfo(dish._id)}
                          aria-label={`Ver ingredientes de ${dish.name}`}
                          aria-expanded={dishInfoOpenId === dish._id}
                          aria-controls={`dish-info-${dish._id}`}
                          title="Ingredientes"
                        >
                          <svg viewBox="0 0 24 24" aria-hidden="true">
                            <path
                              d="M12 9.25a1.25 1.25 0 1 0 0-2.5 1.25 1.25 0 0 0 0 2.5Z"
                              fill="currentColor"
                            />
                            <path
                              d="M12 11v6m9-5a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z"
                              fill="none"
                              stroke="currentColor"
                              strokeWidth="1.5"
                              strokeLinecap="round"
                              strokeLinejoin="round"
                            />
                          </svg>
                        </button>
                        {isInfoOpen ? (
                          <div
                            id={`dish-info-${dish._id}`}
                            className="kitchen-dish-info-popover"
                            role="dialog"
                            aria-label={`Ingredientes de ${dish.name}`}
                            ref={infoPopoverRef}
                          >
                            <h4 className="kitchen-dish-info-heading">Ingredientes</h4>
                            {ingredientNames.length > 0 ? (
                              <ul className="kitchen-dish-info-list">
                                {ingredientNames.map((name, index) => (
                                  <li key={`${dish._id}-ingredient-${index}`}>{name}</li>
                                ))}
                              </ul>
                            ) : (
                              <p className="kitchen-dish-info-empty">Sin ingredientes.</p>
                            )}
                          </div>
                        ) : null}
                      </div>
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
                      {dish.sidedish || user?.role === "admin" || user?.role === "owner" || user?.globalRole === "diod" ? (
                        <button
                          className="kitchen-icon-button danger"
                          type="button"
                          onClick={() => askDeleteDish(dish)}
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
                  </div>
                </article>
              );
            })}
          </div>
        )}
        {dishError ? <div className="kitchen-alert error">{dishError}</div> : null}
        {dishSuccess ? <div className="kitchen-alert success">{dishSuccess}</div> : null}
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
        dishCategories={dishCategories}
        onCategoryCreated={onCategoryCreated}
        initialDish={activeDish}
        initialSidedish={initialSidedish}
        initialIsDinner={Boolean(activeDish?.isDinner)}
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
      {isInfoMobile && (activeInfoDish || activeInfoIngredient) ? (
        <div
          className="kitchen-ui-sheet-backdrop"
          role="presentation"
          onClick={() => {
            closeDishInfo();
            closeIngredientInfo();
          }}
        >
          <div
            className="kitchen-ui-sheet kitchen-dish-info-sheet"
            role="dialog"
            aria-modal="true"
            aria-label={`Información de ${(activeInfoDish || activeInfoIngredient)?.name || "elemento"}`}
            onClick={(event) => event.stopPropagation()}
          >
            <div className="kitchen-modal-header">
              <div>
                <h3>{(activeInfoDish || activeInfoIngredient)?.name}</h3>
                <p className="kitchen-muted">Información</p>
              </div>
              <button
                className="kitchen-icon-button"
                type="button"
                onClick={() => {
                  closeDishInfo();
                  closeIngredientInfo();
                }}
                aria-label="Cerrar información"
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
            {activeInfoDish ? (
              (activeInfoDish.ingredients || []).length > 0 ? (
                <ul className="kitchen-dish-info-list is-sheet">
                  {(activeInfoDish.ingredients || []).map((item, index) => (
                    <li key={`${activeInfoDish._id}-mobile-ingredient-${index}`}>{item.displayName}</li>
                  ))}
                </ul>
              ) : (
                <p className="kitchen-dish-info-empty">Sin ingredientes.</p>
              )
            ) : activeInfoIngredient ? (
              <div>
                <p className="kitchen-dish-info-empty">{activeInfoIngredient.categoryId?.name || "Sin categoría"}</p>
                {!activeInfoIngredient.active ? (
                  <p className="kitchen-dish-info-empty">Estado: Inactivo</p>
                ) : null}
              </div>
            ) : null}
          </div>
        </div>
      ) : null}
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
      {deleteDishModal.open ? (
        <div className="kitchen-modal-backdrop" role="presentation" onClick={() => setDeleteDishModal({ open: false, dish: null, deleting: false })}>
          <div
            className="kitchen-modal kitchen-context-modal small"
            role="dialog"
            aria-modal="true"
            aria-label="Confirmar eliminación de plato"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="kitchen-modal-header">
              <div>
                <h3>Eliminar plato</h3>
                <p className="kitchen-muted">
                  ¿Estas seguro de eliminar <strong>{deleteDishModal.dish?.name || "este plato"}</strong>?
                </p>
              </div>
            </div>
            <div className="kitchen-modal-actions">
              <button
                type="button"
                className="kitchen-button ghost"
                onClick={() => setDeleteDishModal({ open: false, dish: null, deleting: false })}
                disabled={deleteDishModal.deleting}
              >
                Cancelar
              </button>
              <button
                type="button"
                className="kitchen-button danger"
                onClick={confirmDeleteDish}
                disabled={deleteDishModal.deleting}
              >
                {deleteDishModal.deleting ? "Eliminando..." : "Eliminar"}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </KitchenLayout>
  );
}

function normalizeMealType(value) {
  return String(value || "").toLowerCase() === "dinner" ? "dinner" : "lunch";
}

