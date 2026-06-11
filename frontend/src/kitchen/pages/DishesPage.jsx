import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { SlidersHorizontal, BookOpen } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { apiRequest } from "../api.js";
import { createSyncedApi, dishesQuery, fetchCached } from "../queryClient.js";

// Non-GET calls invalidate caches affected by dish edits
const apiSync = createSyncedApi([["kitchen", "dishes"], ["planning"], ["shopping"]]);
import KitchenLayout from "../Layout.jsx";
import { useAuth } from "../auth";
import DishModal from "../components/DishModal.jsx";
import IngredientModal from "../components/IngredientModal.jsx";
import RecipeModal from "../components/RecipeModal.jsx";
import CategoryIcon from "../components/CategoryIcon.jsx";
import { resolveCategoryCode } from "../components/categoryIconMap.js";
import { normalizeIngredientName } from "../utils/normalize.js";
import { getDishOrigin, isDishFromCatalog, isUserCreatedDish } from "../utils/dishOrigin.js";
import { useOnboarding } from "../contexts/OnboardingContext.jsx";
import { useWeeklyChallenge } from "../contexts/WeeklyChallengeContext.jsx";
import { canUseDinnersFeature } from "../subscription.js";
import DinnerUpgradeBanner from "../components/ui/DinnerUpgradeBanner.jsx";
import PageHeader from "../components/PageHeader.jsx";
import { DishGridSkeleton, DishesPageSkeleton } from "../components/ScreenSkeletons.jsx";

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

