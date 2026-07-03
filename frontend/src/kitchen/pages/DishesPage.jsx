import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { BookOpen, Pencil, Copy, Trash2, Plus } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { apiRequest } from "../api.js";
import { catalogQuery, createSyncedApi, dishesQuery, fetchCached, queryClient } from "../queryClient.js";

// Non-GET calls invalidate caches affected by dish edits
const apiSync = createSyncedApi([["kitchen", "dishes"], ["planning"], ["shopping"]]);
import KitchenLayout from "../Layout.jsx";
import { useAuth } from "../auth";
import DishModal from "../components/DishModal.jsx";
import IngredientModal from "../components/IngredientModal.jsx";
import RecipeModal from "../components/RecipeModal.jsx";
import SearchableSelect from "../components/ui/SearchableSelect.jsx";
import { normalizeIngredientName } from "../utils/normalize.js";
import { getDishOrigin, isDishFromCatalog, isUserCreatedDish } from "../utils/dishOrigin.js";
import { useOnboarding } from "../contexts/OnboardingContext.jsx";
import { emitOnboardingEvent, ONBOARDING_EVENTS } from "../components/tour/guidedOnboardingEvents.js";
import { useWeeklyChallenge } from "../contexts/WeeklyChallengeContext.jsx";
import { canUseDinnersFeature } from "../subscription.js";
import DinnerUpgradeBanner from "../components/ui/DinnerUpgradeBanner.jsx";
import PageHeader from "../components/PageHeader.jsx";
import { DishGridSkeleton, DishesPageSkeleton } from "../components/ScreenSkeletons.jsx";

const ASSIGN_DAY_LABELS = ["D", "L", "M", "X", "J", "V", "S"];

function getCatalogPackId(dish) {
  const value = dish?.sourcePackId;
  if (!value) return "";
  if (typeof value === "object" && value._id) return String(value._id);
  return String(value);
}

function isDishIncludedInRandomization(dish) {
  return Boolean(dish)
    && dish.sidedish !== true
    && dish.special !== true
    && dish.allowRandom !== false
    && dish.active === true
    && dish.isArchived !== true
    && dish.deletedAt == null
    && typeof dish.isDinner === "boolean";
}