// ── Origin classifier ─────────────────────────────────────────────────────────
// Returns true only for household dishes installed from a catalog pack.
// scope:"master" and scope:"override" are global/override dishes, NOT pack-installs.
//   scope:"household" + source:"catalog"  → pack-installed (standard)
//   scope:"household" + sourcePackId set  → legacy pack-installed (missing source field)
//   everything else                       → household-created ("Mis platos")
export default function DishesPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const { notify: notifyOnboarding, state: onboardingState } = useOnboarding();
  const { notify: notifyWeekly } = useWeeklyChallenge();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { notifyOnboarding("visit_dishes"); }, []);

  const [ingredientSuggestions, setIngredientSuggestions] = useState([]);
  const [dishSuggestions, setDishSuggestions] = useState([]);
  const [ingredientSuggestionName, setIngredientSuggestionName] = useState("");
  const [dishSuggestionName, setDishSuggestionName] = useState("");

  useEffect(() => {
    const key = onboardingState?.nextChallenge?.key;
    if (key === "create_ingredient" || key === "create_second_ingredient") {
      apiRequest("/api/kitchen/onboarding/suggestions?type=ingredient")
        .then((d) => setIngredientSuggestions(d.suggestions || []))
        .catch(() => {});
    } else if (key === "create_dish") {
      apiRequest("/api/kitchen/onboarding/suggestions?type=dish")
        .then((d) => setDishSuggestions(d.suggestions || []))
        .catch(() => {});
    }
  }, [onboardingState?.nextChallenge?.key]);
  const [dishes, setDishes] = useState([]);
  const [categories, setCategories] = useState([]);
  const [dishCategories, setDishCategories] = useState([]);
  const [loading, setLoading] = useState(true);
  const [dishError, setDishError] = useState("");
  const [dishSuccess, setDishSuccess] = useState("");
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [activeDish, setActiveDish] = useState(null);
  const [dishSearchTerm, setDishSearchTerm] = useState("");
  const [selectedDishCategoryId, setSelectedDishCategoryId] = useState("");
  const [activeTab, setActiveTab] = useState("main");
  const [catalogOnly, setCatalogOnly] = useState(false);
  const [mineOnly, setMineOnly] = useState(false);
  const [dinnerOnly, setDinnerOnly] = useState(false);
  const [ingredients, setIngredients] = useState([]);
  const [ingredientsLoading, setIngredientsLoading] = useState(false);
  const [ingredientsError, setIngredientsError] = useState("");
  const [ingredientSearchTerm, setIngredientSearchTerm] = useState("");
  const [isIngredientModalOpen, setIsIngredientModalOpen] = useState(false);
  const [activeIngredient, setActiveIngredient] = useState(null);
  const [ingredientInfoOpenId, setIngredientInfoOpenId] = useState(null);
  const [selectedIngredientCategoryId, setSelectedIngredientCategoryId] = useState("");
  const [showAllIngredientCategories, setShowAllIngredientCategories] = useState(false);
  const [showAllDishCategories, setShowAllDishCategories] = useState(false);
  const [assignModalOpen, setAssignModalOpen] = useState(false);
  const [assignDish, setAssignDish] = useState(null);
  const [assignDate, setAssignDate] = useState("");
  const [deleteDishModal, setDeleteDishModal] = useState({ open: false, dish: null, deleting: false });
  const [revertDishModal, setRevertDishModal] = useState({ open: false, dish: null, reverting: false });
  const [dishInfoOpenId, setDishInfoOpenId] = useState(null);
  const [recipeModalDish, setRecipeModalDish] = useState(null);
  const [dishTogglePendingId, setDishTogglePendingId] = useState("");
  const [isInfoMobile, setIsInfoMobile] = useState(false);
  const infoPopoverRef = useRef(null);
  const ingredientInfoPopoverRef = useRef(null);
  const infoButtonRefs = useRef(new Map());
  const ingredientInfoButtonRefs = useRef(new Map());
  const panelHeadingRef = useRef(null);
  const [showStickyAction, setShowStickyAction] = useState(false);
  const [dinnerGateOpen, setDinnerGateOpen] = useState(false);
  const [filterPanelOpen, setFilterPanelOpen] = useState(false);
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
  const canUseDinners = isDiodGlobalMode || canUseDinnersFeature(user);

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

  useEffect(() => {
    const el = panelHeadingRef.current;
    if (!el || typeof IntersectionObserver === "undefined") return undefined;
    const observer = new IntersectionObserver(
      ([entry]) => setShowStickyAction(!entry.isIntersecting),
      { threshold: 0, rootMargin: "-72px 0px 0px 0px" }
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const loadDishes = async () => {
    setLoading(true);
    setDishError("");
    try {
      const data = await fetchCached(dishesQuery());
      setDishes(data.dishes || []);
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
      const data = await apiSync("/api/categories");
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
      const data = await apiSync("/api/kitchen/dish-categories");
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
    setDishSuggestionName("");
    setIsModalOpen(true);
  };

  const openDishWithSuggestion = (name) => {
    setActiveDish(null);
    setDishError("");
    setDishSuggestionName(name);
    setIsModalOpen(true);
  };

  const closeModal = () => {
    setIsModalOpen(false);
    setActiveDish(null);
    setDishSuggestionName("");
  };

  const persistDishUpdate = useCallback(
    async (dish, overrides = {}) => {
      if (!dish?._id) return null;
      const payload = {
        name: dish.name || "",
        scope: dish.scope || "household",
        active: dish.active !== false,
        isArchived: Boolean(dish.isArchived),
        dishCategoryId: dish?.dishCategoryId?._id || dish?.dishCategoryId || null,
        isDinner: Boolean(dish.isDinner),
        special: Boolean(dish.special),
        allowRandom: dish.allowRandom !== false,
        ingredients: (dish.ingredients || []).map((item) => ({
          ingredientId: item?.ingredientId,
          displayName: item?.displayName,
          canonicalName: item?.canonicalName
        })),
        ...overrides
      };
      const data = await apiSync(`/api/kitchen/dishes/${dish._id}`, {
        method: "PUT",
        body: JSON.stringify(payload)
      });
      return data?.dish || null;
    },
    []
  );

  const toggleDishAllowRandom = useCallback(
    async (dish, nextAllowRandom) => {
      if (!dish?._id || dishTogglePendingId === dish._id) return;
      const previousDishes = dishes;
      const nextDish = { ...dish, allowRandom: nextAllowRandom };

      setDishTogglePendingId(dish._id);
      setDishes((prev) => prev.map((entry) => (entry._id === dish._id ? nextDish : entry)));
      if (activeDish?._id === dish._id) {
        setActiveDish(nextDish);
      }

      try {
        const savedDish = await persistDishUpdate(dish, { allowRandom: nextAllowRandom });
        if (savedDish?._id) {
          setDishes((prev) => prev.map((entry) => (entry._id === savedDish._id ? savedDish : entry)));
          if (activeDish?._id === savedDish._id) {
            setActiveDish(savedDish);
          }
          notifyOnboarding("randomization_customized");
        } else {
          await loadDishes();
        }
      } catch (err) {
        setDishes(previousDishes);
        if (activeDish?._id === dish._id) {
          setActiveDish(dish);
        }
        setDishError(err.message || "No se pudo actualizar la configuración del plato.");
      } finally {
        setDishTogglePendingId("");
      }
    },
    [activeDish, dishTogglePendingId, dishes, notifyOnboarding, persistDishUpdate]
  );

  const onCategoryCreated = async (name, colors = null) => {
    const data = await apiSync("/api/categories", {
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
  const tabFilteredDishes = useMemo(() => dishes, [dishes]);
  const mealFilteredDishes = useMemo(() => {
    if (dinnerOnly) return tabFilteredDishes.filter((dish) => dish.isDinner === true);
    return tabFilteredDishes;
  }, [dinnerOnly, tabFilteredDishes]);
  const categoryFilteredDishes = useMemo(() => {
    if (!selectedDishCategoryId) return mealFilteredDishes;
    return mealFilteredDishes.filter((dish) => {
      const categoryId = dish?.dishCategoryId?._id || dish?.dishCategoryId || "";
      return categoryId ? String(categoryId) === String(selectedDishCategoryId) : false;
    });
  }, [mealFilteredDishes, selectedDishCategoryId]);
  const originFilteredDishes = useMemo(() => {
    if (catalogOnly) return categoryFilteredDishes.filter(isDishFromCatalog);
    if (mineOnly) return categoryFilteredDishes.filter(isUserCreatedDish);
    return categoryFilteredDishes;
  }, [categoryFilteredDishes, catalogOnly, mineOnly]);

  const visibleDishes = useMemo(() => {
    if (!normalizedSearch) return originFilteredDishes;
    return originFilteredDishes.filter((dish) => {
      const nameMatch = normalizeIngredientName(dish.name || "").includes(normalizedSearch);
      if (nameMatch) return true;
      return (dish.ingredients || []).some((item) => {
        const displayName = normalizeIngredientName(item.displayName || "");
        const canonicalName = normalizeIngredientName(item.canonicalName || "");
        return displayName.includes(normalizedSearch) || canonicalName.includes(normalizedSearch);
      });
    });
  }, [originFilteredDishes, normalizedSearch]);
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
      mealFilteredDishes
        .map((dish) => dish?.dishCategoryId?._id || dish?.dishCategoryId || "")
        .filter(Boolean)
        .map((id) => String(id))
    );
    const activeCategories = dishCategories.filter((category) => category?.active !== false);
    const scoped = activeCategories.filter((category) => {
      const id = String(category?._id || "");
      return inTabIds.has(id) || id === String(selectedDishCategoryId || "");
    });
    return scoped.length ? scoped : activeCategories;
  }, [dishCategories, mealFilteredDishes, selectedDishCategoryId]);

  const TOP_DISH_CATS = 5;

  const extraDishCategories = useMemo(
    () => filterChips.slice(TOP_DISH_CATS),
    [filterChips]
  );

  const visibleDishCategoryChips = useMemo(() => {
    const base = showAllDishCategories
      ? filterChips
      : filterChips.slice(0, TOP_DISH_CATS);
    // Always show the active category even if it fell outside the truncated window
    if (
      selectedDishCategoryId &&
      !base.some((c) => String(c._id) === selectedDishCategoryId)
    ) {
      const pinned = filterChips.find((c) => String(c._id) === selectedDishCategoryId);
      if (pinned) return [pinned, ...base];
    }
    return base;
  }, [showAllDishCategories, filterChips, selectedDishCategoryId]);

  const emptyMessage = useMemo(() => {
    if (dishes.length === 0) {
      return "No hay platos aún. Crea el primero.";
    }
    if (visibleDishes.length === 0) {
      if (dishSearchTerm.trim()) {
        return "No encontramos platos con ese criterio.";
      }
      if (mineOnly) {
        return "No hay platos creados por tu hogar aún. ¡Crea el primero!";
      }
      if (catalogOnly) {
        return "No hay platos del catálogo con este filtro. Instala un pack desde Catálogo.";
      }
      if (selectedDishCategoryId) {
        return "No hay platos en la categoría seleccionada.";
      }
      if (dinnerOnly) {
        return "No hay cenas disponibles con este filtro.";
      }
      return "No hay platos aún. Crea el primero.";
    }
    return "";
  }, [catalogOnly, mineOnly, dinnerOnly, dishSearchTerm, dishes.length, selectedDishCategoryId, visibleDishes.length]);

  useEffect(() => {
    setSelectedDishCategoryId((previous) => {
      if (!previous) return previous;
      const available = new Set(dishCategories.map((category) => String(category?._id || "")));
      return available.has(String(previous)) ? previous : "";
    });
  }, [dishCategories]);

  useEffect(() => {
    if (activeTab === "ingredients") {
      setSelectedDishCategoryId("");
      setCatalogOnly(false);
      setMineOnly(false);
      setDinnerOnly(false);
      setShowAllDishCategories(false);
    } else {
      setSelectedIngredientCategoryId("");
      setShowAllIngredientCategories(false);
    }
  }, [activeTab]);

  const loadIngredients = useCallback(async () => {
    setIngredientsLoading(true);
    setIngredientsError("");
    try {
      const data = await apiSync("/api/kitchenIngredients?limit=0");
      setIngredients(data.ingredients || []);
    } catch (err) {
      setIngredientsError(err.message || "No se pudieron cargar los ingredientes.");
    } finally {
      setIngredientsLoading(false);
    }
  }, []);

  useEffect(() => {
    if (activeTab !== "ingredients") return;
    void loadIngredients();
  }, [activeTab, loadIngredients]);

  useEffect(() => {
    const onCatalogInvalidated = () => {
      void loadCategories();
      if (activeTab === "ingredients") {
        void loadIngredients(ingredientSearchTerm);
      }
    };
    window.addEventListener("kitchen:catalog-invalidated", onCatalogInvalidated);
    return () => window.removeEventListener("kitchen:catalog-invalidated", onCatalogInvalidated);
  }, [activeTab, loadIngredients]);

  const startIngredientCreate = () => {
    setActiveIngredient(null);
    setIngredientSuggestionName("");
    setIngredientsError("");
    setIsIngredientModalOpen(true);
  };

  const openIngredientWithSuggestion = (name) => {
    setActiveIngredient(null);
    setIngredientSuggestionName(name);
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
    await apiSync("/api/kitchenIngredients", {
      method: "POST",
      body: JSON.stringify({
        name: duplicateName,
        categoryId: ingredient.categoryId?._id || ingredient.categoryId || undefined
      })
    });
    await loadIngredients();
  };

  const deleteIngredient = async (ingredient) => {
    if (!ingredient?._id) return;
    const confirmed = window.confirm(`¿Estás seguro de eliminar ${ingredient.name}?`);
    if (!confirmed) return;
    await apiSync(`/api/kitchenIngredients/${ingredient._id}`, { method: "DELETE" });
    if (activeIngredient?._id === ingredient._id) closeIngredientModal();
    if (ingredientInfoOpenId === ingredient._id) setIngredientInfoOpenId(null);
    await loadIngredients();
  };
  const closeIngredientModal = () => {
    setIsIngredientModalOpen(false);
    setActiveIngredient(null);
    setIngredientSuggestionName("");
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

  const askRevertDish = (dish) => {
    if (!dish?._id || !getDishOrigin(dish).canRevert) return;
    setRevertDishModal({ open: true, dish, reverting: false });
  };

  const closeRevertDishModal = () => {
    setRevertDishModal({ open: false, dish: null, reverting: false });
  };

  const confirmRevertDish = async () => {
    if (!revertDishModal.dish?._id || revertDishModal.reverting) return;
    try {
      setRevertDishModal((prev) => ({ ...prev, reverting: true }));
      const revertedId = String(revertDishModal.dish._id);
      const data = await apiSync(`/api/kitchen/dishes/${revertedId}/revert-override`, { method: "POST" });
      if (data?.removedOverrideId) {
        setDishes((prev) => prev.filter((item) => String(item?._id) !== String(data.removedOverrideId)));
      }
      if (data?.dish?._id) {
        setDishes((prev) => prev.map((item) => (String(item?._id) === String(data.dish._id) ? data.dish : item)));
      }
      if (activeDish?._id && String(activeDish._id) === revertedId) closeModal();
      if (dishInfoOpenId === revertedId) closeDishInfo();
      setDishError("");
      setDishSuccess(data?.warning || "Plato restaurado al original");
      closeRevertDishModal();
      await loadDishes();
    } catch (err) {
      setDishError(err.message || "No se pudo volver al plato original.");
      setRevertDishModal((prev) => ({ ...prev, reverting: false }));
    }
  };

  const confirmDeleteDish = async () => {
    if (!deleteDishModal.dish?._id || deleteDishModal.deleting) return;
    try {
      setDeleteDishModal((prev) => ({ ...prev, deleting: true }));
      const deletedId = String(deleteDishModal.dish._id);
      await apiSync(`/api/kitchen/dishes/${deletedId}`, { method: "DELETE" });
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
  const ingredientCategories = useMemo(() => {
    const catMap = new Map();
    ingredients.forEach((ing) => {
      const cat = ing.categoryId;
      if (cat?._id && cat.name) catMap.set(String(cat._id), cat);
    });
    return Array.from(catMap.values());
  }, [ingredients]);

  const ingredientCategoryCount = useMemo(() => {
    const counts = {};
    ingredients.forEach((ing) => {
      const catId = String(ing.categoryId?._id || "");
      if (catId) counts[catId] = (counts[catId] || 0) + 1;
    });
    return counts;
  }, [ingredients]);

  const sortedIngredientCategories = useMemo(() => {
    return [...ingredientCategories].sort(
      (a, b) => (ingredientCategoryCount[String(b._id)] || 0) - (ingredientCategoryCount[String(a._id)] || 0)
    );
  }, [ingredientCategories, ingredientCategoryCount]);

  const TOP_INGREDIENT_CATS = 6;

  const extraIngredientCategories = useMemo(
    () => sortedIngredientCategories.slice(TOP_INGREDIENT_CATS),
    [sortedIngredientCategories]
  );

  const visibleIngredientCategoryChips = useMemo(() => {
    const base = showAllIngredientCategories
      ? sortedIngredientCategories
      : sortedIngredientCategories.slice(0, TOP_INGREDIENT_CATS);
    if (
      selectedIngredientCategoryId &&
      !base.some((c) => String(c._id) === selectedIngredientCategoryId)
    ) {
      const pinned = ingredientCategories.find((c) => String(c._id) === selectedIngredientCategoryId);
      if (pinned) return [pinned, ...base];
    }
    return base;
  }, [showAllIngredientCategories, sortedIngredientCategories, selectedIngredientCategoryId, ingredientCategories]);

  const normalizedIngredientSearch = useMemo(
    () => normalizeIngredientName(ingredientSearchTerm),
    [ingredientSearchTerm]
  );

  const visibleIngredients = useMemo(() => {
    let result = ingredients;
    if (selectedIngredientCategoryId) {
      result = result.filter(
        (ing) => String(ing.categoryId?._id || "") === selectedIngredientCategoryId
      );
    }
    if (normalizedIngredientSearch) {
      result = result.filter((ing) => {
        const nameMatch = normalizeIngredientName(ing.name || "").includes(normalizedIngredientSearch);
        const catMatch = normalizeIngredientName(ing.categoryId?.name || "").includes(normalizedIngredientSearch);
        return nameMatch || catMatch;
      });
    }
    return result;
  }, [ingredients, selectedIngredientCategoryId, normalizedIngredientSearch]);

  const ingredientEmptyMessage = useMemo(() => {
    if (ingredients.length === 0) {
      return "No hay ingredientes aún. Crea el primero.";
    }
    if (ingredientSearchTerm.trim() || selectedIngredientCategoryId) {
      return "No encontramos ingredientes con ese criterio.";
    }
    return "";
  }, [ingredientSearchTerm, ingredients.length, selectedIngredientCategoryId]);

  const nextChallengeKey = onboardingState?.nextChallenge?.key;
  const filteredIngredientSuggestions = useMemo(() => {
    if (nextChallengeKey !== "create_ingredient" && nextChallengeKey !== "create_second_ingredient") return [];
    const existing = new Set(ingredients.map((i) => normalizeIngredientName(i.name || "").toLowerCase()));
    return ingredientSuggestions.filter((s) => !existing.has(normalizeIngredientName(s.text || "").toLowerCase()));
  }, [nextChallengeKey, ingredientSuggestions, ingredients]);

  const filteredDishSuggestions = useMemo(() => {
    if (nextChallengeKey !== "create_dish") return [];
    const existing = new Set(dishes.map((d) => normalizeIngredientName(d.name || "").toLowerCase()));
    return dishSuggestions.filter((s) => !existing.has(normalizeIngredientName(s.text || "").toLowerCase()));
  }, [nextChallengeKey, dishSuggestions, dishes]);

  const isIngredientsTab = activeTab === "ingredients";
  const headerTitle = "Cocina";
  const headerDescription = isIngredientsTab
    ? isDiodGlobalMode
      ? "Catálogo master de productos — visibles en todos los hogares."
      : "Gestiona el catálogo de productos: ingredientes, artículos del hogar y todo lo que usas."
    : isDiodGlobalMode
      ? "Catálogo master de platos — visibles en todos los hogares."
      : "Gestiona tu cocina: platos, productos y todo lo que usas para planificar.";
  const headerActionLabel = isIngredientsTab
    ? isDiodGlobalMode ? "Nuevo producto master" : "Nuevo producto"
    : isDiodGlobalMode ? "Nuevo plato master" : "Nuevo plato";
  const headerActionHandler = isIngredientsTab ? startIngredientCreate : startCreate;

  if (loading && !isIngredientsTab) {
    return (
      <KitchenLayout>
        <DishesPageSkeleton />
      </KitchenLayout>
    );
  }

  return (
    <KitchenLayout>
      <div className="kitchen-dishes-page">
        {isDiodGlobalMode && (
          <div className="kitchen-master-mode-banner">
            <svg viewBox="0 0 20 20" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden="true">
              <circle cx="10" cy="10" r="8" />
              <path d="M10 6v4l2.5 2.5" />
            </svg>
            <span>Modo catálogo master · Los cambios afectan a <strong>todos los hogares</strong></span>
          </div>
        )}
        {/* ── Unified Explorer Panel ──────────────────────────────────── */}
        <PageHeader
          title={headerTitle}
          subtitle={headerDescription}
          primaryAction={
            <button className="kitchen-button dishes-new-button" type="button" onClick={headerActionHandler}>
              + {headerActionLabel}
            </button>
          }
          topRef={panelHeadingRef}
          className="dishes-explorer-panel"
        >
          {/* ── FILA DE CONTROLES: tabs + sliders + cenas toggle ── */}
          <div className="dishes-controls-row">
            <div className="dishes-explorer-nav" role="tablist" aria-label="Secciones de cocina">
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
                className={`kitchen-tab-button ${activeTab === "ingredients" ? "is-active" : ""}`}
                type="button"
                role="tab"
                aria-selected={activeTab === "ingredients"}
                onClick={() => setActiveTab("ingredients")}
              >
                Productos
              </button>
            </div>
            <div className="dishes-filters-right">
              <button
                type="button"
                className={`dishes-sliders-btn${filterPanelOpen ? " is-open" : ""}`}
                onClick={() => setFilterPanelOpen((v) => !v)}
                aria-label="Filtros avanzados"
                aria-expanded={filterPanelOpen}
              >
                <SlidersHorizontal size={18} />
                {(isIngredientsTab ? selectedIngredientCategoryId !== "" : mineOnly || dinnerOnly || selectedDishCategoryId !== "") ? (
                  <span className="dishes-sliders-dot" aria-hidden="true" />
                ) : null}
              </button>
              {!isIngredientsTab ? (
                <button
                  type="button"
                  className={`dishes-cenas-toggle${catalogOnly ? " is-on" : ""}`}
                  onClick={() => {
                    setCatalogOnly((v) => {
                      if (!v) setMineOnly(false);
                      return !v;
                    });
                  }}
                  aria-label="Solo catálogo"
                  aria-pressed={catalogOnly}
                >
                  <BookOpen size={14} aria-hidden="true" />
                  <span>Solo catálogo</span>
                  <span className={`dishes-cenas-track${catalogOnly ? " is-on" : ""}`} aria-hidden="true">
                    <span className="dishes-cenas-thumb" />
                  </span>
                </button>
              ) : null}
            </div>
          </div>

          {/* Dinner gate banner (outside panel) */}
          {!canUseDinners && dinnerGateOpen ? (
            <DinnerUpgradeBanner
              className="dinner-upgrade-banner-dishes"
              onClose={() => setDinnerGateOpen(false)}
            />
          ) : null}

          {/* ── PANEL DE FILTROS (colapsable) ── */}
          {filterPanelOpen ? (
            <div className="dishes-filter-panel">
              {/* Sección Visibilidad: Solo cenas + Mis platos */}
              {!isIngredientsTab ? (
                <div className="dishes-filter-section">
                  <span className="dishes-filter-section-title">Visibilidad</span>
                  <div className="dishes-filter-panel-checks">
                    <label className="dishes-filter-check-row">
                      <input
                        type="checkbox"
                        className="dishes-filter-check"
                        checked={dinnerOnly}
                        onChange={() => {
                          if (!canUseDinners) { setDinnerGateOpen((v) => !v); return; }
                          setDinnerOnly((v) => !v);
                        }}
                      />
                      <span>Solo cenas</span>
                    </label>
                    {!isDiodGlobalMode ? (
                      <label className="dishes-filter-check-row">
                        <input
                          type="checkbox"
                          className="dishes-filter-check"
                          checked={mineOnly}
                          onChange={() => {
                            setMineOnly((v) => {
                              if (!v) setCatalogOnly(false);
                              return !v;
                            });
                          }}
                        />
                        <span>Mis platos</span>
                      </label>
                    ) : null}
                  </div>
                </div>
              ) : null}

              {/* Sección Ingrediente (dishes tab) */}
              {!isIngredientsTab ? (
                <div className="dishes-filter-section">
                  <span className="dishes-filter-section-title">Ingrediente</span>
                  <div className="dishes-filter-pills dishes-filter-pills--wrap">
                    <button
                      type="button"
                      className={`kitchen-filter-chip${!selectedDishCategoryId ? " is-active is-all" : ""}`}
                      onClick={() => setSelectedDishCategoryId("")}
                    >
                      Todos
                    </button>
                    {visibleDishCategoryChips.map((category) => {
                      const categoryId = String(category?._id || "");
                      const selected = String(selectedDishCategoryId || "") === categoryId;
                      return (
                        <button
                          key={categoryId}
                          type="button"
                          className={`kitchen-filter-chip${selected ? " is-active" : ""}`}
                          onClick={() => setSelectedDishCategoryId((prev) => (String(prev || "") === categoryId ? "" : categoryId))}
                        >
                          <span className="kitchen-filter-chip-dot" style={{ background: category.colorText || "#475467" }} />
                          <span>{category.name}</span>
                        </button>
                      );
                    })}
                    {extraDishCategories.length > 0 ? (
                      <button
                        type="button"
                        className="kitchen-filter-chip dishes-cat-more"
                        onClick={() => setShowAllDishCategories((v) => !v)}
                      >
                        {showAllDishCategories ? "Menos" : `+${extraDishCategories.length} más`}
                      </button>
                    ) : null}
                  </div>
                </div>
              ) : null}

              {/* Sección Categoría (ingredients tab) */}
              {isIngredientsTab && !ingredientsLoading && ingredientCategories.length > 0 ? (
                <div className="dishes-filter-section">
                  <span className="dishes-filter-section-title">Categoría</span>
                  <div className="dishes-filter-pills dishes-filter-pills--wrap">
                    <button
                      type="button"
                      className={`kitchen-filter-chip${!selectedIngredientCategoryId ? " is-active is-all" : ""}`}
                      onClick={() => setSelectedIngredientCategoryId("")}
                    >
                      Todos
                    </button>
                    {visibleIngredientCategoryChips.map((cat) => {
                      const catId = String(cat._id || "");
                      const selected = selectedIngredientCategoryId === catId;
                      return (
                        <button
                          key={catId}
                          type="button"
                          className={`kitchen-filter-chip${selected ? " is-active" : ""}`}
                          onClick={() => setSelectedIngredientCategoryId((prev) => (prev === catId ? "" : catId))}
                        >
                          {cat.colorText ? <span className="kitchen-filter-chip-dot" style={{ background: cat.colorText }} /> : null}
                          {cat.name}
                          <span className="dishes-cat-count">{ingredientCategoryCount[catId] || 0}</span>
                        </button>
                      );
                    })}
                    {extraIngredientCategories.length > 0 ? (
                      <button
                        type="button"
                        className="kitchen-filter-chip dishes-cat-more"
                        onClick={() => setShowAllIngredientCategories((v) => !v)}
                      >
                        {showAllIngredientCategories ? "Menos" : `+${extraIngredientCategories.length} más`}
                      </button>
                    ) : null}
                  </div>
                </div>
              ) : null}

              {/* Limpiar filtros */}
              {(isIngredientsTab ? selectedIngredientCategoryId !== "" : mineOnly || dinnerOnly || selectedDishCategoryId !== "") ? (
                <div className="dishes-filter-panel-footer">
                  <button
                    type="button"
                    className="dishes-filter-clear-btn"
                    onClick={() => {
                      setMineOnly(false);
                      setDinnerOnly(false);
                      setSelectedDishCategoryId("");
                      setSelectedIngredientCategoryId("");
                    }}
                  >
                    Limpiar filtros
                  </button>
                </div>
              ) : null}
            </div>
          ) : null}

          {/* Buscador */}
          <input
            className="kitchen-input dishes-search-input"
            placeholder={isIngredientsTab ? "Buscar producto…" : "Buscar por plato o producto…"}
            value={isIngredientsTab ? ingredientSearchTerm : dishSearchTerm}
            onChange={(event) =>
              isIngredientsTab
                ? setIngredientSearchTerm(event.target.value)
                : setDishSearchTerm(event.target.value)
            }
          />

          {/* Contador resultados */}
          {!loading && !ingredientsLoading ? (
            <p className="dishes-results-count">
              {isIngredientsTab
                ? `${visibleIngredients.length} ${visibleIngredients.length === 1 ? "producto encontrado" : "productos encontrados"}`
                : `${visibleDishes.length} ${visibleDishes.length === 1 ? "plato encontrado" : "platos encontrados"}`}
            </p>
          ) : null}
        </PageHeader>
        {/* Onboarding suggestions (outside panel, above grid) */}
        {(isIngredientsTab ? filteredIngredientSuggestions : (activeTab === "main" ? filteredDishSuggestions : [])).length > 0 && (
          <div style={{ padding: "4px 4px 0" }}>
            <p style={{ margin: "0 0 6px", fontSize: 11, fontWeight: 700, color: "var(--hf-brand-darker)", letterSpacing: "0.06em", textTransform: "uppercase" }}>
              Sugerencias para ti
            </p>
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
              {(isIngredientsTab ? filteredIngredientSuggestions : filteredDishSuggestions).map((s) => (
                <button
                  key={s.id}
                  type="button"
                  onClick={() => isIngredientsTab ? openIngredientWithSuggestion(s.text) : openDishWithSuggestion(s.text)}
                  style={{
                    fontSize: 12, padding: "4px 12px", borderRadius: 999,
                    background: "#eef2ff", border: "1.5px solid #c7d2fe",
                    color: "#4338ca", cursor: "pointer", fontWeight: 600,
                    transition: "background 0.15s"
                  }}
                >
                  + {s.text}
                </button>
              ))}
            </div>
          </div>
        )}
        {isIngredientsTab ? (
          <>
            {ingredientsLoading ? (
              <DishGridSkeleton ingredients />
            ) : visibleIngredients.length === 0 ? (
              <div className="kitchen-card kitchen-empty">
                <p>{ingredientEmptyMessage}</p>
              </div>
            ) : (
            <div className="kitchen-dishes-grid">
              {visibleIngredients.map((ingredient) => {
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
                          className="kitchen-icon-button edit"
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
                          className="kitchen-icon-button duplicate"
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
            )}
          </>
        ) : loading ? (
          <DishGridSkeleton />
        ) : visibleDishes.length === 0 ? (
          <div className="kitchen-card kitchen-empty">
            <p>{emptyMessage}</p>
          </div>
        ) : (
          <div className="kitchen-dishes-grid">
            {visibleDishes.map((dish, dishIndex) => {
              const ingredientNames = (dish.ingredients || [])
                .map((item) => item.displayName)
                .filter(Boolean);
              const isInfoOpen = dishInfoOpenId === dish._id && !isInfoMobile;
              const categoryKey = dish?.dishCategoryId?._id || dish?.dishCategoryId || "";
              const dishCategory = categoryKey ? dishCategoryMap.get(String(categoryKey)) : null;
              const dishCategoryCode = resolveCategoryCode(dishCategory);
              const showCategoryIcon = Boolean(dishCategoryCode);
              const randomEnabled = dish.allowRandom !== false;
              const toggleDisabled = dishTogglePendingId === dish._id;
              const dishOrigin = getDishOrigin(dish);
              const isCatalogDish = isDishFromCatalog(dish);
              const packColor = isCatalogDish && dish.sourcePackColor ? dish.sourcePackColor : null;
              return (
                <article
                  className={`kitchen-dish-card hf-anim-rise ${isCatalogDish ? "is-catalog" : ""} is-origin-${dishOrigin.type}`}
                  key={dish._id}
                  style={{ "--hf-anim-i": dishIndex, ...(packColor ? { "--dish-pack-color": packColor } : null) }}
                >
                  <div className="kitchen-dish-main">
                    <div className="kitchen-dish-title-row">
                      <div className={`kitchen-dish-title-inline ${dish.special ? "is-special" : ""}`}>
                        <h3 className="kitchen-dish-name">{dish.name}</h3>
                        {dish.special ? (
                          <span
                            className="kitchen-dish-special-inline-star"
                            title="Plato especial — excluido del plan automático"
                            aria-label="Plato especial"
                          >
                            ★
                          </span>
                        ) : null}
                      </div>
                    </div>
                    <div className="kitchen-dish-category-meta">
                      {showCategoryIcon ? (
                        <CategoryIcon
                          categoryCode={dishCategoryCode}
                          className="kitchen-dish-category-icon"
                          title={dishCategory?.name || dishCategoryCode}
                        />
                      ) : null}
                      <p className="kitchen-card-subtitle">{dishCategory?.name || "Sin categoría"}</p>
                      <span className={`kitchen-dish-origin-badge is-${dishOrigin.type}`}>{dishOrigin.label}</span>
                    </div>
                    {isCatalogDish && dish.sourcePackTitle ? (
                      <div className="kitchen-dish-catalog-origin">
                        <svg viewBox="0 0 14 14" aria-hidden="true" style={{ width: 11, height: 11, flexShrink: 0 }}>
                          <rect x="0.75" y="0.75" width="12.5" height="12.5" rx="2.25" strokeWidth="1.4" fill="none" stroke="currentColor" />
                          <path d="M3 4h8M3 7h5M3 10h6" strokeWidth="1.2" strokeLinecap="round" stroke="currentColor" />
                        </svg>
                        <span>{dish.sourcePackTitle}</span>
                      </div>
                    ) : null}
                  </div>
                  <div className="kitchen-dish-actions-bar">
                    <label
                      className={`kitchen-dish-random-checkbox${toggleDisabled ? " is-loading" : ""}${dish.special ? " is-special" : ""}`}
                      title={dish.special ? "Plato especial — excluido del plan automático" : (randomEnabled ? "Excluir de randomización" : "Incluir en randomización")}
                    >
                      <input
                        type="checkbox"
                        checked={randomEnabled}
                        disabled={toggleDisabled || Boolean(dish.special)}
                        onChange={() => toggleDishAllowRandom(dish, !randomEnabled)}
                      />
                      <span>Incluir en randomización</span>
                    </label>
                    <div className="kitchen-dish-actions">
                      <div className="kitchen-dish-info-wrap">
                        {(() => {
                          const hasRecipe = Boolean(dish.recipe && (dish.recipe.ingredients?.length > 0 || dish.recipe.steps));
                          return (
                            <>
                              <button
                                ref={(node) => registerInfoButton(dish._id, node)}
                                className={`kitchen-icon-button info${hasRecipe ? " has-recipe" : ""}`}
                                type="button"
                                onClick={() => {
                                  if (hasRecipe) { setRecipeModalDish(dish); }
                                  else { toggleDishInfo(dish._id); }
                                }}
                                aria-label={hasRecipe ? `Ver elaboración de ${dish.name}` : `Ver ingredientes de ${dish.name}`}
                                aria-expanded={dishInfoOpenId === dish._id}
                                aria-controls={`dish-info-${dish._id}`}
                                title={hasRecipe ? "Ver elaboración" : "Ingredientes"}
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
                            </>
                          );
                        })()}
                      </div>
                      <button
                        className="kitchen-icon-button edit"
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
                      {user?.role === "admin" || user?.role === "owner" || user?.globalRole === "diod" ? (
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
        <button
          className="dishes-fab"
          type="button"
          onClick={headerActionHandler}
          aria-label={`+ ${headerActionLabel}`}
        >
          <svg viewBox="0 0 24 24" aria-hidden="true" width="24" height="24" fill="none">
            <path d="M12 5v14M5 12h14" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" />
          </svg>
        </button>
        {dishError ? <div className="kitchen-alert error">{dishError}</div> : null}
        {dishSuccess ? <div className="kitchen-alert success">{dishSuccess}</div> : null}
        {ingredientsError && isIngredientsTab ? (
          <div className="kitchen-alert error">{ingredientsError}</div>
        ) : null}
      </div>

      {showStickyAction && (
        <div className="dishes-sticky-action">
          <button className="kitchen-button dishes-sticky-action-btn" type="button" onClick={headerActionHandler}>
            + {headerActionLabel}
          </button>
        </div>
      )}

      {recipeModalDish ? (
        <RecipeModal dish={recipeModalDish} onClose={() => setRecipeModalDish(null)} />
      ) : null}
      <DishModal
        isOpen={isModalOpen}
        onClose={closeModal}
        onSaved={async (savedDish) => {
          await loadDishes();
          if (!activeDish) {
            notifyOnboarding("create_dish");
            notifyWeekly("dish_created");
            if ((savedDish?.ingredients?.length ?? 0) > 0) notifyOnboarding("add_ingredient_to_dish");
          } else if ((savedDish?.ingredients?.length ?? 0) > 0) {
            notifyOnboarding("add_ingredient_to_dish");
          }
          setDishSuggestionName("");
        }}
        onRecipeSaved={async () => { await loadDishes(); }}
        categories={categories}
        dishCategories={dishCategories}
        onCategoryCreated={onCategoryCreated}
        initialDish={activeDish}
        initialName={dishSuggestionName}
        initialIsDinner={Boolean(activeDish?.isDinner)}
        scope={isDiodGlobalMode ? "master" : undefined}
        originInfo={activeDish ? getDishOrigin(activeDish) : null}
        onRevertOriginal={() => askRevertDish(activeDish)}
      />
      <IngredientModal
        isOpen={isIngredientModalOpen}
        onClose={closeIngredientModal}
        onSaved={async () => {
          await loadIngredients(ingredientSearchTerm);
          if (!activeIngredient) {
            notifyOnboarding("create_ingredient");
            notifyWeekly("ingredient_created");
          }
          setIngredientSuggestionName("");
        }}
        categories={categories}
        onCategoryCreated={onCategoryCreated}
        initialIngredient={ingredientSuggestionName ? { name: ingredientSuggestionName } : activeIngredient}
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
      {revertDishModal.open ? (
        <div className="kitchen-modal-backdrop" role="presentation" onClick={closeRevertDishModal}>
          <div
            className="kitchen-modal kitchen-context-modal small"
            role="dialog"
            aria-modal="true"
            aria-label="Volver al plato original"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="kitchen-modal-header">
              <div>
                <h3>¿Volver al plato original?</h3>
                <p className="kitchen-muted">
                  Se eliminarán tus cambios personalizados y volverás a ver la versión original del catálogo.
                </p>
              </div>
            </div>
            <div className="kitchen-modal-actions">
              <button
                type="button"
                className="kitchen-button ghost"
                onClick={closeRevertDishModal}
                disabled={revertDishModal.reverting}
              >
                Cancelar
              </button>
              <button
                type="button"
                className="kitchen-button"
                onClick={confirmRevertDish}
                disabled={revertDishModal.reverting}
              >
                {revertDishModal.reverting ? "Restaurando..." : "Volver al original"}
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