function upsertVisibleById(items, item) {
  if (!item?._id) return items;
  const itemId = String(item._id);
  const withoutItem = items.filter((entry) => String(entry?._id || "") !== itemId);
  const visible = item.active !== false && item.isArchived !== true && item.deletedAt == null;
  return visible ? [item, ...withoutItem] : withoutItem;
}

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
  useEffect(() => {
    notifyOnboarding("visit_dishes");
    emitOnboardingEvent(ONBOARDING_EVENTS.KITCHEN_OPENED);
  }, []);

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
  const [selectedCatalogPackId, setSelectedCatalogPackId] = useState("");
  const [installedCatalogs, setInstalledCatalogs] = useState([]);
  const [catalogsLoading, setCatalogsLoading] = useState(false);
  const [dinnerOnly, setDinnerOnly] = useState(false);
  const [randomIncludedOnly, setRandomIncludedOnly] = useState(false);
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
  const [openDishMenuId, setOpenDishMenuId] = useState(null);
  const [openIngMenuId, setOpenIngMenuId] = useState(null);
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

  // Close any open kebab menu on outside click
  useEffect(() => {
    if (!openDishMenuId && !openIngMenuId) return undefined;
    const close = () => { setOpenDishMenuId(null); setOpenIngMenuId(null); };
    document.addEventListener("pointerdown", close);
    return () => document.removeEventListener("pointerdown", close);
  }, [openDishMenuId, openIngMenuId]);

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

  const loadInstalledCatalogs = useCallback(async () => {
    setCatalogsLoading(true);
    try {
      const data = await fetchCached(catalogQuery());
      const packs = Array.isArray(data?.packs) ? data.packs : [];
      setInstalledCatalogs(packs.filter((pack) => pack?.entitlement?.installed));
    } catch {
      setInstalledCatalogs([]);
    } finally {
      setCatalogsLoading(false);
    }
  }, []);

  useEffect(() => {
    if (isDiodGlobalMode) {
      setInstalledCatalogs([]);
      setSelectedCatalogPackId("");
      return;
    }
    void loadInstalledCatalogs();
  }, [isDiodGlobalMode, loadInstalledCatalogs, user?.activeHouseholdId, user?.id]);

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
    setDishSuggestionName(dishSearchTerm.trim());
    setIsModalOpen(true);
    emitOnboardingEvent(ONBOARDING_EVENTS.CREATE_DISH_OPENED);
  };

  const openDishWithSuggestion = (name) => {
    setActiveDish(null);
    setDishError("");
    setDishSuggestionName(name);
    setIsModalOpen(true);
  };

  const rememberSavedDish = useCallback((dish) => {
    if (!dish?._id) return;
    setDishes((prev) => upsertVisibleById(prev, dish));
    queryClient.invalidateQueries({ queryKey: ["kitchen", "dishes"] });
    queryClient.invalidateQueries({ queryKey: ["planning"] });
    queryClient.invalidateQueries({ queryKey: ["shopping"] });
  }, []);

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
  const catalogFilteredDishes = useMemo(() => {
    if (!selectedCatalogPackId || mineOnly) return originFilteredDishes;
    return originFilteredDishes.filter((dish) => getCatalogPackId(dish) === String(selectedCatalogPackId));
  }, [mineOnly, originFilteredDishes, selectedCatalogPackId]);
  const randomizationFilteredDishes = useMemo(() => {
    if (!randomIncludedOnly) return catalogFilteredDishes;
    return catalogFilteredDishes.filter(isDishIncludedInRandomization);
  }, [catalogFilteredDishes, randomIncludedOnly]);

  const visibleDishes = useMemo(() => {
    if (!normalizedSearch) return randomizationFilteredDishes;
    return randomizationFilteredDishes.filter((dish) => {
      const nameMatch = normalizeIngredientName(dish.name || "").includes(normalizedSearch);
      if (nameMatch) return true;
      return (dish.ingredients || []).some((item) => {
        const displayName = normalizeIngredientName(item.displayName || "");
        const canonicalName = normalizeIngredientName(item.canonicalName || "");
        return displayName.includes(normalizedSearch) || canonicalName.includes(normalizedSearch);
      });
    });
  }, [normalizedSearch, randomizationFilteredDishes]);
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
  const catalogOptions = useMemo(
    () => installedCatalogs.map((pack) => ({
      value: String(pack.id || pack._id || ""),
      label: pack.title || pack.subtitle || "Catálogo",
      dotColor: pack.color || undefined
    })).filter((option) => option.value),
    [installedCatalogs]
  );
  const selectedCatalogOption = useMemo(
    () => catalogOptions.find((option) => option.value === String(selectedCatalogPackId || "")) || null,
    [catalogOptions, selectedCatalogPackId]
  );
  useEffect(() => {
    if (!selectedCatalogPackId) return;
    if (!catalogOptions.some((option) => option.value === String(selectedCatalogPackId))) {
      setSelectedCatalogPackId("");
    }
  }, [catalogOptions, selectedCatalogPackId]);
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
      if (selectedCatalogPackId) {
        return "No hay platos de este catálogo con los filtros actuales.";
      }
      if (selectedDishCategoryId) {
        return "No hay platos en la categoría seleccionada.";
      }
      if (dinnerOnly) {
        return "No hay cenas disponibles con este filtro.";
      }
      if (randomIncludedOnly) {
        return "No hay platos incluidos en randomización con estos filtros.";
      }
      return "No hay platos aún. Crea el primero.";
    }
    return "";
  }, [catalogOnly, mineOnly, dinnerOnly, dishSearchTerm, dishes.length, randomIncludedOnly, selectedCatalogPackId, selectedDishCategoryId, visibleDishes.length]);

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
      setSelectedCatalogPackId("");
      setCatalogOnly(false);
      setMineOnly(false);
      setDinnerOnly(false);
      setRandomIncludedOnly(false);
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
      void loadInstalledCatalogs();
      if (activeTab === "ingredients") {
        void loadIngredients(ingredientSearchTerm);
      }
    };
    window.addEventListener("kitchen:catalog-invalidated", onCatalogInvalidated);
    return () => window.removeEventListener("kitchen:catalog-invalidated", onCatalogInvalidated);
  }, [activeTab, loadIngredients, loadInstalledCatalogs]);

  const startIngredientCreate = () => {
    setActiveIngredient(null);
    setIngredientSuggestionName(ingredientSearchTerm.trim());
    setIngredientsError("");
    setIsIngredientModalOpen(true);
    emitOnboardingEvent(ONBOARDING_EVENTS.CREATE_DISH_OPENED);
  };

  const openIngredientWithSuggestion = (name) => {
    setActiveIngredient(null);
    setIngredientSuggestionName(name);
    setIngredientsError("");
    setIsIngredientModalOpen(true);
  };

  const rememberSavedIngredient = useCallback((ingredient) => {
    if (!ingredient?._id) return;
    setIngredients((prev) => upsertVisibleById(prev, ingredient));
    queryClient.invalidateQueries({ queryKey: ["shopping"] });
  }, []);

  const startIngredientEdit = (ingredient) => {
    setActiveIngredient(ingredient);
    setIngredientsError("");
    setIsIngredientModalOpen(true);
  };

  const duplicateIngredient = async (ingredient) => {
    if (!ingredient?._id) return;
    const sourceName = (ingredient.name || "Ingrediente").trim();
    const duplicateName = `${sourceName} (copia)`;
    const data = await apiSync("/api/kitchenIngredients", {
      method: "POST",
      body: JSON.stringify({
        name: duplicateName,
        categoryId: ingredient.categoryId?._id || ingredient.categoryId || undefined
      })
    });
    rememberSavedIngredient(data?.ingredient);
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
  const headerTitle = "Mi Cocina";
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
          subtitle={
            !loading && !ingredientsLoading
              ? isIngredientsTab
                ? `${visibleIngredients.length} ${visibleIngredients.length === 1 ? "producto" : "productos"}`
                : `${visibleDishes.length} ${visibleDishes.length === 1 ? "plato" : "platos"}`
              : null
          }
          primaryAction={
            <div className="phdr-seg-group" role="tablist" aria-label="Secciones de cocina">
              <button
                className={`phdr-seg${activeTab === "main" ? " is-active" : ""}`}
                type="button"
                role="tab"
                aria-selected={activeTab === "main"}
                onClick={() => setActiveTab("main")}
              >
                Platos
              </button>
              <button
                className={`phdr-seg${activeTab === "ingredients" ? " is-active" : ""}`}
                type="button"
                role="tab"
                aria-selected={activeTab === "ingredients"}
                onClick={() => setActiveTab("ingredients")}
              >
                Productos
              </button>
            </div>
          }
          topRef={panelHeadingRef}
          className="dishes-explorer-panel"
        >
          {/* ── SEARCH + FILTER + ADD ROW ── */}
          <div className="phdr-search-row">
            <div className="phdr-search-wrap">
              <span className="phdr-search-icon" aria-hidden="true">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
                  <circle cx="11" cy="11" r="7" />
                  <path d="m21 21-4.3-4.3" />
                </svg>
              </span>
              <input
                className="phdr-search-input"
                type="search"
                placeholder={isIngredientsTab ? "Buscar producto…" : "Buscar por plato o producto…"}
                value={isIngredientsTab ? ingredientSearchTerm : dishSearchTerm}
                onChange={(event) =>
                  isIngredientsTab
                    ? setIngredientSearchTerm(event.target.value)
                    : setDishSearchTerm(event.target.value)
                }
                aria-label={isIngredientsTab ? "Buscar producto" : "Buscar plato"}
              />
            </div>
            <button
              type="button"
              className="phdr-icon-btn"
              onClick={() => setFilterPanelOpen((v) => !v)}
              aria-label="Filtros avanzados"
              aria-expanded={filterPanelOpen}
            >
              <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><line x1="4" y1="6" x2="20" y2="6"/><line x1="7" y1="12" x2="17" y2="12"/><line x1="10" y1="18" x2="14" y2="18"/></svg>
              {(isIngredientsTab ? selectedIngredientCategoryId !== "" : mineOnly || dinnerOnly || randomIncludedOnly || selectedDishCategoryId !== "" || catalogOnly || selectedCatalogPackId) ? (
                <span className="phdr-filter-dot" aria-hidden="true" />
              ) : null}
            </button>
            <button
              type="button"
              className="phdr-cta-btn"
              data-tour-id="kitchen-create"
              onClick={headerActionHandler}
              aria-label={headerActionLabel}
            >
              <Plus size={20} />
            </button>
          </div>

          {/* Dinner gate banner */}
          {!canUseDinners && dinnerGateOpen ? (
            <DinnerUpgradeBanner
              className="dinner-upgrade-banner-dishes"
              onClose={() => setDinnerGateOpen(false)}
            />
          ) : null}

          {/* ── Active filter chips ── */}
          {(() => {
            const chips = [];
            if (!isIngredientsTab) {
              if (mineOnly) chips.push({ key: "mine", label: "Mis platos", onRemove: () => setMineOnly(false) });
              if (catalogOnly) chips.push({ key: "catalog", label: "Solo catálogo", onRemove: () => setCatalogOnly(false) });
              if (selectedCatalogOption) chips.push({ key: "catalog-pack", label: selectedCatalogOption.label, onRemove: () => setSelectedCatalogPackId("") });
              if (dinnerOnly) chips.push({ key: "dinner", label: "Solo cenas", onRemove: () => setDinnerOnly(false) });
              if (randomIncludedOnly) chips.push({ key: "randomization", label: "Incluidos en randomización", onRemove: () => setRandomIncludedOnly(false) });
              if (selectedDishCategoryId) {
                const cat = dishCategoryMap.get(String(selectedDishCategoryId));
                if (cat) chips.push({ key: "cat", label: cat.name, onRemove: () => setSelectedDishCategoryId("") });
              }
            } else if (selectedIngredientCategoryId) {
              const cat = ingredientCategories.find((c) => String(c._id) === selectedIngredientCategoryId);
              if (cat) chips.push({ key: "ingcat", label: cat.name, onRemove: () => setSelectedIngredientCategoryId("") });
            }
            if (chips.length === 0) return null;
            return (
              <div className="dfc-chips-row">
                {chips.map((chip) => (
                  <button key={chip.key} type="button" className="dfc-chip" onClick={chip.onRemove}>
                    {chip.label}
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" aria-hidden="true"><path d="M18 6 6 18M6 6l12 12"/></svg>
                  </button>
                ))}
                <button type="button" className="dfc-chip-clear-all" onClick={() => {
                  setMineOnly(false); setCatalogOnly(false); setDinnerOnly(false); setRandomIncludedOnly(false);
                  setSelectedCatalogPackId(""); setSelectedDishCategoryId(""); setSelectedIngredientCategoryId("");
                }}>
                  Limpiar
                </button>
              </div>
            );
          })()}

        </PageHeader>
        {/* Onboarding suggestions (outside panel, above grid) */}
        {(isIngredientsTab ? filteredIngredientSuggestions : (activeTab === "main" ? filteredDishSuggestions : [])).length > 0 && (
          <div style={{ padding: "4px 4px 0" }}>
            <p style={{ margin: "0 0 6px", fontSize: 11, fontWeight: 700, color: "var(--hf-brand)", letterSpacing: "0.06em", textTransform: "uppercase" }}>
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
                    background: "var(--chip-active-bg)", border: "1.5px solid var(--hf-brand)",
                    color: "var(--chip-active-text)", cursor: "pointer", fontWeight: 600,
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
                  <article className="prd-card hf-anim-rise" key={ingredient._id} style={{ "--hf-anim-i": 0 }}>
                    {/* icon square */}
                    <div
                      className="prd-icon"
                      style={{
                        background: ingredient.categoryId?.colorBg || "var(--surface-muted)",
                        color: ingredient.categoryId?.colorText || "var(--text-muted)"
                      }}
                    >
                      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                        <path d="m5 11 4-7"/><path d="m19 11-4-7"/><path d="M2 11h20"/><path d="m3.5 11 1.6 7.4a2 2 0 0 0 2 1.6h9.8a2 2 0 0 0 2-1.6L20.5 11"/>
                      </svg>
                    </div>
                    {/* info */}
                    <div className="prd-info">
                      <h3 className="prd-name">{ingredient.name}</h3>
                      <span className="prd-cat" style={{ color: ingredient.categoryId?.colorText || "var(--text-muted)" }}>
                        <span className="prd-cat-dot" />
                        {categoryName}
                        {!ingredient.active ? " · Inactivo" : null}
                      </span>
                    </div>
                    {/* kebab */}
                    <div className="prd-actions" onPointerDown={(e) => e.stopPropagation()}>
                      <button
                        type="button"
                        className="dfc-kebab"
                        aria-label={`Más acciones para ${ingredient.name}`}
                        aria-haspopup="menu"
                        aria-expanded={openIngMenuId === ingredient._id}
                        onClick={(e) => { e.stopPropagation(); setOpenIngMenuId(openIngMenuId === ingredient._id ? null : ingredient._id); }}
                      >
                        <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                          <circle cx="12" cy="5" r="1.7"/><circle cx="12" cy="12" r="1.7"/><circle cx="12" cy="19" r="1.7"/>
                        </svg>
                      </button>
                      {openIngMenuId === ingredient._id ? (
                        <div role="menu" className="prd-menu">
                          <button role="menuitem" className="dfc-menuitem" onClick={() => { setOpenIngMenuId(null); startIngredientEdit(ingredient); }}>
                            <Pencil size={16} aria-hidden="true" />
                            Editar producto
                          </button>
                          <button role="menuitem" className="dfc-menuitem" onClick={() => { setOpenIngMenuId(null); duplicateIngredient(ingredient); }}>
                            <Copy size={16} aria-hidden="true" />
                            Duplicar
                          </button>
                          <div className="dfc-menu-sep" />
                          <button role="menuitem" className="dfc-menuitem dfc-menuitem--danger" onClick={() => { setOpenIngMenuId(null); deleteIngredient(ingredient); }}>
                            <Trash2 size={16} aria-hidden="true" />
                            Eliminar producto
                          </button>
                        </div>
                      ) : null}
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
              const randomEnabled = dish.allowRandom !== false;
              const toggleDisabled = dishTogglePendingId === dish._id;
              const dishOrigin = getDishOrigin(dish);
              const isCatalogDish = isDishFromCatalog(dish);
              const packColor = isCatalogDish && dish.sourcePackColor ? dish.sourcePackColor : null;
              const hasRecipe = Boolean(dish.recipe && (dish.recipe.ingredients?.length > 0 || dish.recipe.steps));
              const canDeleteDish = user?.role === "admin" || user?.role === "owner" || user?.globalRole === "diod";
              return (
                <article
                  className="dfc-card hf-anim-rise"
                  key={dish._id}
                  data-dish-id={dish._id}
                  style={{ "--hf-anim-i": dishIndex }}
                >
                  {/* header: name + badges */}
                  <div className="dfc-hd">
                    <h3 className="dfc-name">{dish.name}</h3>
                    <div className="dfc-badges">
                      {dish.isDinner ? (
                        <span className="dfc-badge dfc-badge--dinner" title="Plato de cena">
                          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z"/></svg>
                          Cena
                        </span>
                      ) : null}
                      {dish.special ? (
                        <span className="dfc-badge dfc-badge--special" title="Plato especial — excluido del plan automático">
                          <svg width="11" height="11" viewBox="0 0 24 24" fill="currentColor" stroke="none" aria-hidden="true"><path d="M12 2.5l2.6 5.85 6.4.55-4.85 4.2 1.45 6.25L12 16.2 6.35 19.6l1.45-6.25L2.95 9.4l6.4-.55z"/></svg>
                          Especial
                        </span>
                      ) : null}
                    </div>
                  </div>

                  {/* meta: category pill + catalog source */}
                  <div className="dfc-meta">
                    <span
                      className="dfc-cat"
                      style={{
                        background: dishCategory?.colorBg || "var(--surface-muted)",
                        color: dishCategory?.colorText || "var(--text-muted)"
                      }}
                    >
                      <span className="dfc-cat-dot" />
                      {dishCategory?.name || "Sin categoría"}
                    </span>
                    {isCatalogDish && dish.sourcePackTitle ? (
                      <span className="dfc-catalog-src">
                        <BookOpen size={13} aria-hidden="true" />
                        {dish.sourcePackTitle}
                      </span>
                    ) : null}
                  </div>

                  {/* randomization toggle */}
                  <label
                    className={`dfc-random${toggleDisabled ? " is-loading" : ""}${dish.special ? " is-special" : ""}`}
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

                  {/* footer: main actions + kebab */}
                  <div className="dfc-footer">
                    {!isDiodGlobalMode ? (
                      <button
                        type="button"
                        className="dfc-btn dfc-btn--schedule"
                        onClick={() => openAssignModal(dish)}
                        aria-label={`Programar ${dish.name}`}
                      >
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>
                        Programar
                      </button>
                    ) : null}
                    <button
                      type="button"
                      className="dfc-btn dfc-btn--cook"
                      data-tour-id="dish-cook"
                      onClick={() => setRecipeModalDish(dish)}
                      aria-label={`Cocinar ${dish.name} ahora`}
                    >
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M8.5 14.5A2.5 2.5 0 0 0 11 12c0-1.38-.5-2-1-3-1.07-2.14-.22-4.05 2-6 .5 2.5 2 4.9 4 6.5 2 1.6 3 3.5 3 5.5a7 7 0 1 1-14 0c0-1.15.43-2.29 1-3a2.5 2.5 0 0 0 2.5 2.5z"/></svg>
                      Cocinar ahora
                    </button>
                    {/* kebab menu */}
                    <div className="dfc-menu-wrap" onPointerDown={(e) => e.stopPropagation()}>
                      <button
                        type="button"
                        className="dfc-kebab"
                        aria-label={`Más acciones para ${dish.name}`}
                        aria-haspopup="menu"
                        aria-expanded={openDishMenuId === dish._id}
                        onClick={(e) => { e.stopPropagation(); setOpenDishMenuId(openDishMenuId === dish._id ? null : dish._id); }}
                      >
                        <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                          <circle cx="12" cy="5" r="1.7"/><circle cx="12" cy="12" r="1.7"/><circle cx="12" cy="19" r="1.7"/>
                        </svg>
                      </button>
                      {openDishMenuId === dish._id ? (
                        <div role="menu" className="dfc-menu">
                          <button role="menuitem" className="dfc-menuitem" onClick={() => { setOpenDishMenuId(null); startEdit(dish); }}>
                            <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M12 20h9"/><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z"/></svg>
                            Editar plato
                          </button>
                          <button role="menuitem" className="dfc-menuitem" onClick={() => { setOpenDishMenuId(null); toggleDishAllowRandom(dish, !randomEnabled); }}>
                            <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="m18 2 4 4-4 4"/><path d="M2 6h4a8 8 0 0 1 8 8 8 8 0 0 0 8 8"/><path d="M2 18h4a8 8 0 0 0 6-3"/></svg>
                            {randomEnabled ? "Excluir de randomización" : "Incluir en randomización"}
                          </button>
                          {dishOrigin.canRevert ? (
                            <button role="menuitem" className="dfc-menuitem" onClick={() => { setOpenDishMenuId(null); askRevertDish(dish); }}>
                              <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M3 12a9 9 0 1 0 3-6.7L3 8"/><path d="M3 3v5h5"/></svg>
                              Restaurar original
                            </button>
                          ) : null}
                          {canDeleteDish ? (
                            <>
                              <div className="dfc-menu-sep" />
                              <button role="menuitem" className="dfc-menuitem dfc-menuitem--danger" onClick={() => { setOpenDishMenuId(null); askDeleteDish(dish); }}>
                                <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M3 6h18"/><path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6"/></svg>
                                Eliminar plato
                              </button>
                            </>
                          ) : null}
                        </div>
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
        onSaved={(savedDish) => {
          rememberSavedDish(savedDish);
          if (!activeDish) {
            notifyOnboarding("create_dish");
            notifyWeekly("dish_created");
            if ((savedDish?.ingredients?.length ?? 0) > 0) notifyOnboarding("add_ingredient_to_dish");
          } else if ((savedDish?.ingredients?.length ?? 0) > 0) {
            notifyOnboarding("add_ingredient_to_dish");
          }
          setDishSuggestionName("");
        }}
        onRecipeSaved={rememberSavedDish}
        categories={categories}
        dishCategories={dishCategories}
        onCategoryCreated={onCategoryCreated}
        onIngredientCreated={rememberSavedIngredient}
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
        onSaved={(savedIngredient) => {
          rememberSavedIngredient(savedIngredient);
          if (!activeIngredient) {
            notifyOnboarding("create_ingredient");
            notifyWeekly("ingredient_created");
          }
          setIngredientSuggestionName("");
        }}
        categories={categories}
        onCategoryCreated={onCategoryCreated}
        initialIngredient={activeIngredient}
        initialName={ingredientSuggestionName}
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

      {/* ── Filter sheet modal ── */}
      {filterPanelOpen ? (
        <div className="fsh-overlay" role="presentation" onClick={() => setFilterPanelOpen(false)}>
          <div
            role="dialog"
            aria-modal="true"
            aria-label="Filtros"
            className="fsh-dialog"
            onClick={(e) => e.stopPropagation()}
          >
            {/* header */}
            <div className="fsh-header">
              <h2 className="fsh-title">Filtros</h2>
              <button type="button" className="fsh-close" aria-label="Cerrar filtros" onClick={() => setFilterPanelOpen(false)}>
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" aria-hidden="true"><path d="M18 6 6 18M6 6l12 12"/></svg>
              </button>
            </div>

            {/* body */}
            <div className="fsh-body">
              {/* Origen (dishes only) */}
              {!isIngredientsTab && !isDiodGlobalMode ? (
                <div>
                  <p className="fsh-section-label">Origen</p>
                  <div className="fsh-pill-group">
                    <button type="button" className={`fsh-pill${!mineOnly && !catalogOnly ? " is-active" : ""}`} onClick={() => { setMineOnly(false); setCatalogOnly(false); }}>Todos</button>
                    <button type="button" className={`fsh-pill${mineOnly ? " is-active" : ""}`} onClick={() => { setMineOnly(true); setCatalogOnly(false); setSelectedCatalogPackId(""); }}>Mis platos</button>
                    <button type="button" className={`fsh-pill${catalogOnly ? " is-active" : ""}`} onClick={() => { setCatalogOnly(true); setMineOnly(false); }}>Solo catálogo</button>
                  </div>
                </div>
              ) : null}

              {/* Catálogo - dishes only */}
              {!isIngredientsTab && !isDiodGlobalMode ? (
                <div className="fsh-select-section">
                  <p className="fsh-section-label">Catálogo</p>
                  <SearchableSelect
                    options={catalogOptions}
                    value={mineOnly ? "" : selectedCatalogPackId}
                    onChange={setSelectedCatalogPackId}
                    emptyLabel="Todos los catálogos"
                    placeholder="Buscar catálogo..."
                    disabled={mineOnly || catalogsLoading || catalogOptions.length === 0}
                  />
                  {mineOnly ? (
                    <p className="fsh-helper-text">No se aplica a Mis platos.</p>
                  ) : catalogsLoading ? (
                    <p className="fsh-helper-text">Cargando catálogos...</p>
                  ) : catalogOptions.length === 0 ? (
                    <p className="fsh-helper-text">No hay catálogos instalados.</p>
                  ) : null}
                </div>
              ) : null}

              {/* Categoria - dishes */}
              {!isIngredientsTab && filterChips.length > 0 ? (
                <div>
                  <p className="fsh-section-label">Categoría</p>
                  <div className="fsh-pill-group">
                    <button type="button" className={`fsh-pill${!selectedDishCategoryId ? " is-active" : ""}`} onClick={() => setSelectedDishCategoryId("")}>Todos</button>
                    {filterChips.map((cat) => {
                      const catId = String(cat._id || "");
                      return (
                        <button
                          key={catId}
                          type="button"
                          className={`fsh-pill${String(selectedDishCategoryId) === catId ? " is-active" : ""}`}
                          onClick={() => setSelectedDishCategoryId((p) => String(p || "") === catId ? "" : catId)}
                        >
                          {cat.name}
                        </button>
                      );
                    })}
                  </div>
                </div>
              ) : null}

              {/* Categoría — ingredients */}
              {isIngredientsTab && ingredientCategories.length > 0 ? (
                <div>
                  <p className="fsh-section-label">Categoría</p>
                  <div className="fsh-pill-group">
                    <button type="button" className={`fsh-pill${!selectedIngredientCategoryId ? " is-active" : ""}`} onClick={() => setSelectedIngredientCategoryId("")}>Todos</button>
                    {sortedIngredientCategories.map((cat) => {
                      const catId = String(cat._id || "");
                      return (
                        <button
                          key={catId}
                          type="button"
                          className={`fsh-pill${selectedIngredientCategoryId === catId ? " is-active" : ""}`}
                          onClick={() => setSelectedIngredientCategoryId((p) => p === catId ? "" : catId)}
                        >
                          {cat.name}
                        </button>
                      );
                    })}
                  </div>
                </div>
              ) : null}

              {/* Propiedades (dishes only) */}
              {!isIngredientsTab ? (
                <div>
                  <p className="fsh-section-label">Propiedades</p>
                  <div className="fsh-toggles">
                    <label className="fsh-toggle-row">
                      <span className="fsh-toggle-label">Solo platos de cena</span>
                      <button
                        type="button"
                        role="switch"
                        className="fsh-switch"
                        aria-checked={dinnerOnly ? "true" : "false"}
                        aria-label="Solo platos de cena"
                        onClick={() => {
                          if (!canUseDinners) { setDinnerGateOpen(true); return; }
                          setDinnerOnly((v) => !v);
                        }}
                      />
                    </label>
                    <label className="fsh-toggle-row">
                      <span className="fsh-toggle-label">Incluidos en randomización</span>
                      <button
                        type="button"
                        role="switch"
                        className="fsh-switch"
                        aria-checked={randomIncludedOnly ? "true" : "false"}
                        aria-label="Incluidos en randomización"
                        onClick={() => setRandomIncludedOnly((v) => !v)}
                      />
                    </label>
                    <p className="fsh-helper-text">Muestra solo los platos que pueden salir al randomizar.</p>
                  </div>
                </div>
              ) : null}
            </div>

            {/* footer */}
            <div className="fsh-footer">
              <button type="button" className="fsh-footer-clear" onClick={() => {
                setMineOnly(false); setCatalogOnly(false); setDinnerOnly(false); setRandomIncludedOnly(false);
                setSelectedCatalogPackId(""); setSelectedDishCategoryId(""); setSelectedIngredientCategoryId("");
              }}>
                Limpiar
              </button>
              <button type="button" className="fsh-footer-apply" onClick={() => setFilterPanelOpen(false)}>
                Ver {isIngredientsTab ? visibleIngredients.length : visibleDishes.length} resultados
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

