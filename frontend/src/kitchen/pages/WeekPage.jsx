import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { apiRequest } from "../api.js";
import { useAuth } from "../auth";
import WeekDaysStrip from "../components/WeekDaysStrip.jsx";
import IngredientPicker from "../components/IngredientPicker.jsx";
import DishModal from "../components/DishModal.jsx";
import WeekNavigator from "../components/ui/WeekNavigator.jsx";
import KitchenLayout from "../Layout.jsx";
import { normalizeIngredientName } from "../utils/normalize.js";
import { getUserColorById } from "../utils/userColors";
import { getUserInitialsFromProfile } from "../utils/userInitials.js";
import { useActiveWeek } from "../weekContext.jsx";

const DAY_CARD_STYLES = [
  { background: "#eef2ff", color: "#1f2a60" },
  { background: "#ecfeff", color: "#134e4a" },
  { background: "#fef9c3", color: "#713f12" },
  { background: "#fce7f3", color: "#831843" },
  { background: "#dcfce7", color: "#14532d" },
  { background: "#ffedd5", color: "#7c2d12" },
  { background: "#ede9fe", color: "#4c1d95" }
];

function getMondayISO(date = new Date()) {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const day = d.getUTCDay();
  const diff = (day === 0 ? -6 : 1) - day;
  d.setUTCDate(d.getUTCDate() + diff);
  return d.toISOString().slice(0, 10);
}

function formatDateLabel(dateString) {
  if (!dateString) {
    return "Sin fecha";
  }
  const date = new Date(dateString);
  if (Number.isNaN(date.getTime())) {
    return "Sin fecha";
  }
  return date.toLocaleDateString("es-ES", { weekday: "long", day: "numeric", month: "short" });
}

function addDaysToISO(dateString, days) {
  const [year, month, day] = dateString.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function parseISODateInput(dateString) {
  const [year, month, day] = String(dateString || "").split("-").map(Number);
  if (!year || !month || !day) return null;
  const date = new Date(year, month - 1, day);
  return Number.isNaN(date.getTime()) ? null : date;
}

function normalizeWeekStart(dateString) {
  const parsed = parseISODateInput(dateString);
  if (!parsed) return getMondayISO();
  return getMondayISO(parsed);
}

function ChevronIcon(props) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" {...props}>
      <path d="M15 18l-6-6 6-6" />
    </svg>
  );
}
function DiceIcon(props) {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true" {...props}>
      <rect x="4.5" y="4.5" width="15" height="15" rx="3" stroke="currentColor" strokeWidth="1.8" />
      <circle cx="9" cy="9" r="1.3" fill="currentColor" />
      <circle cx="15" cy="15" r="1.3" fill="currentColor" />
      <circle cx="9" cy="15" r="1.3" fill="currentColor" />
    </svg>
  );
}
function EditIcon(props) {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true" {...props}>
      <path d="M4 20h4l10.5-10.5a1.4 1.4 0 0 0 0-2L16.5 5a1.4 1.4 0 0 0-2 0L4 15.5V20z" stroke="currentColor" strokeWidth="1.7" />
      <path d="M13.5 6.5l4 4" stroke="currentColor" strokeWidth="1.7" />
    </svg>
  );
}
function EyeIcon(props) {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true" {...props}>
      <path d="M2.5 12s3.5-6 9.5-6 9.5 6 9.5 6-3.5 6-9.5 6-9.5-6-9.5-6z" stroke="currentColor" strokeWidth="1.7" />
      <circle cx="12" cy="12" r="2.8" stroke="currentColor" strokeWidth="1.7" />
    </svg>
  );
}
function InfoIcon(props) {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true" {...props}>
      <circle cx="12" cy="12" r="8.5" stroke="currentColor" strokeWidth="1.7" />
      <path d="M12 10.5v5" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
      <circle cx="12" cy="7.8" r="1.1" fill="currentColor" />
    </svg>
  );
}
function SwapIcon(props) {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true" {...props}>
      <path d="M7 7h10l-2.5-2.5M17 7l-2.5 2.5" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M17 17H7l2.5-2.5M7 17l2.5 2.5" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
function TrashIcon(props) {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true" {...props}>
      <path d="M5 7h14M9 7V5.8c0-.9.7-1.6 1.6-1.6h2.8c.9 0 1.6.7 1.6 1.6V7m-8.6 0 .7 11a1.6 1.6 0 0 0 1.6 1.5h6.6a1.6 1.6 0 0 0 1.6-1.5l.7-11" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
      <path d="M10 11.2v5.5M14 11.2v5.5" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
    </svg>
  );
}
function SaveIcon(props) {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true" {...props}>
      <path d="M5 12.5l4.2 4.2L19 6.9" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
function CloseIcon(props) {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true" {...props}>
      <path d="M6 6l12 12M18 6l-12 12" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" />
    </svg>
  );
}
function TodayIcon(props) {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true" {...props}>
      <path d="M8 3.5v2.2M16 3.5v2.2M4.5 9h15" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
      <rect x="4.5" y="5.8" width="15" height="14.7" rx="2.4" stroke="currentColor" strokeWidth="1.7" />
      <circle cx="12" cy="14" r="2.1" fill="currentColor" />
    </svg>
  );
}

const MAX_DISH_RESULTS = 8;
const WEEK_MEAL_TAB_KEY = "kitchen_week_meal_tab";
const OPTIONAL_WEEKEND_DAY_OFFSETS = {
  saturday: 5,
  sunday: 6
};

function normalizeMealType(value) {
  return String(value || "").toLowerCase() === "dinner" ? "dinner" : "lunch";
}

function dayMealType(day) {
  return normalizeMealType(day?.mealType || "lunch");
}

function mergeIngredientLists(...lists) {
  const merged = new Map();
  lists.flat().filter(Boolean).forEach((item) => {
    const displayName = String(item?.displayName || "").trim();
    const canonicalName = String(
      item?.canonicalName || normalizeIngredientName(displayName)
    ).trim();
    if (!displayName || !canonicalName) return;
    const key = item?.ingredientId || canonicalName;
    if (!merged.has(key)) {
      merged.set(key, {
        ...item,
        displayName,
        canonicalName
      });
    }
  });
  return Array.from(merged.values());
}

function isActiveMember(user) {
  return user?.active !== false;
}

function resolveDayAttendees(day, users = [], mealType = "lunch") {
  if (Array.isArray(day?.attendeeIds)) return day.attendeeIds.map((item) => String(item));
  if (normalizeMealType(mealType) === "dinner") {
    return users
      .filter((member) => isActiveMember(member) && member?.dinnerActive !== false)
      .map((member) => String(member.id));
  }
  return users
    .filter((member) => isActiveMember(member))
    .map((member) => String(member.id));
}

function normalizeExclusionKey(value) {
  return String(value || "").trim().toLowerCase();
}

function formatWeekendOptionLabel(dayKey) {
  const offset = OPTIONAL_WEEKEND_DAY_OFFSETS[dayKey];
  if (!Number.isInteger(offset)) return "";
  const isoDate = addDaysToISO(getMondayISO(new Date("2000-01-03T00:00:00Z")), offset);
  return new Date(`${isoDate}T00:00:00Z`).toLocaleDateString("es-ES", { weekday: "long" });
}

function isOptionalWeekendDayKey(dayKey, weekStart) {
  if (!dayKey || !weekStart) return false;
  return dayKey === addDaysToISO(weekStart, OPTIONAL_WEEKEND_DAY_OFFSETS.saturday)
    || dayKey === addDaysToISO(weekStart, OPTIONAL_WEEKEND_DAY_OFFSETS.sunday);
}

export default function WeekPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const { activeWeek: weekStart, setActiveWeek: setWeekStart } = useActiveWeek();
  const [plan, setPlan] = useState(null);
  const [dishes, setDishes] = useState([]);
  const [sideDishes, setSideDishes] = useState([]);
  const [users, setUsers] = useState([]);
  const [categories, setCategories] = useState([]);
  const [dishCategories, setDishCategories] = useState([]);
  const [dinnersEnabled, setDinnersEnabled] = useState(false);
  const [mealTab, setMealTab] = useState(() => {
    if (typeof window === "undefined") return "lunch";
    return normalizeMealType(window.localStorage.getItem(WEEK_MEAL_TAB_KEY) || "lunch");
  });
  const [loading, setLoading] = useState(true);
  const [dishesLoading, setDishesLoading] = useState(false);
  const [dishesLoadedForHouseholdKey, setDishesLoadedForHouseholdKey] = useState("");
  const [creatingPlan, setCreatingPlan] = useState(false);
  const [loadError, setLoadError] = useState("");
  const [weekNotice, setWeekNotice] = useState(null);
  const [dayStatus, setDayStatus] = useState({});
  const [dayErrors, setDayErrors] = useState({});
  const [dayAttendanceBusy, setDayAttendanceBusy] = useState({});
  const [extraIngredientsByDay, setExtraIngredientsByDay] = useState({});
  const [addIngredientsOpen, setAddIngredientsOpen] = useState({});
  const [selectedDay, setSelectedDay] = useState("");
  const [editingDays, setEditingDays] = useState({});
  const [draftCookUserByDay, setDraftCookUserByDay] = useState({});
  const [persistedCookUserByDay, setPersistedCookUserByDay] = useState({});
  const [sideDishEnabled, setSideDishEnabled] = useState({});
  const [showCarouselControls, setShowCarouselControls] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const [mainDishQueries, setMainDishQueries] = useState({});
  const [mainDishOpen, setMainDishOpen] = useState({});
  const [sideDishQueries, setSideDishQueries] = useState({});
  const [sideDishOpen, setSideDishOpen] = useState({});
  const [leftoversByDay, setLeftoversByDay] = useState({});
  const [leftoverOptionsByDay, setLeftoverOptionsByDay] = useState({});
  const [leftoverLoadingByDay, setLeftoverLoadingByDay] = useState({});
  const [assigneeOpen, setAssigneeOpen] = useState({});
  const [moveTargetByDay, setMoveTargetByDay] = useState({});
  const [infoOpenByDay, setInfoOpenByDay] = useState({});
  const [swapDialogDay, setSwapDialogDay] = useState(null);
  const [swapTargetDate, setSwapTargetDate] = useState("");
  const [swapBusy, setSwapBusy] = useState(false);
  const [moveDialogDay, setMoveDialogDay] = useState(null);
  const [moveDialogBusy, setMoveDialogBusy] = useState(false);
  const [deleteDialogDay, setDeleteDialogDay] = useState(null);
  const [deleteBusy, setDeleteBusy] = useState(false);
  const [attendeeDialogDay, setAttendeeDialogDay] = useState(null);
  const [attendeeDialogEditable, setAttendeeDialogEditable] = useState(false);
  const [attendeeDraftIds, setAttendeeDraftIds] = useState([]);
  const [attendeeDialogBusy, setAttendeeDialogBusy] = useState(false);
  const [attendeeDialogError, setAttendeeDialogError] = useState("");
  const [dishModalOpen, setDishModalOpen] = useState(false);
  const [dishModalName, setDishModalName] = useState("");
  const [dishModalDayKey, setDishModalDayKey] = useState(null);
  const [dishModalMode, setDishModalMode] = useState("main");
  const [dishModalSidedish, setDishModalSidedish] = useState(false);
  const [dishModalMealType, setDishModalMealType] = useState("lunch");
  const [dinnerShoppingChoiceDialog, setDinnerShoppingChoiceDialog] = useState(null);
  const [weekRandomizeConfirmOpen, setWeekRandomizeConfirmOpen] = useState(false);
  const [weekRandomizing, setWeekRandomizing] = useState(false);
  const [weekDeleteConfirmOpen, setWeekDeleteConfirmOpen] = useState(false);
  const [weekDeleteBusy, setWeekDeleteBusy] = useState(false);
  const [weekendDialogOpen, setWeekendDialogOpen] = useState(false);
  const [weekendBusy, setWeekendBusy] = useState(false);
  const ingredientCache = useRef(new Map());
  const saveTimers = useRef({});
  const carouselRef = useRef(null);
  const dayRefs = useRef(new Map());
  const mainDishRefs = useRef(new Map());
  const sideDishRefs = useRef(new Map());
  const sideDishPickingRef = useRef({});
  const selectedDayRef = useRef(selectedDay);
  const editingDayKeyRef = useRef("");
  const hasInitializedRef = useRef(false);
  const pendingJumpToCurrentRef = useRef(false);
  const assignIntentRef = useRef(null);
  const dismissedMissingWeekPromptRef = useRef(new Set());
  const loadRequestSeqRef = useRef(0);
  const userRef = useRef(user);
  const weekStartRef = useRef(weekStart);
  const dishesRef = useRef(dishes);
  const visibleDaysRef = useRef([]);
  const shoppingChoiceResolverRef = useRef(null);
  const [missingWeekPromptOpen, setMissingWeekPromptOpen] = useState(false);
  const safeDays = useMemo(() => (Array.isArray(plan?.days) ? plan.days : []), [plan]);
  const selectedMealType = dinnersEnabled ? normalizeMealType(mealTab) : "lunch";
  const visibleDays = useMemo(
    () => safeDays.filter((day) => dayMealType(day) === selectedMealType),
    [safeDays, selectedMealType]
  );
  const visibleDayKeySet = useMemo(
    () => new Set(visibleDays.map((day) => day?.date?.slice(0, 10)).filter(Boolean)),
    [visibleDays]
  );
  const isOwnerAdmin = user?.role === "owner" || user?.role === "admin";
  const canManageAttendees = isOwnerAdmin;
  const isDiodGlobalMode = user?.globalRole === "diod" && !user?.activeHouseholdId;
  const hasIncompleteVisibleDays = visibleDays.some((day) => !day?.mainDishId && !day?.isLeftovers);
  const canShowWeekRandomize = Boolean(plan && visibleDays.length && hasIncompleteVisibleDays);
  const currentHouseholdId = user?.activeHouseholdId || user?.householdId || null;
  const currentHouseholdKey = currentHouseholdId ? String(currentHouseholdId) : "__no_household__";
  const dishesReadyForCurrentHousehold = !dishesLoading && dishesLoadedForHouseholdKey === currentHouseholdKey;
  const weekendOptionState = useMemo(() => {
    const saturdayDate = addDaysToISO(weekStart, OPTIONAL_WEEKEND_DAY_OFFSETS.saturday);
    const sundayDate = addDaysToISO(weekStart, OPTIONAL_WEEKEND_DAY_OFFSETS.sunday);
    const hasSaturday = visibleDayKeySet.has(saturdayDate);
    const hasSunday = visibleDayKeySet.has(sundayDate);
    return {
      saturdayDate,
      sundayDate,
      hasSaturday,
      hasSunday,
      availableDays: [
        !hasSaturday ? "saturday" : null,
        !hasSunday ? "sunday" : null
      ].filter(Boolean)
    };
  }, [visibleDayKeySet, weekStart]);

  const getCurrentHouseholdId = useCallback(() => {
    return userRef.current?.activeHouseholdId || userRef.current?.householdId || null;
  }, []);

  const refreshCurrentDishes = useCallback(async () => {
    const householdIdAtRequest = getCurrentHouseholdId();
    const householdKeyAtRequest = householdIdAtRequest ? String(householdIdAtRequest) : "__no_household__";
    const dinnerQuery = selectedMealType === "dinner" ? "true" : "false";
    setDishesLoading(true);
    try {
      const [dishesData, sideDishesData] = await Promise.all([
        apiRequest(`/api/kitchen/dishes?isDinner=${dinnerQuery}`),
        apiRequest(`/api/kitchen/dishes?sidedish=true&isDinner=${dinnerQuery}`)
      ]);
      setDishes(dishesData.dishes || []);
      setSideDishes(sideDishesData.dishes || []);
      setDishesLoadedForHouseholdKey(householdKeyAtRequest);
      return dishesData.dishes || [];
    } catch (error) {
      setDishesLoadedForHouseholdKey("");
      throw error;
    } finally {
      setDishesLoading(false);
    }
  }, [getCurrentHouseholdId, selectedMealType]);

  const handleConfirmWeekRandomize = useCallback(async () => {
    setWeekRandomizing(true);
    setWeekNotice(null);
    try {
      const data = await apiRequest(`/api/kitchen/weeks/${weekStartRef.current}/randomize`, {
        method: "POST",
        body: JSON.stringify({ overwriteAll: false, mealType: selectedMealType })
      });
      setPlan(data.plan || null);
      const warningMessages = Array.isArray(data.warnings)
        ? data.warnings.filter((item) => String(item || "").trim())
        : [];
      const warningCodes = Array.isArray(data.warningCodes)
        ? data.warningCodes.filter((item) => String(item || "").trim())
        : [];
      const hasWarnings = warningMessages.length > 0;
      const hasOnlySpecialWarning = warningCodes.includes("only_special_excluded");
      if (data.insufficient) {
        const message = hasOnlySpecialWarning
          ? "No hay platos disponibles para randomizar (los platos especiales estan excluidos)."
          : hasWarnings
          ? `No hay suficientes platos para completar todos los dias sin repetir. ${warningMessages.join(" ")}`
          : "No hay suficientes platos para completar todos los dias sin repetir.";
        setWeekNotice({ type: "error", message });
      } else if (hasWarnings) {
        setWeekNotice({ type: "error", message: warningMessages.join(" ") });
      } else {
        setWeekNotice({ type: "success", message: "Semana randomizada" });
      }
      setWeekRandomizeConfirmOpen(false);
    } catch (err) {
      setWeekNotice({
        type: "error",
        message: err.message || "No se pudo randomizar la semana."
      });
      setWeekRandomizeConfirmOpen(false);
    } finally {
      setWeekRandomizing(false);
    }
  }, [selectedMealType]);

  const handleConfirmWeekDelete = useCallback(async () => {
    if (weekDeleteBusy) return;
    setWeekDeleteBusy(true);
    setWeekNotice(null);
    setLoadError("");
    try {
      const data = await apiRequest(`/api/kitchen/weeks/${weekStartRef.current}/reset`, {
        method: "POST",
        body: JSON.stringify({ mealType: selectedMealType })
      });
      setPlan(data?.plan || null);
      setWeekDeleteConfirmOpen(false);
      setWeekNotice({
        type: "success",
        message: `Programacion semanal de ${selectedMealType === "dinner" ? "cenas" : "comidas"} borrada`
      });
    } catch (err) {
      setWeekNotice({
        type: "error",
        message: err.message || "No se pudo borrar la semana."
      });
    } finally {
      setWeekDeleteBusy(false);
    }
  }, [selectedMealType, weekDeleteBusy]);

  const loadData = async () => {
    const requestSeq = loadRequestSeqRef.current + 1;
    loadRequestSeqRef.current = requestSeq;
    const householdIdAtRequest = user?.activeHouseholdId || user?.householdId || null;
    const householdKeyAtRequest = householdIdAtRequest ? String(householdIdAtRequest) : "__no_household__";

    if (!user || isDiodGlobalMode) {
      setLoading(false);
      setDishesLoading(false);
      setWeekNotice(null);
      setPlan(null);
      setDishes([]);
      setSideDishes([]);
      setUsers([]);
      setDishesLoadedForHouseholdKey("");
      return;
    }
    setLoading(true);
    setDishesLoading(true);
    setLoadError("");
    setWeekNotice(null);
    setMissingWeekPromptOpen(false);
    setPlan(null);
    setDishes([]);
    setSideDishes([]);
    setDishesLoadedForHouseholdKey("");
    try {
      const dinnerQuery = selectedMealType === "dinner" ? "true" : "false";
      const [planData, dishesData, sideDishesData] = await Promise.all([
        apiRequest(`/api/kitchen/weeks/${weekStart}`),
        apiRequest(`/api/kitchen/dishes?isDinner=${dinnerQuery}`),
        apiRequest(`/api/kitchen/dishes?sidedish=true&isDinner=${dinnerQuery}`)
      ]);
      if (requestSeq !== loadRequestSeqRef.current) return;
      setPlan(planData.plan || null);
      if (!planData.plan && !dismissedMissingWeekPromptRef.current.has(weekStart)) {
        setMissingWeekPromptOpen(true);
      }
      setDishes(dishesData.dishes || []);
      setSideDishes(sideDishesData.dishes || []);
      setDishesLoadedForHouseholdKey(householdKeyAtRequest);
      const [usersData, householdData] = await Promise.all([
        apiRequest("/api/kitchen/users/members"),
        apiRequest("/api/kitchen/household/summary")
      ]);
      if (requestSeq !== loadRequestSeqRef.current) return;
      setUsers(usersData.users || []);
      setDinnersEnabled(Boolean(householdData?.household?.dinnersEnabled));
    } catch (err) {
      if (requestSeq !== loadRequestSeqRef.current) return;
      setLoadError(err.message || "No se pudo cargar la semana.");
    } finally {
      if (requestSeq !== loadRequestSeqRef.current) return;
      setLoading(false);
      setDishesLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [user, weekStart, isOwnerAdmin, isDiodGlobalMode, selectedMealType]);

  useEffect(() => {
    userRef.current = user;
  }, [user]);

  useEffect(() => {
    weekStartRef.current = weekStart;
  }, [weekStart]);

  useEffect(() => {
    dishesRef.current = dishes;
  }, [dishes]);

  useEffect(() => {
    visibleDaysRef.current = visibleDays;
  }, [visibleDays]);

  useEffect(() => {
    if (!weekNotice) return undefined;
    const timer = window.setTimeout(() => {
      setWeekNotice(null);
    }, 3200);
    return () => window.clearTimeout(timer);
  }, [weekNotice]);

  useEffect(() => {
    if (!dinnersEnabled && mealTab !== "lunch") {
      setMealTab("lunch");
      return;
    }
    if (typeof window !== "undefined") {
      window.localStorage.setItem(WEEK_MEAL_TAB_KEY, normalizeMealType(mealTab));
    }
  }, [mealTab, dinnersEnabled]);

  useEffect(() => {
    if (!isDiodGlobalMode) return;
    setCategories([]);
  }, [isDiodGlobalMode]);

  const loadCategories = async () => {
    if (isDiodGlobalMode) return;
    try {
      const data = await apiRequest("/api/categories");
      setCategories(data.categories || []);
    } catch (err) {
      setLoadError(err.message || "No se pudieron cargar las categorías.");
    }
  };

  useEffect(() => {
    loadCategories();
  }, [isDiodGlobalMode]);

  const loadDishCategories = async () => {
    try {
      const data = await apiRequest("/api/kitchen/dish-categories");
      setDishCategories(data.categories || []);
    } catch (err) {
      setLoadError(err.message || "No se pudieron cargar las categorías de plato.");
    }
  };

  useEffect(() => {
    loadDishCategories();
  }, []);

  useEffect(() => {
    const onCatalogInvalidated = () => {
      void loadCategories();
    };
    window.addEventListener("kitchen:catalog-invalidated", onCatalogInvalidated);
    return () => window.removeEventListener("kitchen:catalog-invalidated", onCatalogInvalidated);
  }, [isDiodGlobalMode]);

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
    if (!visibleDays.length) {
      return;
    }
    let active = true;
    const loadExtras = async () => {
      const resolved = await Promise.all(
        visibleDays.map(async (day) => {
          if (!day?.date) {
            return ["", []];
          }
          const key = day.date.slice(0, 10);
          const items = await resolveIngredients(day.ingredientOverrides || []);
          return [key, items];
        })
      );
      if (!active) return;
      setExtraIngredientsByDay((prev) => {
        const next = { ...prev };
        resolved.forEach(([key, items]) => {
          if (!key) return;
          next[key] = items;
        });
        return next;
      });
    };
    loadExtras();
    return () => {
      active = false;
    };
  }, [visibleDays, resolveIngredients]);

  useEffect(() => {
    if (!visibleDays.length) {
      return;
    }
    const todayKey = new Date().toISOString().slice(0, 10);
    const fallbackDay = visibleDays[0]?.date?.slice(0, 10) || "";
    const todayIndex = visibleDays.findIndex((day) => day.date?.slice(0, 10) === todayKey);
    const containsToday = todayIndex !== -1;

    if (!hasInitializedRef.current || pendingJumpToCurrentRef.current) {
      const nextDay = containsToday ? todayKey : fallbackDay;
      setSelectedDay(nextDay);
      const targetIndex = containsToday && todayIndex >= 0 ? todayIndex : 0;
      setActiveIndex(targetIndex);
      requestAnimationFrame(() => {
        const element = carouselRef.current;
        if (!element) return;
        element.scrollTo({
          left: targetIndex * element.clientWidth,
          behavior: pendingJumpToCurrentRef.current ? "smooth" : "auto"
        });
      });
      pendingJumpToCurrentRef.current = false;
      hasInitializedRef.current = true;
      return;
    }

    setSelectedDay((prev) => {
      if (prev && visibleDays.some((day) => day.date?.slice(0, 10) === prev)) {
        return prev;
      }
      return fallbackDay;
    });
  }, [visibleDays, weekStart]);

  useEffect(() => {
    selectedDayRef.current = selectedDay;
  }, [selectedDay]);

  useEffect(() => {
    editingDayKeyRef.current = Object.keys(editingDays).find(Boolean) || "";
  }, [editingDays]);

  const dayKeys = useMemo(
    () => visibleDays.map((day) => day?.date?.slice(0, 10)).filter(Boolean),
    [visibleDays]
  );
  const dishMap = useMemo(() => {
    const map = new Map();
    [...dishes, ...sideDishes].forEach((dish) => {
      if (dish?._id) map.set(dish._id, dish);
    });
    return map;
  }, [dishes, sideDishes]);
  const showCookTiming = useMemo(() => {
    if (!visibleDays.length) {
      return false;
    }
    const [first] = visibleDays;
    return visibleDays.some((day) => day.cookTiming !== first.cookTiming);
  }, [visibleDays]);

  useEffect(() => {
    const element = carouselRef.current;
    if (!element) return;

    const updateControls = () => {
      const shouldShow = element.scrollWidth > element.clientWidth + 1;
      setShowCarouselControls(shouldShow);
    };

    updateControls();
    let observer;
    if (typeof ResizeObserver !== "undefined") {
      observer = new ResizeObserver(updateControls);
      observer.observe(element);
    }
    window.addEventListener("resize", updateControls);

    return () => {
      observer?.disconnect();
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

  function normalizeCookUserId(value) {
    if (value === undefined || value === null || value === "") return null;
    return String(value);
  }

  const updateDay = async (day, updates, options = {}) => {
    const targetWeekStart = options.weekStart || weekStartRef.current;
    const dayKey = day.date.slice(0, 10);
    const editingDayKey = editingDayKeyRef.current;
    const shouldKeepPersistedCook =
      editingDayKey === dayKey
      && !Object.prototype.hasOwnProperty.call(updates || {}, "cookUserId");
    const requestUpdates = shouldKeepPersistedCook
      ? {
          ...updates,
          cookUserId: normalizeCookUserId(
            Object.prototype.hasOwnProperty.call(persistedCookUserByDay, dayKey)
              ? persistedCookUserByDay[dayKey]
              : day?.cookUserId
          )
        }
      : updates;
    setDayErrors((prev) => ({ ...prev, [dayKey]: "" }));
    setDayStatus((prev) => ({ ...prev, [dayKey]: "saving" }));
    try {
      if (import.meta.env.DEV) {
        console.debug("[kitchen][update-day] request", {
          householdId: getCurrentHouseholdId() ? String(getCurrentHouseholdId()) : null,
          weekStart: targetWeekStart,
          day: day.date.slice(0, 10),
          mainDishId: requestUpdates?.mainDishId ? String(requestUpdates.mainDishId) : null
        });
      }
      const mealType = dayMealType(day);
      const data = await apiRequest(`/api/kitchen/weeks/${targetWeekStart}/day/${day.date.slice(0, 10)}?mealType=${mealType}`, {
        method: "PUT",
        body: JSON.stringify({ ...requestUpdates, mealType })
      });
      setPlan(data.plan);
      setDayStatus((prev) => ({ ...prev, [dayKey]: "saved" }));
      if (saveTimers.current[dayKey]) {
        clearTimeout(saveTimers.current[dayKey]);
      }
      saveTimers.current[dayKey] = window.setTimeout(() => {
        setDayStatus((prev) => ({ ...prev, [dayKey]: "" }));
      }, 2000);
      if (options.returnErrorObject) {
        return { plan: data.plan, error: null };
      }
      return data.plan;
    } catch (err) {
      const message = err.message || "No se pudo actualizar el día.";
      setDayErrors((prev) => ({ ...prev, [dayKey]: message }));
      setDayStatus((prev) => ({ ...prev, [dayKey]: "error" }));
      if (options.returnErrorObject) {
        return { plan: null, error: err };
      }
      return null;
    }
  };

  const onAssignSelf = async (day, options = {}) => {
    const currentUserId = userRef.current?.id || userRef.current?._id;
    return updateDay(day, { cookUserId: currentUserId }, options);
  };

  const clearCookDraftState = (dayKey) => {
    setDraftCookUserByDay((prev) => {
      if (!Object.prototype.hasOwnProperty.call(prev, dayKey)) return prev;
      const next = { ...prev };
      delete next[dayKey];
      return next;
    });
    setPersistedCookUserByDay((prev) => {
      if (!Object.prototype.hasOwnProperty.call(prev, dayKey)) return prev;
      const next = { ...prev };
      delete next[dayKey];
      return next;
    });
  };

  const persistFinalCookAssignment = async (dayKey, reason = "explicit-save") => {
    const day = visibleDaysRef.current.find((entry) => entry?.date?.slice(0, 10) === dayKey);
    if (!day) {
      clearCookDraftState(dayKey);
      return true;
    }

    const previousPersistedCookUserId = normalizeCookUserId(
      Object.prototype.hasOwnProperty.call(persistedCookUserByDay, dayKey)
        ? persistedCookUserByDay[dayKey]
        : day?.cookUserId
    );
    const finalCookUserId = normalizeCookUserId(
      Object.prototype.hasOwnProperty.call(draftCookUserByDay, dayKey)
        ? draftCookUserByDay[dayKey]
        : previousPersistedCookUserId
    );

    if (import.meta.env.DEV) {
      console.debug("[kitchen][cook-finalize]", {
        dayKey,
        reason,
        previousPersistedCookUserId,
        finalCookUserId
      });
    }

    if (previousPersistedCookUserId === finalCookUserId) {
      console.info("[kitchen][cook-finalize] push skipped", {
        dayKey,
        reason,
        previousPersistedCookUserId,
        finalCookUserId,
        skipReason: finalCookUserId ? "same-cook" : "no-cook"
      });
      clearCookDraftState(dayKey);
      return true;
    }

    const result = await updateDay(
      day,
      { cookUserId: finalCookUserId || null },
      { returnErrorObject: true }
    );

    if (result?.error) {
      console.info("[kitchen][cook-finalize] push skipped", {
        dayKey,
        reason,
        previousPersistedCookUserId,
        finalCookUserId,
        skipReason: "save-failed"
      });
      return false;
    }

    console.info("[kitchen][cook-finalize] final save persisted", {
      dayKey,
      reason,
      previousPersistedCookUserId,
      finalCookUserId,
      pushStatus: finalCookUserId ? "eligible" : "skipped-no-cook"
    });
    clearCookDraftState(dayKey);
    return true;
  };

  const toggleSelfAttendance = async (day) => {
    const dayKey = day.date.slice(0, 10);
    setDayAttendanceBusy((prev) => ({ ...prev, [dayKey]: true }));
    setDayErrors((prev) => ({ ...prev, [dayKey]: "" }));
    try {
      const mealType = dayMealType(day);
      const data = await apiRequest(`/api/kitchen/weeks/${weekStartRef.current}/day/${dayKey}/toggle-attendance`, {
        method: "POST",
        body: JSON.stringify({ mealType })
      });
      setPlan(data?.plan || null);
    } catch (err) {
      setDayErrors((prev) => ({ ...prev, [dayKey]: err.message || "No se pudo actualizar asistencia." }));
    } finally {
      setDayAttendanceBusy((prev) => ({ ...prev, [dayKey]: false }));
    }
  };

  const removeDayAssignment = async (day) => {
    const dayKey = day.date.slice(0, 10);
    const result = await updateDay(day, {
      cookUserId: null,
      mainDishId: null,
      sideDishId: null,
      isLeftovers: false,
      leftoversSourceDate: null,
      leftoversSourceMealType: null,
      leftoversSourceDishId: null,
      ingredientOverrides: [],
      baseIngredientExclusions: [],
      removeDay: isOptionalWeekendDayKey(dayKey, weekStartRef.current)
    });
    if (result) {
      stopEditingDay(dayKey);
    }
    return result;
  };

  const loadLeftoverOptions = useCallback(async (day) => {
    const dayKey = day?.date?.slice?.(0, 10);
    if (!dayKey) return;
    setLeftoverLoadingByDay((prev) => ({ ...prev, [dayKey]: true }));
    try {
      const data = await apiRequest(
        `/api/kitchen/weeks/${weekStartRef.current}/day/${dayKey}/leftovers?mealType=dinner`
      );
      setLeftoverOptionsByDay((prev) => ({ ...prev, [dayKey]: data?.leftovers || [] }));
    } catch (err) {
      setLeftoverOptionsByDay((prev) => ({ ...prev, [dayKey]: [] }));
    } finally {
      setLeftoverLoadingByDay((prev) => ({ ...prev, [dayKey]: false }));
    }
  }, []);

  const openAttendeeDialog = (day, editable) => {
    const dayKey = day?.date?.slice?.(0, 10);
    if (!dayKey) return;
    setAttendeeDialogDay(dayKey);
    setAttendeeDialogEditable(Boolean(editable));
    setAttendeeDialogBusy(false);
    setAttendeeDialogError("");
    setAttendeeDraftIds(resolveDayAttendees(day, users));
  };

  const closeAttendeeDialog = () => {
    if (attendeeDialogBusy) return;
    setAttendeeDialogDay(null);
    setAttendeeDialogEditable(false);
    setAttendeeDraftIds([]);
    setAttendeeDialogError("");
  };

  const toggleAttendeeDraft = (memberId) => {
    const id = String(memberId || "");
    if (!id || !attendeeDialogEditable) return;
    setAttendeeDraftIds((prev) => (
      prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id]
    ));
  };

  const saveAttendeeDialog = async () => {
    if (!attendeeDialogDay || attendeeDialogBusy || !attendeeDialogEditable) return;
    const day = visibleDaysRef.current.find((entry) => entry?.date?.slice(0, 10) === attendeeDialogDay);
    if (!day) {
      closeAttendeeDialog();
      return;
    }
    setAttendeeDialogBusy(true);
    setAttendeeDialogError("");
    const result = await updateDay(day, { attendeeIds: attendeeDraftIds }, { returnErrorObject: true });
    setAttendeeDialogBusy(false);
    if (result?.error) {
      setAttendeeDialogError(result.error.message || "No se pudieron guardar los comensales.");
      return;
    }
    closeAttendeeDialog();
  };

  const buildMainDishUpdatePayload = (day, nextMainDishId) => {
    const currentMainDishId = day?.mainDishId ? String(day.mainDishId) : "";
    const nextMainDishKey = nextMainDishId ? String(nextMainDishId) : "";
    if (currentMainDishId !== nextMainDishKey) {
      return {
        mainDishId: nextMainDishId || null,
        baseIngredientExclusions: []
      };
    }
    return { mainDishId: nextMainDishId || null };
  };

  const closeDinnerShoppingChoiceDialog = useCallback(() => {
    if (shoppingChoiceResolverRef.current) {
      shoppingChoiceResolverRef.current(null);
      shoppingChoiceResolverRef.current = null;
    }
    setDinnerShoppingChoiceDialog(null);
  }, []);

  const resolveDinnerShoppingChoice = useCallback((includeIngredients) => {
    if (shoppingChoiceResolverRef.current) {
      shoppingChoiceResolverRef.current(Boolean(includeIngredients));
      shoppingChoiceResolverRef.current = null;
    }
    setDinnerShoppingChoiceDialog(null);
  }, []);

  const askDinnerShoppingChoice = useCallback(({ dayKey, dishName, target }) => {
    return new Promise((resolve) => {
      if (shoppingChoiceResolverRef.current) {
        shoppingChoiceResolverRef.current(null);
      }
      shoppingChoiceResolverRef.current = resolve;
      setDinnerShoppingChoiceDialog({
        dayKey,
        dishName: String(dishName || "").trim(),
        target: target === "side" ? "side" : "main"
      });
    });
  }, []);

  useEffect(() => {
    return () => {
      if (shoppingChoiceResolverRef.current) {
        shoppingChoiceResolverRef.current(null);
        shoppingChoiceResolverRef.current = null;
      }
    };
  }, []);

  const askDinnerInclusionIfNeeded = useCallback(async ({
    day,
    dayKey,
    dishId,
    dishName,
    target,
    forcePrompt = false
  }) => {
    if (dayMealType(day) !== "dinner") return { proceed: true, include: undefined };
    if (!dishId) return { proceed: true, include: false };
    const leftoversEnabled = Boolean(leftoversByDay?.[dayKey]?.enabled || day?.isLeftovers);
    if (leftoversEnabled && !forcePrompt) return { proceed: true, include: false };
    const choice = await askDinnerShoppingChoice({ dayKey, dishName, target });
    if (choice === null) return { proceed: false, include: undefined };
    return { proceed: true, include: Boolean(choice) };
  }, [askDinnerShoppingChoice, leftoversByDay]);

  const applyMainDishSelection = useCallback(async (day, nextMainDishId, nextMainDishName = "") => {
    const dayKey = day?.date?.slice?.(0, 10);
    if (!dayKey) return null;
    const payload = buildMainDishUpdatePayload(day, nextMainDishId);
    const currentMainDishId = day?.mainDishId ? String(day.mainDishId) : "";
    const nextMainDishKey = nextMainDishId ? String(nextMainDishId) : "";
    if (dayMealType(day) === "dinner") {
      if (currentMainDishId !== nextMainDishKey) {
        const choice = await askDinnerInclusionIfNeeded({
          day,
          dayKey,
          dishId: nextMainDishId,
          dishName: nextMainDishName,
          target: "main"
        });
        if (!choice.proceed) return null;
        payload.includeMainIngredients = choice.include ?? false;
      } else if (!nextMainDishKey) {
        payload.includeMainIngredients = false;
      }
    }
    return updateDay(day, payload);
  }, [askDinnerInclusionIfNeeded, updateDay]);

  const applySideDishSelection = useCallback(async (day, nextSideDishId, nextSideDishName = "") => {
    const dayKey = day?.date?.slice?.(0, 10);
    if (!dayKey) return null;
    const payload = { sideDishId: nextSideDishId || null };
    const currentSideDishId = day?.sideDishId ? String(day.sideDishId) : "";
    const nextSideDishKey = nextSideDishId ? String(nextSideDishId) : "";
    if (dayMealType(day) === "dinner") {
      if (currentSideDishId !== nextSideDishKey) {
        const choice = await askDinnerInclusionIfNeeded({
          day,
          dayKey,
          dishId: nextSideDishId,
          dishName: nextSideDishName,
          target: "side"
        });
        if (!choice.proceed) return null;
        payload.includeSideIngredients = choice.include ?? false;
      } else if (!nextSideDishKey) {
        payload.includeSideIngredients = false;
      }
    }
    return updateDay(day, payload);
  }, [askDinnerInclusionIfNeeded, updateDay]);

  const requestRemoveDayAssignment = (day) => {
    const dayKey = day?.date?.slice(0, 10);
    if (!dayKey) return;
    setDeleteDialogDay(dayKey);
  };

  const closeDeleteDialog = () => {
    if (deleteBusy) return;
    setDeleteDialogDay(null);
  };

  const confirmRemoveDayAssignment = async () => {
    if (!deleteDialogDay || deleteBusy) return;
    const day = visibleDaysRef.current.find((entry) => entry?.date?.slice(0, 10) === deleteDialogDay);
    if (!day) {
      closeDeleteDialog();
      return;
    }
    setDeleteBusy(true);
    try {
      const result = await removeDayAssignment(day);
      if (result) {
        setDeleteDialogDay(null);
      }
    } finally {
      setDeleteBusy(false);
    }
  };

  const moveDayAssignment = async (day, targetDate) => {
    const dayKey = day.date.slice(0, 10);
    if (!targetDate || targetDate === dayKey) return null;

    setDayErrors((prev) => ({ ...prev, [dayKey]: "" }));
    setDayStatus((prev) => ({ ...prev, [dayKey]: "saving" }));
    try {
      const mealType = dayMealType(day);
      const data = await apiRequest(`/api/kitchen/weeks/${weekStart}/day/${dayKey}/move?mealType=${mealType}`, {
        method: "POST",
        body: JSON.stringify({ targetDate, mealType })
      });
      setPlan(data.plan);
      setDayStatus((prev) => ({ ...prev, [dayKey]: "saved" }));
      setMoveTargetByDay((prev) => ({ ...prev, [dayKey]: "" }));
      stopEditingDay(dayKey);
      const targetIndex = Array.isArray(data?.plan?.days)
        ? data.plan.days.findIndex((entry) => {
          const key = entry?.date?.slice?.(0, 10)
            || (entry?.date ? new Date(entry.date).toISOString().slice(0, 10) : "");
          return key === targetDate;
        })
        : -1;
      setSelectedDay(targetDate);
      if (targetIndex >= 0) {
        setActiveIndex(targetIndex);
      }
      window.requestAnimationFrame(() => {
        const carouselElement = carouselRef.current;
        if (carouselElement && targetIndex >= 0) {
          carouselElement.scrollTo({
            left: targetIndex * carouselElement.clientWidth,
            behavior: "smooth"
          });
        }
      });
      const targetDay = data?.plan?.days?.find((entry) => {
        const key = entry?.date?.slice?.(0, 10)
          || (entry?.date ? new Date(entry.date).toISOString().slice(0, 10) : "");
        return key === targetDate;
      });
      const targetCookId = targetDay?.cookUserId ? String(targetDay.cookUserId) : "";
      const currentUserId = String(userRef.current?.id || userRef.current?._id || "");
      const canEditTarget = isOwnerAdmin || (targetCookId && targetCookId === currentUserId);
      if (targetDay && canEditTarget) {
        startEditingDay(targetDay);
      }
      return data.plan;
    } catch (err) {
      const message = err.message || "No se pudo mover la asignación del día.";
      setDayErrors((prev) => ({ ...prev, [dayKey]: message }));
      setDayStatus((prev) => ({ ...prev, [dayKey]: "error" }));
      return null;
    }
  };

  const startSwapDialog = (day) => {
    const dayKey = day.date.slice(0, 10);
    setSwapDialogDay(dayKey);
    setSwapTargetDate("");
  };

  const closeSwapDialog = () => {
    if (swapBusy) return;
    setSwapDialogDay(null);
    setSwapTargetDate("");
  };

  const confirmSwapDay = async () => {
    if (!swapDialogDay || !swapTargetDate || swapBusy) return;
    const sourceDay = visibleDays.find((item) => item?.date?.slice(0, 10) === swapDialogDay);
    if (!sourceDay) {
      closeSwapDialog();
      return;
    }
    setSwapBusy(true);
    try {
      const result = await moveDayAssignment(sourceDay, swapTargetDate);
      if (result) closeSwapDialog();
    } finally {
      setSwapBusy(false);
    }
  };

  const requestMoveDayAssignment = (day) => {
    const dayKey = day?.date?.slice?.(0, 10);
    if (!dayKey) return;
    setMoveDialogDay(dayKey);
    setMoveDialogBusy(false);
    setMoveTargetByDay((prev) => ({ ...prev, [dayKey]: prev[dayKey] || "" }));
  };

  const closeMoveDialog = () => {
    if (moveDialogBusy) return;
    setMoveDialogDay(null);
  };

  const confirmMoveDialog = async () => {
    if (!moveDialogDay || moveDialogBusy) return;
    const sourceDay = visibleDays.find((item) => item?.date?.slice(0, 10) === moveDialogDay);
    const targetDate = moveTargetByDay[moveDialogDay] || "";
    if (!sourceDay || !targetDate) return;

    setMoveDialogBusy(true);
    try {
      const result = await moveDayAssignment(sourceDay, targetDate);
      if (result) {
        setMoveDialogDay(null);
      }
    } finally {
      setMoveDialogBusy(false);
    }
  };

  const renderAssigneePicker = (day, dayKey, cookUser) => (
    <div
      className="kitchen-assignee-picker"
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget)) {
          setAssigneeOpen((prev) => ({ ...prev, [dayKey]: false }));
        }
      }}
    >
      <button
        type="button"
        className="kitchen-assignee-button"
        onClick={() =>
          setAssigneeOpen((prev) => ({ ...prev, [dayKey]: !prev[dayKey] }))
        }
        aria-haspopup="listbox"
        aria-expanded={assigneeOpen[dayKey] ? "true" : "false"}
      >
        <span className="kitchen-assignee-name">
          {cookUser?.displayName || "Sin asignar"}
        </span>
      </button>
      {assigneeOpen[dayKey] ? (
        <div className="kitchen-suggestion-list is-scrollable kitchen-assignee-menu" role="listbox">
          <button
            className="kitchen-suggestion"
            type="button"
            onMouseDown={(event) => {
              event.preventDefault();
              setDraftCookUserByDay((prev) => ({ ...prev, [dayKey]: null }));
              setAssigneeOpen((prev) => ({ ...prev, [dayKey]: false }));
            }}
          >
            Yo ({user?.displayName || "mi usuario"})
          </button>
          {users.map((person) => {
            return (
              <button
              className="kitchen-suggestion is-assignee"
              key={person.id}
              type="button"
              onMouseDown={(event) => {
                event.preventDefault();
                setDraftCookUserByDay((prev) => ({ ...prev, [dayKey]: String(person.id) }));
                setAssigneeOpen((prev) => ({ ...prev, [dayKey]: false }));
              }}
            >
                <span className="kitchen-assignee-name">{person.displayName}</span>
              </button>
            );
          })}
        </div>
      ) : null}
    </div>
  );

  const startEditingDay = async (day, options = {}) => {
    const dayKey = day.date.slice(0, 10);
    const currentEditingDayKey = editingDayKeyRef.current;
    if (currentEditingDayKey && currentEditingDayKey !== dayKey) {
      const saved = await persistFinalCookAssignment(currentEditingDayKey, "day-change");
      if (!saved) return false;
    }
    const dishName = day.mainDishId ? dishMap.get(day.mainDishId)?.name : "";
    const sideDishName = day.sideDishId ? dishMap.get(day.sideDishId)?.name : "";
    const initialCookUserId = normalizeCookUserId(
      Object.prototype.hasOwnProperty.call(options, "initialCookUserId")
        ? options.initialCookUserId
        : day?.cookUserId
    );
    setSelectedDay(dayKey);
    setEditingDays({ [dayKey]: true });
    setDraftCookUserByDay((prev) => ({ ...prev, [dayKey]: initialCookUserId }));
    setPersistedCookUserByDay((prev) => ({ ...prev, [dayKey]: normalizeCookUserId(day?.cookUserId) }));
    setSideDishEnabled((prev) => ({ ...prev, [dayKey]: Boolean(day.sideDishId) }));
    setAddIngredientsOpen((prev) => ({ ...prev, [dayKey]: Boolean(day.ingredientOverrides?.length) }));
    setMainDishQueries((prev) => ({ ...prev, [dayKey]: dishName || "" }));
    setMainDishOpen((prev) => ({ ...prev, [dayKey]: false }));
    setSideDishQueries((prev) => ({ ...prev, [dayKey]: sideDishName || "" }));
    setSideDishOpen((prev) => ({ ...prev, [dayKey]: false }));
    const isDinnerDay = dayMealType(day) === "dinner";
    setLeftoversByDay((prev) => ({
      ...prev,
      [dayKey]: {
        enabled: isDinnerDay && Boolean(day?.isLeftovers),
        sourceKey: day?.leftoversSourceDate && day?.leftoversSourceDishId
          ? `${new Date(day.leftoversSourceDate).toISOString().slice(0, 10)}|${normalizeMealType(day.leftoversSourceMealType)}|${day.leftoversSourceDishId}`
          : ""
      }
    }));
    if (isDinnerDay) {
      void loadLeftoverOptions(day);
    }
    return true;
  };

  const stopEditingDay = async (dayKey, reason = "explicit-save") => {
    const saved = await persistFinalCookAssignment(dayKey, reason);
    if (!saved) return false;
    setEditingDays({});
    setMainDishOpen((prev) => ({ ...prev, [dayKey]: false }));
    setSideDishOpen((prev) => ({ ...prev, [dayKey]: false }));
    setAddIngredientsOpen((prev) => ({ ...prev, [dayKey]: false }));
    return true;
  };

  const focusMainDish = (dayKey) => {
    window.requestAnimationFrame(() => {
      const node = mainDishRefs.current.get(dayKey);
      if (node) {
        node.focus();
      }
    });
  };

  const focusSideDish = (dayKey) => {
    window.requestAnimationFrame(() => {
      const node = sideDishRefs.current.get(dayKey);
      if (node) {
        node.focus();
      }
    });
  };

  const openDayEditor = useCallback(
    (targetDate, plateId) => {
      if (!targetDate || !visibleDays.length) return false;
      const targetDay = visibleDays.find((day) => day.date?.slice(0, 10) === targetDate);
      if (!targetDay) return false;

      const targetIndex = visibleDays.findIndex((day) => day.date?.slice(0, 10) === targetDate);
      setSelectedDay(targetDate);
      if (targetIndex >= 0) {
        setActiveIndex(targetIndex);
      }

      startEditingDay(targetDay);

      if (plateId) {
        const allDishes = [...dishes, ...sideDishes];
        const targetDish = allDishes.find((dish) => dish._id === plateId);
        if (targetDish?.sidedish) {
          setSideDishEnabled((prev) => ({ ...prev, [targetDate]: true }));
          setSideDishQueries((prev) => ({ ...prev, [targetDate]: targetDish.name }));
          applySideDishSelection(targetDay, targetDish._id, targetDish.name);
          focusSideDish(targetDate);
        } else if (targetDish) {
          setMainDishQueries((prev) => ({ ...prev, [targetDate]: targetDish.name }));
          applyMainDishSelection(targetDay, targetDish._id, targetDish.name);
          focusMainDish(targetDate);
        }
      }

      window.requestAnimationFrame(() => {
        const carouselElement = carouselRef.current;
        const dayNode =
          dayRefs.current.get(targetDate) || document.getElementById(`daycard-${targetDate}`);
        const canCarousel =
          carouselElement && carouselElement.scrollWidth > carouselElement.clientWidth + 1;

        if (canCarousel && targetIndex >= 0) {
          carouselElement.scrollTo({
            left: targetIndex * carouselElement.clientWidth,
            behavior: "smooth"
          });
        } else if (dayNode) {
          dayNode.scrollIntoView({ behavior: "smooth", block: "start" });
        }
        dayNode?.focus?.({ preventScroll: true });
      });

      return true;
    },
    [
      applyMainDishSelection,
      applySideDishSelection,
      dishes,
      focusMainDish,
      focusSideDish,
      visibleDays,
      sideDishes,
      startEditingDay
    ]
  );

  useEffect(() => {
    const assignPlateId = searchParams.get("assignPlateId") || searchParams.get("plateId");
    const assignDate = searchParams.get("date");
    const assignMealType = normalizeMealType(searchParams.get("mealType") || "lunch");
    if (!assignPlateId || !assignDate) return;

    const intentKey = `${assignPlateId}-${assignDate}-${assignMealType}`;
    if (assignIntentRef.current?.key === intentKey) {
      return;
    }

    assignIntentRef.current = {
      key: intentKey,
      handled: false,
      plateId: assignPlateId,
      date: assignDate,
      mealType: assignMealType
    };
    setMealTab(assignMealType);

    const targetWeekStart = getMondayISO(new Date(assignDate));
    if (weekStart !== targetWeekStart) {
      setWeekStart(targetWeekStart);
    }
  }, [searchParams, weekStart]);

  const clearAssignParams = useCallback(() => {
    const nextParams = new URLSearchParams(searchParams);
    nextParams.delete("assignPlateId");
    nextParams.delete("plateId");
    nextParams.delete("assign");
    nextParams.delete("date");
    nextParams.delete("mealType");
    setSearchParams(nextParams, { replace: true });
  }, [searchParams, setSearchParams]);

  useEffect(() => {
    const intent = assignIntentRef.current;
    if (!intent || intent.handled) return;
    if (loading || !plan || !visibleDays.length) return;

    const planWeekStart = plan?.weekStart
      ? getMondayISO(new Date(plan.weekStart))
      : null;
    if (planWeekStart && planWeekStart !== weekStart) return;

    const { date: assignDate, plateId: assignPlateId, key: intentKey, mealType: assignMealType } = intent;
    if (normalizeMealType(assignMealType) !== selectedMealType) return;
    const targetDay = visibleDays.find((day) => day.date?.slice(0, 10) === assignDate);
    if (!targetDay) {
      assignIntentRef.current = { key: intentKey, handled: true };
      clearAssignParams();
      return;
    }
    openDayEditor(assignDate, assignPlateId);

    assignIntentRef.current = { key: intentKey, handled: true };
    clearAssignParams();
  }, [
    clearAssignParams,
    loading,
    openDayEditor,
    plan,
    selectedMealType,
    visibleDays,
    weekStart
  ]);

  useEffect(() => {
    const hasAssignIntent = Boolean(searchParams.get("assignPlateId") || searchParams.get("plateId"));
    if (hasAssignIntent) return;

    const targetDate = String(searchParams.get("date") || "").trim();
    if (!targetDate) return;

    const parsedTargetDate = parseISODateInput(targetDate);
    if (!parsedTargetDate) return;

    const targetMealType = normalizeMealType(searchParams.get("mealType") || "lunch");
    if (targetMealType !== mealTab) {
      setMealTab(targetMealType);
    }

    const targetWeekStart = getMondayISO(parsedTargetDate);
    if (weekStart !== targetWeekStart) {
      setWeekStart(targetWeekStart);
      return;
    }

    const targetDayExists = visibleDays.some((day) => day?.date?.slice(0, 10) === targetDate);
    if (!targetDayExists) return;

    if (selectedDayRef.current !== targetDate) {
      setSelectedDay(targetDate);
    }

    requestAnimationFrame(() => {
      const target = dayRefs.current.get(targetDate) || document.getElementById(`daycard-${targetDate}`);
      target?.scrollIntoView?.({ behavior: "smooth", block: "nearest", inline: "start" });
      target?.focus?.({ preventScroll: true });
    });

    const nextParams = new URLSearchParams(searchParams);
    nextParams.delete("date");
    nextParams.delete("mealType");
    setSearchParams(nextParams, { replace: true });
  }, [mealTab, searchParams, setSearchParams, setWeekStart, visibleDays, weekStart]);

  const handleAssignCta = async (day, canEdit, isAssigned) => {
    const dayKey = day.date.slice(0, 10);
    if (canEdit) {
      if (!isAssigned && user) {
        const started = await startEditingDay(day, {
          initialCookUserId: user?.id || user?._id || null
        });
        if (started) {
          focusMainDish(dayKey);
        }
        return;
      }
      await startEditingDay(day);
      focusMainDish(dayKey);
      return;
    }
    if (!isAssigned && user) {
      const started = await startEditingDay(day, {
        initialCookUserId: user?.id || user?._id || null
      });
      if (started) {
        focusMainDish(dayKey);
      }
    }
  };

  const handleRandomAssignCta = async (day, canEdit, isAssigned) => {
    const dayKey = day.date.slice(0, 10);
    setDayErrors((prev) => ({ ...prev, [dayKey]: "" }));

    if (!dishesReadyForCurrentHousehold) {
      setDayErrors((prev) => ({
        ...prev,
        [dayKey]: "Estamos actualizando los platos del hogar. Intenta de nuevo en un momento."
      }));
      return;
    }

    const clickHouseholdId = getCurrentHouseholdId();
    const clickWeekStart = weekStartRef.current;
    const usedIds = new Set(
      (visibleDaysRef.current || [])
        .map((entry) => entry?.mainDishId)
        .filter(Boolean)
        .map((value) => String(value))
    );

    if (import.meta.env.DEV) {
      console.debug("[kitchen][random-dish] click", {
        householdIdAtClick: clickHouseholdId ? String(clickHouseholdId) : null,
        weekStartAtClick: clickWeekStart,
        day: dayKey,
        dishesTotal: (dishesRef.current || []).length,
        usedIdsCount: usedIds.size
      });
    }

    let targetDay = day;
    if (!isAssigned && userRef.current) {
      const started = await startEditingDay(day, {
        initialCookUserId: userRef.current?.id || userRef.current?._id || null
      });
      if (!started) return;
    } else if (!canEdit) {
      return;
    }

    const fetchRandomCandidate = async () => {
      const mealType = dayMealType(day);
      return apiRequest(`/api/kitchen/weeks/${clickWeekStart}/day/${dayKey}/random-main`, {
        method: "POST",
        body: JSON.stringify({ mealType })
      });
    };

    let randomResponse;
    try {
      randomResponse = await fetchRandomCandidate();
    } catch (err) {
      setDayErrors((prev) => ({
        ...prev,
        [dayKey]: err.message || "No se pudo seleccionar un plato aleatorio."
      }));
      return;
    }

    if (!randomResponse?.dish) {
      const reason = String(randomResponse?.reason || "");
      const message = reason === "all_used"
        ? "Esta semana ya se han usado todos los platos disponibles."
        : reason === "only_special"
          ? "No hay platos disponibles para randomizar (los platos especiales estan excluidos)."
          : "No hay platos disponibles en este hogar para asignar aleatoriamente.";
      setDayErrors((prev) => ({
        ...prev,
        [dayKey]: message
      }));
      return;
    }

    let randomDish = randomResponse.dish;
    if (import.meta.env.DEV) {
      console.debug("[kitchen][random-dish] selected", {
        householdIdAtClick: clickHouseholdId ? String(clickHouseholdId) : null,
        requestWeekStart: clickWeekStart,
        selectedDishId: String(randomDish._id),
        selectedDishHouseholdId: randomDish.householdId ? String(randomDish.householdId) : null
      });
    }

    const firstUpdatePayload = buildMainDishUpdatePayload(targetDay, randomDish._id);
    if (dayMealType(targetDay) === "dinner") {
      const shoppingChoice = await askDinnerInclusionIfNeeded({
        day: targetDay,
        dayKey,
        dishId: randomDish._id,
        dishName: randomDish.name,
        target: "main",
        forcePrompt: true
      });
      if (!shoppingChoice.proceed) return;
      firstUpdatePayload.includeMainIngredients = shoppingChoice.include ?? false;
    }
    let updateResult = await updateDay(
      targetDay,
      firstUpdatePayload,
      { weekStart: clickWeekStart, returnErrorObject: true }
    );

    const shouldRetry =
      !updateResult?.plan
      && String(updateResult?.error?.message || "")
        .toLowerCase()
        .includes("no pertenece a este hogar");

    if (shouldRetry) {
      if (import.meta.env.DEV) {
        console.debug("[kitchen][random-dish] retry-after-ownership-error", {
          error: String(updateResult?.error?.message || "")
        });
      }
      try {
        await refreshCurrentDishes();
        randomResponse = await fetchRandomCandidate();
        const retryDish = randomResponse?.dish || null;
        if (!retryDish?._id) {
          return;
        }
        const retryPayload = buildMainDishUpdatePayload(targetDay, retryDish._id);
        if (dayMealType(targetDay) === "dinner") {
          const shoppingChoice = await askDinnerInclusionIfNeeded({
            day: targetDay,
            dayKey,
            dishId: retryDish._id,
            dishName: retryDish.name,
            target: "main",
            forcePrompt: true
          });
          if (!shoppingChoice.proceed) return;
          retryPayload.includeMainIngredients = shoppingChoice.include ?? false;
        }
        updateResult = await updateDay(
          targetDay,
          retryPayload,
          { weekStart: clickWeekStart, returnErrorObject: true }
        );
        randomDish = retryDish;
      } catch (_err) {
        return;
      }
    }

    if (updateResult?.plan) {
      setMainDishQueries((prev) => ({ ...prev, [dayKey]: randomDish.name }));
      setMainDishOpen((prev) => ({ ...prev, [dayKey]: false }));
    }
  };

  const openDishModal = (dayKey, name, options = {}) => {
    const { mode = "main", sidedish = false, mealType = selectedMealType } = options;
    setDishModalDayKey(dayKey);
    setDishModalName(name);
    setDishModalMode(mode);
    setDishModalSidedish(sidedish);
    setDishModalMealType(normalizeMealType(mealType));
    setDishModalOpen(true);
  };

  const closeDishModal = () => {
    setDishModalOpen(false);
    setDishModalName("");
    setDishModalDayKey(null);
    setDishModalMode("main");
    setDishModalSidedish(false);
    setDishModalMealType("lunch");
  };

  const attendeeDialogMembers = useMemo(
    () => [...users].sort((a, b) => String(a?.displayName || "").localeCompare(String(b?.displayName || ""), "es")),
    [users]
  );
  const attendeeDialogSelectedMembers = useMemo(() => {
    if (!attendeeDialogDay) return [];
    const selectedSet = new Set(attendeeDraftIds.map((id) => String(id)));
    return attendeeDialogMembers.filter((member) => selectedSet.has(String(member.id)));
  }, [attendeeDialogDay, attendeeDialogMembers, attendeeDraftIds]);

  const handleDishSaved = async (dish) => {
    if (!dish) return;
    setDishes((prev) => {
      const exists = prev.some((item) => item._id === dish._id);
      if (exists) {
        return prev.map((item) => (item._id === dish._id ? dish : item));
      }
      return [dish, ...prev];
    });
    setSideDishes((prev) => {
      const isSide = Boolean(dish.sidedish);
      const exists = prev.some((item) => item._id === dish._id);
      if (!isSide) {
        return prev.filter((item) => item._id !== dish._id);
      }
      if (exists) {
        return prev.map((item) => (item._id === dish._id ? dish : item));
      }
      return [dish, ...prev];
    });
    if (dishModalDayKey) {
      const targetDay = visibleDays.find((day) => day.date?.slice(0, 10) === dishModalDayKey);
      if (targetDay) {
        if (dishModalMode === "side") {
          applySideDishSelection(targetDay, dish._id, dish.name);
          setSideDishEnabled((prev) => ({ ...prev, [dishModalDayKey]: true }));
          setSideDishQueries((prev) => ({ ...prev, [dishModalDayKey]: dish.name }));
          setSideDishOpen((prev) => ({ ...prev, [dishModalDayKey]: false }));
        } else {
          applyMainDishSelection(targetDay, dish._id, dish.name);
          setMainDishQueries((prev) => ({ ...prev, [dishModalDayKey]: dish.name }));
          setMainDishOpen((prev) => ({ ...prev, [dishModalDayKey]: false }));
        }
      }
    }
  };

  const handleCreatePlan = async () => {
    setCreatingPlan(true);
    setLoadError("");
    try {
      const data = await apiRequest(`/api/kitchen/weeks/${weekStart}`, {
        method: "POST"
      });
      setPlan(data.plan || null);
    } catch (err) {
      setLoadError(err.message || "No se pudo crear la planificación semanal.");
    } finally {
      setCreatingPlan(false);
    }
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

  const handleWeekShift = (days) => {
    setWeekStart((prev) => addDaysToISO(prev, days));
  };

  const handleJumpToCurrentPeriod = useCallback(() => {
    const todayKey = new Date().toISOString().slice(0, 10);
    const currentWeekStart = getMondayISO();
    pendingJumpToCurrentRef.current = true;
    setWeekStart(currentWeekStart);
    setSelectedDay(todayKey);
  }, [setWeekStart]);

  const handleOpenCurrentShoppingList = useCallback(() => {
    navigate("/kitchen/compra");
  }, [navigate]);

  const handleDismissMissingWeekPrompt = () => {
    dismissedMissingWeekPromptRef.current.add(weekStart);
    setMissingWeekPromptOpen(false);
  };

  const closeWeekendDialog = useCallback(() => {
    if (weekendBusy) return;
    setWeekendDialogOpen(false);
  }, [weekendBusy]);

  const focusWeekendDay = useCallback((targetDate, nextVisibleDays) => {
    if (!targetDate) return;
    const targetIndex = nextVisibleDays.findIndex((day) => day?.date?.slice(0, 10) === targetDate);
    setSelectedDay(targetDate);
    if (targetIndex >= 0) {
      setActiveIndex(targetIndex);
    }
    window.requestAnimationFrame(() => {
      const carouselElement = carouselRef.current;
      if (carouselElement && targetIndex >= 0) {
        carouselElement.scrollTo({
          left: targetIndex * carouselElement.clientWidth,
          behavior: "smooth"
        });
      }
      const dayElement = dayRefs.current.get(targetDate) || document.getElementById(`daycard-${targetDate}`);
      dayElement?.scrollIntoView({ behavior: "smooth", block: "nearest", inline: "start" });
      dayElement?.focus?.({ preventScroll: true });
    });
  }, []);

  const handleAddWeekendDays = useCallback(async (requestedDays) => {
    const normalizedDays = Array.isArray(requestedDays)
      ? requestedDays.filter((value) => value === "saturday" || value === "sunday")
      : [];
    if (!normalizedDays.length || weekendBusy) return;
    setWeekendBusy(true);
    setLoadError("");
    try {
      const data = await apiRequest(`/api/kitchen/weeks/${weekStart}/weekend`, {
        method: "POST",
        body: JSON.stringify({
          mealType: selectedMealType,
          days: normalizedDays
        })
      });
      const nextPlan = data?.plan || null;
      setPlan(nextPlan);
      setWeekendDialogOpen(false);
      const nextVisibleDays = Array.isArray(nextPlan?.days)
        ? nextPlan.days.filter((day) => dayMealType(day) === selectedMealType)
        : [];
      const createdDates = Array.isArray(data?.createdDates) ? data.createdDates : [];
      const fallbackDate = normalizedDays
        .map((dayName) => addDaysToISO(weekStart, OPTIONAL_WEEKEND_DAY_OFFSETS[dayName]))
        .find(Boolean);
      const targetDate = createdDates[0] || fallbackDate || "";
      const targetDay = nextVisibleDays.find((day) => day?.date?.slice(0, 10) === targetDate);
      focusWeekendDay(targetDate, nextVisibleDays);
      if (targetDay) {
        window.requestAnimationFrame(() => {
          startEditingDay(targetDay);
        });
      }
    } catch (err) {
      setLoadError(err.message || "No se pudo anadir el fin de semana.");
    } finally {
      setWeekendBusy(false);
    }
  }, [focusWeekendDay, selectedMealType, weekStart, weekendBusy]);

  if (loading) {
    return (
      <KitchenLayout>
        <div className="kitchen-card">Cargando semana...</div>
      </KitchenLayout>
    );
  }

  const handleSelectDay = async (dayKey) => {
    const currentEditingDayKey = editingDayKeyRef.current;
    if (currentEditingDayKey && currentEditingDayKey !== dayKey) {
      const saved = await stopEditingDay(currentEditingDayKey, "day-change");
      if (!saved) return;
    }
    setSelectedDay(dayKey);
    const target = dayRefs.current.get(dayKey) || document.getElementById(`daycard-${dayKey}`);
    if (target) {
      target.scrollIntoView({ behavior: "smooth", block: "nearest", inline: "start" });
      target.focus?.({ preventScroll: true });
    }
  };

  const handleCreateDishFromStrip = (dayKey) => {
    openDayEditor(dayKey);
  };

  const handleCarouselScroll = (direction) => {
    const element = carouselRef.current;
    if (!element) return;
    element.scrollBy({ left: direction * element.clientWidth, behavior: "smooth" });
  };

  if (isDiodGlobalMode) {
    return (
      <KitchenLayout>
        <div className="kitchen-card">
          <h3>Selecciona un hogar para ver la semana</h3>
          <p className="kitchen-muted">En modo global DIOD no mostramos planificación semanal ni asignaciones de hogar.</p>
        </div>
      </KitchenLayout>
    );
  }

  return (
    <KitchenLayout containerClassName={`kitchen-week-canvas ${selectedMealType === "dinner" ? "kitchen-dinner-canvas" : ""}`}>
      <div className="kitchen-week-controls">
        <WeekDaysStrip
          days={visibleDays}
          userMap={userMap}
          selectedDay={selectedDay}
          onSelectDay={handleSelectDay}
          onCreateDish={handleCreateDishFromStrip}
          weekendAction={{
            disabled: weekendOptionState.availableDays.length === 0,
            label: "FINDE",
            title: weekendOptionState.availableDays.length
              ? "Anadir sabado o domingo"
              : "Sabado y domingo ya estan anadidos en esta semana",
            ariaLabel: weekendOptionState.availableDays.length
              ? "Anadir fin de semana a esta semana visible"
              : "Fin de semana ya anadido para esta semana visible",
            onClick: () => setWeekendDialogOpen(true)
          }}
        />
        <div className="kitchen-week-mobile-frame">
          <section className="kitchen-week-header">
            <div className="kitchen-week-header-actions">
              <div className="kitchen-week-nav-row">
                <WeekNavigator
                  value={weekStart}
                  onChange={(nextValue) => setWeekStart(normalizeWeekStart(nextValue))}
                  onPrevious={() => handleWeekShift(-7)}
                  onNext={() => handleWeekShift(7)}
                />
                <button
                  type="button"
                  className="kitchen-week-now-button"
                  onClick={handleJumpToCurrentPeriod}
                  aria-label="Volver a hoy"
                  title="Volver a hoy"
                >
                  <TodayIcon className="kitchen-week-now-icon" />
                  <span>Hoy</span>
                </button>
              </div>
              {dinnersEnabled ? (
                <div className="kitchen-meal-tabs kitchen-meal-tabs-with-link" role="group" aria-label="Navegación semanal">
                  <button
                    type="button"
                    className={`kitchen-meal-tab ${selectedMealType === "lunch" ? "is-active" : ""}`}
                    aria-pressed={selectedMealType === "lunch"}
                    onClick={() => setMealTab("lunch")}
                  >
                    Comidas
                  </button>
                  <button
                    type="button"
                    className={`kitchen-meal-tab ${selectedMealType === "dinner" ? "is-active" : ""}`}
                    aria-pressed={selectedMealType === "dinner"}
                    onClick={() => setMealTab("dinner")}
                  >
                    Cenas
                  </button>
                  <button
                    type="button"
                    className="kitchen-meal-tab kitchen-meal-tab-link"
                    onClick={handleOpenCurrentShoppingList}
                  >
                    Compra
                  </button>
                </div>
              ) : null}
              {canShowWeekRandomize ? (
                <div className="kitchen-week-header-utility-row">
                  {canShowWeekRandomize ? (
                    <button
                      type="button"
                      className="kitchen-button secondary is-small kitchen-week-randomize-button"
                      onClick={() => setWeekRandomizeConfirmOpen(true)}
                      disabled={weekRandomizing || !dishesReadyForCurrentHousehold}
                      title={!dishesReadyForCurrentHousehold ? "Actualizando platos del hogar..." : "Randomizar libres"}
                    >
                      <DiceIcon /> Randomizar libres
                    </button>
                  ) : null}
                </div>
              ) : null}
              {weekNotice ? (
                <div className={`kitchen-alert ${weekNotice.type === "success" ? "success" : "error"}`}>
                  {weekNotice.message}
                </div>
              ) : null}
              {loadError ? <p className="kitchen-inline-error">{loadError}</p> : null}
            </div>
          </section>

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
              {!plan ? (
                <div className="kitchen-card kitchen-empty">
                  <h3>No hay planificación para esta semana</h3>
                  <p>La semana {formatDateLabel(weekStart)} todavía no tiene plan creado para tu hogar.</p>
                  <button
                    type="button"
                    className="kitchen-button"
                    onClick={handleCreatePlan}
                    disabled={creatingPlan}
                  >
                    {creatingPlan ? "Creando..." : "Crear planificación de esta semana"}
                  </button>
                </div>
              ) : null}
              {visibleDays.map((day, index) => {
                if (!day?.date) {
                  return (
                    <div key={`day-${index}`} className="kitchen-card kitchen-day-card">
                      <div className="kitchen-day-header">
                        <h3 className="kitchen-day-title">Día sin fecha</h3>
                        <p className="kitchen-muted">Falta la fecha de este día en la planificación.</p>
                      </div>
                    </div>
                  );
                }
                const dayKey = day.date.slice(0, 10);
                const formattedDayLabel = formatDateLabel(day.date);
                const [dayTitlePrimary, dayTitleSecondary] = formattedDayLabel.split(", ");
                const isEditing = Boolean(editingDays[dayKey]);
                const draftCookUserId = isEditing && Object.prototype.hasOwnProperty.call(draftCookUserByDay, dayKey)
                  ? normalizeCookUserId(draftCookUserByDay[dayKey])
                  : normalizeCookUserId(day.cookUserId);
                const effectiveCookUserId = draftCookUserId || null;
                const cookUser = effectiveCookUserId ? userMap.get(effectiveCookUserId) : null;
                const dayAttendeeIds = resolveDayAttendees(day, users, selectedMealType);
                const attendeeCount = dayAttendeeIds.length;
                const dayAttendeeNames = dayAttendeeIds
                  .map((id) => userMap.get(id)?.displayName)
                  .filter((name) => String(name || "").trim());
                const currentUserId = String(user?.id || user?._id || "");
                const isSelfAttending = Boolean(currentUserId) && dayAttendeeIds.includes(currentUserId);
                const cookColors = getUserColorById(cookUser?.colorId, effectiveCookUserId);
                const isAssigned = Boolean(effectiveCookUserId);
                const isPlanned = Boolean(day.mainDishId || day.isLeftovers);
                const isAssignedToSelf = effectiveCookUserId
                  && (String(effectiveCookUserId) === String(user?.id || "") || String(effectiveCookUserId) === String(user?._id || ""));
                const canEdit = isOwnerAdmin || isAssignedToSelf;
                const mainDish = day.mainDishId ? dishMap.get(day.mainDishId) : null;
                const sideDish = day.sideDishId ? dishMap.get(day.sideDishId) : null;
                const sideDishOn = Boolean(sideDishEnabled[dayKey]);
                const sideToggleId = `side-toggle-${dayKey}`;
                const isEmptyState = !isPlanned && !isEditing;
                const canShowAssignCta = !isPlanned && (canEdit || (!isAssigned && user));
                const randomDisabled = !dishesReadyForCurrentHousehold;
                const randomTitle = randomDisabled
                  ? "Actualizando platos del hogar..."
                  : "Asignar plato aleatorio";
                const dayVisual = DAY_CARD_STYLES[index % DAY_CARD_STYLES.length];
                const cardColors = isPlanned
                  ? (isAssigned && cookUser
                    ? cookColors
                    : { background: dayVisual.background, text: dayVisual.color })
                  : { background: "#ffffff", text: "var(--hf-text)" };
                const leftoversDishName = day?.leftoversSourceDishName
                  || (day?.leftoversSourceDishId ? dishMap.get(day.leftoversSourceDishId)?.name : "");
                const displayDishName = day?.isLeftovers
                  ? (leftoversDishName ? `Sobras - ${leftoversDishName}` : "Sobras")
                  : mainDish
                  ? `${mainDish?.name || ""}${sideDish?.name ? ` con ${sideDish.name}` : ""}`.trim()
                  : "";
                const canDeletePlanning = isOwnerAdmin || isAssignedToSelf;
                const baseIngredientExclusions = Array.isArray(day.baseIngredientExclusions)
                  ? day.baseIngredientExclusions.map((item) => normalizeExclusionKey(item))
                  : [];
                const baseExclusionSet = new Set(baseIngredientExclusions);
                const baseIngredientsRaw = mergeIngredientLists(
                  mainDish?.ingredients || [],
                  sideDish?.ingredients || []
                );
                const baseIngredients = baseIngredientsRaw.filter((item) => {
                  const canonicalKey = normalizeExclusionKey(item?.canonicalName);
                  const idKey = item?.ingredientId ? normalizeExclusionKey(item.ingredientId) : "";
                  return !baseExclusionSet.has(canonicalKey) && !baseExclusionSet.has(idKey);
                });
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
                const trimmedMainDishQuery = mainDishQuery.trim();
                const normalizedMainDishQuery = normalizeIngredientName(trimmedMainDishQuery);
                const mainDishTokens = normalizedMainDishQuery.split(" ").filter(Boolean);
                const filteredMainDishes = mainDishTokens.length
                  ? dishes.filter((dish) => {
                    const normalizedName = normalizeIngredientName(dish.name || "");
                    return mainDishTokens.every((token) => normalizedName.includes(token));
                  })
                  : [];
                const limitedMainDishes = filteredMainDishes.slice(0, MAX_DISH_RESULTS);
                const hasExactMainDishMatch = mainDishTokens.length
                  ? dishes.some(
                    (dish) => normalizeIngredientName(dish.name || "") === normalizedMainDishQuery
                  )
                  : false;
                const sideDishQuery = sideDishQueries[dayKey] ?? sideDish?.name ?? "";
                const trimmedSideDishQuery = sideDishQuery.trim();
                const normalizedSideDishQuery = normalizeIngredientName(trimmedSideDishQuery);
                const sideDishTokens = normalizedSideDishQuery.split(" ").filter(Boolean);
          const filteredSideDishes = sideDishTokens.length
            ? sideDishes.filter((dish) => {
              const normalizedName = normalizeIngredientName(dish.name || "");
              return sideDishTokens.every((token) => normalizedName.includes(token));
            })
            : [];
          const limitedSideDishes = filteredSideDishes.slice(0, MAX_DISH_RESULTS);
          const hasExactSideDishMatch = sideDishTokens.length
            ? sideDishes.some(
              (dish) => normalizeIngredientName(dish.name || "") === normalizedSideDishQuery
            )
            : false;
          const extrasOn = Boolean(extraIngredientsValue.length);
          const currentMealType = dayMealType(day);
          const leftoversState = leftoversByDay[dayKey] || { enabled: false, sourceKey: "" };
          const leftoversOptions = leftoverOptionsByDay[dayKey] || [];
          const leftoversLoading = Boolean(leftoverLoadingByDay[dayKey]);
          return (
            <div
              key={day.date}
              id={`daycard-${dayKey}`}
              style={{
                "--day-card-bg": cardColors.background,
                "--day-card-text": cardColors.text,
                "--day-card-highlight": cardColors.text
              }}
              className={`kitchen-card kitchen-day-card ${selectedDay === dayKey ? "is-selected" : ""} ${isEmptyState ? "is-empty" : ""} ${selectedMealType === "dinner" ? "is-dinner-mode" : ""}`}
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
                <div className="kitchen-day-header-row">
                  <div className="kitchen-day-header-main">
                    <h3 className="kitchen-day-title">
                      <span className="kitchen-day-title-primary">
                        {dayTitleSecondary ? `${dayTitlePrimary},` : formattedDayLabel}
                      </span>
                      {dayTitleSecondary ? (
                        <span className="kitchen-day-title-secondary">{dayTitleSecondary}</span>
                      ) : null}
                    </h3>
                    <div className="kitchen-day-subtitle-row">
                      <div className="kitchen-day-subtitle">
                        Comen {attendeeCount} {attendeeCount === 1 ? "persona" : "personas"}
                      </div>
                      <button
                        type="button"
                        className="kitchen-day-attendees-action"
                        onClick={() => openAttendeeDialog(day, canManageAttendees)}
                        aria-label={canManageAttendees ? "Editar comensales" : "Ver comensales"}
                        title={canManageAttendees ? "Editar comensales" : "Ver comensales"}
                      >
                        {canManageAttendees ? <EditIcon /> : <EyeIcon />}
                      </button>
                    </div>
                  </div>
                  <div className={`kitchen-day-cook-block ${isEditing && isOwnerAdmin ? "is-editing" : ""}`}>
                    {isEditing && isOwnerAdmin ? (
                      renderAssigneePicker(day, dayKey, cookUser)
                    ) : (
                      <span className="kitchen-day-cook-name">
                        {cookUser?.displayName || "Sin cocinar"}
                      </span>
                    )}
                  </div>
                </div>
                {!isEmptyState ? (
                  <>
                    <div className="kitchen-day-meta">
                      {showCookTiming ? (
                        <span>Cocina: {day.cookTiming === "same_day" ? "mismo día" : "día anterior"}</span>
                      ) : null}
                    </div>
                    <div className="kitchen-day-cta" />
                  </>
                ) : null}
              </div>

              {!isEditing ? (
                isEmptyState ? (
                  <div className="kitchen-day-empty">
                    <div className="kitchen-day-empty-spacer" aria-hidden="true" />
                    {canShowAssignCta ? (
                      <div className="kitchen-day-empty-actions">
                        <button
                          type="button"
                          className="kitchen-button kitchen-day-empty-button"
                          onClick={() => handleAssignCta(day, canEdit, isAssigned)}
                        >
                          Asignar plato
                        </button>
                        <button
                          type="button"
                          className="kitchen-button secondary kitchen-day-random-button"
                          onClick={() => handleRandomAssignCta(day, canEdit, isAssigned)}
                          disabled={randomDisabled}
                          aria-label="Asignar plato aleatorio"
                          title={randomTitle}
                        >
                          <DiceIcon />
                        </button>
                      </div>
                    ) : null}
                  </div>
                ) : (
                  <div className="kitchen-day-view">
                    <div className="kitchen-day-dish-row">
                      <div className="kitchen-day-dish-display">{displayDishName || "Sin plato"}</div>
                      {isPlanned ? (
                        <div className="kitchen-day-title-info-wrap">
                          <button
                            type="button"
                            className="kitchen-day-title-info-action"
                            onClick={() => setInfoOpenByDay((prev) => ({ ...prev, [dayKey]: !prev[dayKey] }))}
                            aria-label="Ver detalles del plato"
                            title="Detalles del plato"
                          >
                            <InfoIcon />
                          </button>
                          {infoOpenByDay[dayKey] ? (
                            <div className="kitchen-day-info-popover is-title" role="dialog" aria-label="Detalles del día">
                              <strong>Ingredientes</strong>
                              <ul>
                                {baseIngredients.length ? baseIngredients.map((item) => (
                                  <li key={item.ingredientId || item.canonicalName || item.displayName}>
                                    {item.displayName}
                                  </li>
                                )) : <li>Sin ingredientes base</li>}
                                {extraIngredients.length && extrasOn ? extraIngredients.map((item) => (
                                  <li key={`extra-${item.ingredientId || item.canonicalName || item.displayName}`}>
                                    + {item.displayName}
                                  </li>
                                )) : null}
                              </ul>
                              <strong>Comensales</strong>
                              <ul>
                                {dayAttendeeNames.length ? dayAttendeeNames.map((name, idx) => (
                                  <li key={`attendee-${idx}-${name}`}>{name}</li>
                                )) : <li>Sin comensales</li>}
                              </ul>
                            </div>
                          ) : null}
                        </div>
                      ) : null}
                    </div>
                    {!isPlanned && canShowAssignCta ? (
                      <div className="kitchen-day-assign-actions">
                        <button
                          type="button"
                          className="kitchen-button"
                          onClick={() => handleAssignCta(day, canEdit, isAssigned)}
                        >
                          Asignar plato
                        </button>
                          <button
                            type="button"
                            className="kitchen-button secondary kitchen-day-random-button"
                            onClick={() => handleRandomAssignCta(day, canEdit, isAssigned)}
                            disabled={randomDisabled}
                            aria-label="Asignar plato aleatorio"
                            title={randomTitle}
                          >
                            <DiceIcon />
                          </button>
                      </div>
                    ) : null}
                    {isPlanned ? (
                      <div className="kitchen-day-footer">
                        <label className={`kitchen-day-attendance-toggle ${dayAttendanceBusy[dayKey] ? "is-disabled" : ""}`}>
                          <input
                            type="checkbox"
                            checked={isSelfAttending}
                            disabled={dayAttendanceBusy[dayKey]}
                            onChange={() => toggleSelfAttendance(day)}
                          />
                          <span className="kitchen-day-attendance-toggle-track" aria-hidden="true">
                            <span className="kitchen-day-attendance-toggle-thumb" />
                          </span>
                          <span className="kitchen-day-attendance-toggle-label">
                            {dayAttendanceBusy[dayKey] ? "Actualizando..." : isSelfAttending ? "Como" : "No como"}
                          </span>
                        </label>
                        {canEdit ? (
                          <button
                            type="button"
                            className="kitchen-day-icon-action"
                            onClick={() => startEditingDay(day)}
                            aria-label="Editar día"
                            title="Editar"
                          >
                            <EditIcon />
                          </button>
                        ) : null}
                        {isOwnerAdmin ? (
                          <button
                            type="button"
                            className="kitchen-day-icon-action"
                            onClick={() => startSwapDialog(day)}
                            aria-label="Intercambiar día"
                            title="Intercambiar día"
                          >
                            <SwapIcon />
                          </button>
                        ) : null}
                        {canDeletePlanning ? (
                          <button
                            type="button"
                            className="kitchen-day-icon-action is-danger"
                            onClick={() => requestRemoveDayAssignment(day)}
                            aria-label="Eliminar plato de la planificación"
                            title="Eliminar plato de la planificación"
                          >
                            <TrashIcon />
                          </button>
                        ) : null}
                      </div>
                    ) : null}
                  </div>
                )
              ) : (
                <>
                  {currentMealType === "dinner" ? (
                    <div className="kitchen-field kitchen-toggle-field">
                      <div className="kitchen-toggle-row">
                        <span className="kitchen-label">Cenar sobras</span>
                        <label className="kitchen-toggle">
                          <input
                            type="checkbox"
                            className="kitchen-toggle-input"
                            checked={Boolean(leftoversState.enabled)}
                            onChange={async (event) => {
                              const enabled = event.target.checked;
                              setLeftoversByDay((prev) => ({
                                ...prev,
                                [dayKey]: { ...(prev[dayKey] || {}), enabled, sourceKey: enabled ? (prev[dayKey]?.sourceKey || "") : "" }
                              }));
                              if (enabled) {
                                await loadLeftoverOptions(day);
                                await updateDay(day, {
                                  isLeftovers: true,
                                  leftoversSourceDate: null,
                                  leftoversSourceMealType: null,
                                  leftoversSourceDishId: null,
                                  includeMainIngredients: false,
                                  includeSideIngredients: false
                                });
                              } else {
                                await updateDay(day, { isLeftovers: false });
                              }
                            }}
                          />
                          <span className="kitchen-toggle-track" />
                        </label>
                      </div>
                      <p className="kitchen-muted">Las sobras no anaden ingredientes a la compra.</p>
                    </div>
                  ) : null}
                  {currentMealType === "dinner" && leftoversState.enabled ? (
                    <label className="kitchen-field">
                      <span className="kitchen-label">Elegir sobras</span>
                      <select
                        className="kitchen-select"
                        value={leftoversState.sourceKey || ""}
                        onChange={async (event) => {
                          const sourceKey = event.target.value;
                          setLeftoversByDay((prev) => ({
                            ...prev,
                            [dayKey]: { ...(prev[dayKey] || {}), sourceKey }
                          }));
                          const [sourceDate, sourceMealType, sourceDishId] = String(sourceKey || "").split("|");
                          await updateDay(day, {
                            isLeftovers: true,
                            leftoversSourceDate: sourceDate || null,
                            leftoversSourceMealType: sourceMealType || null,
                            leftoversSourceDishId: sourceDishId || null,
                            includeMainIngredients: false,
                            includeSideIngredients: false
                          });
                        }}
                      >
                        <option value="">{leftoversLoading ? "Cargando sobras..." : "Seleccionar plato"}</option>
                        {leftoversOptions.map((item) => (
                          <option
                            key={`${item.date}-${item.mealType}-${item.mainDishId}`}
                            value={`${item.date}|${item.mealType}|${item.mainDishId}`}
                          >
                            {item.dishName}
                          </option>
                        ))}
                      </select>
                    </label>
                  ) : null}
                  {!(currentMealType === "dinner" && leftoversState.enabled) ? (
                    <label className="kitchen-field">
                      <span className="kitchen-label">Plato principal</span>
                      <div className="kitchen-edit-main-dish-row">
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
                        disabled={currentMealType === "dinner" && leftoversState.enabled}
                        onFocus={() => setMainDishOpen((prev) => ({ ...prev, [dayKey]: true }))}
                        onBlur={() => {
                          const trimmed = mainDishQuery.trim();
                          const normalized = normalizeIngredientName(trimmed);
                          const match = dishes.find(
                            (dish) => normalizeIngredientName(dish.name || "") === normalized
                          );
                          if (!trimmed) {
                            applyMainDishSelection(day, null, "");
                            setMainDishQueries((prev) => ({ ...prev, [dayKey]: "" }));
                          } else if (match) {
                            applyMainDishSelection(day, match._id, match.name);
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
                        <div className="kitchen-suggestion-list is-scrollable">
                          {mainDishTokens.length ? (
                            <>
                              <button
                                className="kitchen-suggestion"
                                type="button"
                                onMouseDown={(event) => {
                                  event.preventDefault();
                                  applyMainDishSelection(day, null, "");
                                  setMainDishQueries((prev) => ({ ...prev, [dayKey]: "" }));
                                  setMainDishOpen((prev) => ({ ...prev, [dayKey]: false }));
                                }}
                              >
                                Sin plato
                              </button>
                              {limitedMainDishes.length ? (
                                limitedMainDishes.map((dish) => (
                                  <button
                                    className="kitchen-suggestion"
                                    key={dish._id}
                                    type="button"
                                    onMouseDown={(event) => {
                                      event.preventDefault();
                                      applyMainDishSelection(day, dish._id, dish.name);
                                      setMainDishQueries((prev) => ({ ...prev, [dayKey]: dish.name }));
                                      setMainDishOpen((prev) => ({ ...prev, [dayKey]: false }));
                                    }}
                                  >
                                    <span className="kitchen-suggestion-name">{dish.name}</span>
                                  </button>
                                ))
                              ) : !hasExactMainDishMatch && trimmedMainDishQuery ? (
                                <button
                                  className="kitchen-suggestion is-create"
                                  type="button"
                                  onMouseDown={(event) => {
                                    event.preventDefault();
                                    setMainDishOpen((prev) => ({ ...prev, [dayKey]: false }));
                                    openDishModal(dayKey, trimmedMainDishQuery);
                                  }}
                                >
                                  Crear nuevo plato “{trimmedMainDishQuery}”
                                </button>
                              ) : (
                                <div className="kitchen-muted kitchen-suggestion-empty">Sin coincidencias.</div>
                              )}
                            </>
                          ) : (
                            <div className="kitchen-muted kitchen-suggestion-empty">
                              Escribe para buscar...
                            </div>
                          )}
                        </div>
                      ) : null}
                      </div>
                      <button
                        type="button"
                        className="kitchen-day-icon-action kitchen-day-edit-inline-action"
                        onClick={() => handleRandomAssignCta(day, canEdit, isAssigned)}
                        disabled={randomDisabled}
                        aria-label="Asignar plato aleatorio"
                        title={randomTitle}
                      >
                        <DiceIcon />
                      </button>
                      </div>
                    </label>
                  ) : null}

                  <div className="kitchen-field kitchen-toggle-field">
                    <div className="kitchen-toggle-row">
                      <span className="kitchen-label">Añadir guarnición</span>
                      <label className="kitchen-toggle" htmlFor={sideToggleId}>
                        <input
                          id={sideToggleId}
                          type="checkbox"
                          className="kitchen-toggle-input"
                          checked={sideDishOn}
                          onChange={(event) => {
                            const nextValue = event.target.checked;
                            setSideDishEnabled((prev) => ({ ...prev, [dayKey]: nextValue }));
                            if (!nextValue) {
                              applySideDishSelection(day, null, "");
                              setSideDishQueries((prev) => ({ ...prev, [dayKey]: "" }));
                              setSideDishOpen((prev) => ({ ...prev, [dayKey]: false }));
                            }
                          }}
                        />
                        <span className="kitchen-toggle-track" aria-hidden="true" />
                      </label>
                    </div>
                  </div>

                  {sideDishOn ? (
                    <label className="kitchen-field">
                      <span className="kitchen-label">Guarnición</span>
                      <div className="kitchen-ingredient-search">
                        <input
                          ref={(node) => {
                            if (!node) {
                              sideDishRefs.current.delete(dayKey);
                              return;
                            }
                            sideDishRefs.current.set(dayKey, node);
                          }}
                          className="kitchen-input"
                          value={sideDishQuery}
                          placeholder="Busca una guarnición…"
                          onFocus={() => setSideDishOpen((prev) => ({ ...prev, [dayKey]: true }))}
                          onBlur={() => {
                            if (sideDishPickingRef.current[dayKey]) {
                              sideDishPickingRef.current[dayKey] = false;
                              return;
                            }
                            const trimmed = sideDishQuery.trim();
                            const normalized = normalizeIngredientName(trimmed);
                            const match = sideDishes.find(
                              (dish) => normalizeIngredientName(dish.name || "") === normalized
                            );
                            if (!trimmed) {
                              applySideDishSelection(day, null, "");
                              setSideDishQueries((prev) => ({ ...prev, [dayKey]: "" }));
                            } else if (match) {
                              applySideDishSelection(day, match._id, match.name);
                              setSideDishQueries((prev) => ({ ...prev, [dayKey]: match.name }));
                            } else {
                              setSideDishQueries((prev) => ({
                                ...prev,
                                [dayKey]: sideDish?.name || ""
                              }));
                            }
                            setSideDishOpen((prev) => ({ ...prev, [dayKey]: false }));
                          }}
                          onChange={(event) => {
                            const value = event.target.value;
                            setSideDishQueries((prev) => ({ ...prev, [dayKey]: value }));
                            setSideDishOpen((prev) => ({ ...prev, [dayKey]: true }));
                          }}
                        />
                        {sideDishOpen[dayKey] ? (
                          <div className="kitchen-suggestion-list is-scrollable">
                            {sideDishTokens.length ? (
                              <>
                                <button
                                  className="kitchen-suggestion"
                                  type="button"
                                  onMouseDown={(event) => {
                                    event.preventDefault();
                                    sideDishPickingRef.current[dayKey] = true;
                                    applySideDishSelection(day, null, "");
                                    setSideDishQueries((prev) => ({ ...prev, [dayKey]: "" }));
                                    setSideDishOpen((prev) => ({ ...prev, [dayKey]: false }));
                                  }}
                                >
                                  Sin guarnición
                                </button>
                                {limitedSideDishes.length ? (
                                  limitedSideDishes.map((dish) => (
                                    <button
                                      className="kitchen-suggestion"
                                      key={dish._id}
                                      type="button"
                                      onMouseDown={(event) => {
                                        event.preventDefault();
                                        sideDishPickingRef.current[dayKey] = true;
                                        applySideDishSelection(day, dish._id, dish.name);
                                        setSideDishQueries((prev) => ({ ...prev, [dayKey]: dish.name }));
                                        setSideDishOpen((prev) => ({ ...prev, [dayKey]: false }));
                                      }}
                                    >
                                      <span className="kitchen-suggestion-name">{dish.name}</span>
                                    </button>
                                  ))
                                ) : !hasExactSideDishMatch && trimmedSideDishQuery ? (
                                  <button
                                    className="kitchen-suggestion is-create"
                                    type="button"
                                    onMouseDown={(event) => {
                                      event.preventDefault();
                                      sideDishPickingRef.current[dayKey] = true;
                                      setSideDishOpen((prev) => ({ ...prev, [dayKey]: false }));
                                      openDishModal(dayKey, trimmedSideDishQuery, {
                                        mode: "side",
                                        sidedish: true
                                      });
                                    }}
                                  >
                                    Crear guarnición “{trimmedSideDishQuery}”
                                  </button>
                                ) : (
                                  <div className="kitchen-muted kitchen-suggestion-empty">Sin coincidencias.</div>
                                )}
                              </>
                            ) : (
                              <div className="kitchen-muted kitchen-suggestion-empty">
                                Escribe para buscar...
                              </div>
                            )}
                          </div>
                        ) : null}
                      </div>
                    </label>
                  ) : null}

                  {!(currentMealType === "dinner" && leftoversState.enabled) ? (
                    <>
                  <div className="kitchen-day-ingredients">
                    <span className="kitchen-label">Ingredientes</span>
                    <div className="kitchen-day-ingredient-pills">
                      {baseIngredients.length || extraIngredientsValue.length ? (
                        <>
                          {baseIngredients.map((item) => (
                            <button
                              key={`base-${item.ingredientId || item.canonicalName || item.displayName}`}
                              type="button"
                              className="kitchen-ingredient-pill is-removable"
                              onClick={() => {
                                const canonicalKey = normalizeExclusionKey(item?.canonicalName);
                                const idKey = item?.ingredientId ? normalizeExclusionKey(item.ingredientId) : "";
                                const nextExclusions = Array.from(
                                  new Set([
                                    ...(Array.isArray(day.baseIngredientExclusions) ? day.baseIngredientExclusions : []),
                                    ...(canonicalKey ? [canonicalKey] : []),
                                    ...(idKey ? [idKey] : [])
                                  ].map((value) => normalizeExclusionKey(value)).filter(Boolean))
                                );
                                setPlan((prevPlan) => {
                                  if (!prevPlan?.days) return prevPlan;
                                  return {
                                    ...prevPlan,
                                    days: prevPlan.days.map((entry) => {
                                      const entryDayKey = entry?.date?.slice?.(0, 10)
                                        || (entry?.date ? new Date(entry.date).toISOString().slice(0, 10) : "");
                                      if (entryDayKey !== dayKey) return entry;
                                      return { ...entry, baseIngredientExclusions: nextExclusions };
                                    })
                                  };
                                });
                                updateDay(day, { baseIngredientExclusions: nextExclusions });
                              }}
                            >
                              {item.displayName}
                              <span aria-hidden="true">×</span>
                            </button>
                          ))}
                          {extraIngredientsValue.map((item) => (
                            <button
                              key={`extra-${item.ingredientId || item.canonicalName || item.displayName}`}
                              type="button"
                              className="kitchen-ingredient-pill is-extra is-removable"
                              onClick={() => {
                                const nextExtras = extraIngredientsValue.filter((entry) => {
                                  const left = String(entry.ingredientId || entry.canonicalName || entry.displayName);
                                  const right = String(item.ingredientId || item.canonicalName || item.displayName);
                                  return left !== right;
                                });
                                setExtraIngredientsByDay((prev) => ({ ...prev, [dayKey]: nextExtras }));
                                const overrides = nextExtras
                                  .map((entry) => ({
                                    displayName: entry.displayName,
                                    canonicalName: entry.canonicalName,
                                    ...(entry.ingredientId ? { ingredientId: entry.ingredientId } : {})
                                  }))
                                  .filter((entry) => entry.displayName && entry.canonicalName);
                                updateDay(day, { ingredientOverrides: overrides });
                              }}
                            >
                              {item.displayName}
                              <span aria-hidden="true">×</span>
                            </button>
                          ))}
                        </>
                      ) : (
                        <span className="kitchen-muted">Sin ingredientes.</span>
                      )}
                    </div>
                  </div>

                  {!addIngredientsOpen[dayKey] ? (
                    <button
                      type="button"
                      className="kitchen-link-add-ingredient"
                      onClick={() => setAddIngredientsOpen((prev) => ({ ...prev, [dayKey]: true }))}
                    >
                      + Añadir ingredientes
                    </button>
                  ) : (
                    <div className="kitchen-field kitchen-day-ingredients">
                      <IngredientPicker
                        value={extraIngredientsValue}
                        showChipList={false}
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
                  )}
                    </>
                  ) : null}

                  {false ? (
                  <div className="kitchen-actions">
                    {isOwnerAdmin ? (
                      <div className="kitchen-field">
                        <span className="kitchen-label">Persona asignada</span>
                        <div
                          className="kitchen-assignee-picker"
                          onBlur={(event) => {
                            if (!event.currentTarget.contains(event.relatedTarget)) {
                              setAssigneeOpen((prev) => ({ ...prev, [dayKey]: false }));
                            }
                          }}
                        >
                          <button
                            type="button"
                            className="kitchen-assignee-button"
                            onClick={() =>
                              setAssigneeOpen((prev) => ({ ...prev, [dayKey]: !prev[dayKey] }))
                            }
                            aria-haspopup="listbox"
                            aria-expanded={assigneeOpen[dayKey] ? "true" : "false"}
                          >
                            <span
                              className="kitchen-assignee-avatar"
                              style={{
                                background: cookColors.background,
                                color: cookColors.text
                              }}
                              aria-hidden="true"
                            >
                              {cookInitials || "+"}
                            </span>
                            <span className="kitchen-assignee-name">
                              {cookUser?.displayName || "Sin asignar"}
                            </span>
                          </button>
                          {assigneeOpen[dayKey] ? (
                            <div className="kitchen-suggestion-list is-scrollable" role="listbox">
                              <button
                                className="kitchen-suggestion"
                                type="button"
                                onMouseDown={(event) => {
                                  event.preventDefault();
                                  setDraftCookUserByDay((prev) => ({ ...prev, [dayKey]: null }));
                                  setAssigneeOpen((prev) => ({ ...prev, [dayKey]: false }));
                                }}
                              >
                                Yo ({user?.displayName || "mi usuario"})
                              </button>
                              {users.map((person) => {
                                const initials = getUserInitialsFromProfile(person.initials, person.id, person.displayName);
                                const colors = getUserColorById(person.colorId, person.id);
                                return (
                                  <button
                                  className="kitchen-suggestion is-assignee"
                                  key={person.id}
                                  type="button"
                                  onMouseDown={(event) => {
                                    event.preventDefault();
                                    setDraftCookUserByDay((prev) => ({ ...prev, [dayKey]: String(person.id) }));
                                    setAssigneeOpen((prev) => ({ ...prev, [dayKey]: false }));
                                  }}
                                >
                                    <span
                                      className="kitchen-assignee-avatar"
                                      style={{
                                        background: colors.background,
                                        color: colors.text
                                      }}
                                      aria-hidden="true"
                                    >
                                      {initials || "+"}
                                    </span>
                                    <span className="kitchen-assignee-name">{person.displayName}</span>
                                  </button>
                                );
                              })}
                            </div>
                          ) : null}
                        </div>
                      </div>
                    ) : null}
                    {isOwnerAdmin ? (
                      <>
                        <div className="kitchen-field">
                          <span className="kitchen-label">Mover a otro día</span>
                          <div className="kitchen-actions-inline">
                            <select
                              className="kitchen-select"
                              value={moveTargetByDay[dayKey] || ""}
                              onChange={(event) => {
                                setMoveTargetByDay((prev) => ({ ...prev, [dayKey]: event.target.value }));
                              }}
                            >
                              <option value="">Seleccionar día</option>
                              {visibleDays
                                .filter((item) => item?.date?.slice(0, 10) !== dayKey)
                                .map((item) => (
                                  <option key={item.date} value={item.date.slice(0, 10)}>
                                    {formatDateLabel(item.date)}
                                  </option>
                                ))}
                            </select>
                            <button
                              type="button"
                              className="kitchen-button secondary is-small"
                              onClick={() => moveDayAssignment(day, moveTargetByDay[dayKey])}
                              disabled={!moveTargetByDay[dayKey]}
                            >
                              Mover
                            </button>
                          </div>
                        </div>
                      </>
                    ) : null}
                  </div>
                  ) : null}
                  <div className="kitchen-day-edit-toolbar">
                    <button
                      type="button"
                      className="kitchen-day-icon-action"
                      onClick={() => stopEditingDay(dayKey)}
                      aria-label="Guardar edición"
                      title="Guardar"
                    >
                      <SaveIcon />
                    </button>
                    <button
                      type="button"
                      className="kitchen-day-icon-action"
                      onClick={() => stopEditingDay(dayKey)}
                      aria-label="Cancelar edición"
                      title="Cancelar"
                    >
                      <CloseIcon />
                    </button>
                    {isOwnerAdmin ? (
                      <button
                        type="button"
                        className="kitchen-day-icon-action"
                        onClick={() => requestMoveDayAssignment(day)}
                        aria-label="Mover a otro dÃ­a"
                        title="Mover a otro dÃ­a"
                      >
                        <SwapIcon />
                      </button>
                    ) : null}
                    {canDeletePlanning ? (
                      <button
                        type="button"
                        className="kitchen-day-icon-action is-danger"
                        onClick={() => requestRemoveDayAssignment(day)}
                        aria-label="Eliminar plato de la planificación"
                        title="Eliminar plato de la planificación"
                      >
                        <TrashIcon />
                      </button>
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
          {isOwnerAdmin ? (
            <div className="kitchen-week-delete-row">
              <button
                type="button"
                className="kitchen-button secondary is-small kitchen-week-delete-button"
                onClick={() => setWeekDeleteConfirmOpen(true)}
                disabled={weekDeleteBusy}
                title="Borrar la programacion visible de esta semana"
              >
                <TrashIcon /> Borrar semana
              </button>
            </div>
          ) : null}
        </div>
      </div>
      {attendeeDialogDay ? (
        <div className="kitchen-modal-backdrop" role="presentation">
          <div
            className="kitchen-modal kitchen-attendee-modal"
            role="dialog"
            aria-modal="true"
            aria-label={attendeeDialogEditable ? "Editar comensales" : "Quien come este dia"}
            onClick={(event) => event.stopPropagation()}
          >
            <div className="kitchen-modal-header kitchen-attendee-modal-header">
              <h3>{attendeeDialogEditable ? "Editar comensales" : "Quien come este dia"}</h3>
              <button
                type="button"
                className="kitchen-ui-sheet-close"
                onClick={closeAttendeeDialog}
                aria-label="Cerrar modal"
                title="Cerrar"
                disabled={attendeeDialogBusy}
              >
                <CloseIcon />
              </button>
            </div>
            {attendeeDialogError ? <p className="kitchen-inline-error">{attendeeDialogError}</p> : null}
            {attendeeDialogEditable ? (
              <div className="kitchen-attendee-list" role="list">
                {attendeeDialogMembers.map((member) => {
                  const memberId = String(member.id);
                  const checked = attendeeDraftIds.includes(memberId);
                  const initials = getUserInitialsFromProfile(member.initials, member.id, member.displayName);
                  const colors = getUserColorById(member.colorId, member.id);
                  return (
                    <label key={`attendee-option-${memberId}`} className="kitchen-attendee-row" role="listitem">
                      <span
                        className="kitchen-attendee-avatar"
                        style={{ background: colors.background, color: colors.text }}
                        aria-hidden="true"
                      >
                        {initials || "?"}
                      </span>
                      <span className="kitchen-attendee-name">{member.displayName || "Sin nombre"}</span>
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() => toggleAttendeeDraft(memberId)}
                        disabled={attendeeDialogBusy}
                        aria-label={`Incluir a ${member.displayName || "usuario"} como comensal`}
                      />
                    </label>
                  );
                })}
              </div>
            ) : (
              <div className="kitchen-attendee-list is-readonly" role="list">
                {attendeeDialogSelectedMembers.length ? attendeeDialogSelectedMembers.map((member) => {
                  const initials = getUserInitialsFromProfile(member.initials, member.id, member.displayName);
                  const colors = getUserColorById(member.colorId, member.id);
                  return (
                    <div key={`attendee-view-${member.id}`} className="kitchen-attendee-row" role="listitem">
                      <span
                        className="kitchen-attendee-avatar"
                        style={{ background: colors.background, color: colors.text }}
                        aria-hidden="true"
                      >
                        {initials || "?"}
                      </span>
                      <span className="kitchen-attendee-name">{member.displayName || "Sin nombre"}</span>
                    </div>
                  );
                }) : <p className="kitchen-muted">Sin comensales para este dia.</p>}
              </div>
            )}
            <div className="kitchen-modal-actions">
              <button
                type="button"
                className="kitchen-button secondary"
                onClick={closeAttendeeDialog}
                disabled={attendeeDialogBusy}
              >
                {attendeeDialogEditable ? "Cancelar" : "Cerrar"}
              </button>
              {attendeeDialogEditable ? (
                <button
                  type="button"
                  className="kitchen-button"
                  onClick={saveAttendeeDialog}
                  disabled={attendeeDialogBusy}
                >
                  {attendeeDialogBusy ? "Guardando..." : "Guardar"}
                </button>
              ) : null}
            </div>
          </div>
        </div>
      ) : null}
      {weekendDialogOpen ? (
        <div
          className="kitchen-modal-backdrop"
          role="presentation"
          onClick={closeWeekendDialog}
        >
          <div
            className="kitchen-modal kitchen-weekend-modal"
            role="dialog"
            aria-modal="true"
            aria-label="Anadir fin de semana"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="kitchen-modal-header">
              <h3>Anadir fin de semana</h3>
              <p className="kitchen-muted">
                Estos dias se anadiran a la semana visible y usaran la misma logica de planificacion.
              </p>
            </div>
            <div className="kitchen-modal-actions kitchen-weekend-modal-actions">
              {!weekendOptionState.hasSaturday ? (
                <button
                  type="button"
                  className="kitchen-button secondary"
                  onClick={() => handleAddWeekendDays(["saturday"])}
                  disabled={weekendBusy}
                >
                  {weekendBusy ? "Anadiendo..." : `Anadir ${formatWeekendOptionLabel("saturday")}`}
                </button>
              ) : null}
              {!weekendOptionState.hasSunday ? (
                <button
                  type="button"
                  className="kitchen-button secondary"
                  onClick={() => handleAddWeekendDays(["sunday"])}
                  disabled={weekendBusy}
                >
                  {weekendBusy ? "Anadiendo..." : `Anadir ${formatWeekendOptionLabel("sunday")}`}
                </button>
              ) : null}
              {weekendOptionState.availableDays.length === 2 ? (
                <button
                  type="button"
                  className="kitchen-button"
                  onClick={() => handleAddWeekendDays(["saturday", "sunday"])}
                  disabled={weekendBusy}
                >
                  {weekendBusy ? "Anadiendo..." : "Anadir ambos"}
                </button>
              ) : null}
            </div>
            <div className="kitchen-modal-actions">
              <button
                type="button"
                className="kitchen-button kitchen-button-ghost"
                onClick={closeWeekendDialog}
                disabled={weekendBusy}
              >
                Cerrar
              </button>
            </div>
          </div>
        </div>
      ) : null}
      {weekRandomizeConfirmOpen ? (
        <div
          className="kitchen-modal-backdrop"
          role="presentation"
          onClick={() => {
            if (weekRandomizing) return;
            setWeekRandomizeConfirmOpen(false);
          }}
        >
          <div
            className="kitchen-modal"
            role="dialog"
            aria-modal="true"
            aria-label="Randomizar libres"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="kitchen-modal-header">
              <h3>¿Quieres randomizar la semana?</h3>
              <p className="kitchen-muted">Se asignarán platos aleatorios sin repetir.</p>
            </div>
            <div className="kitchen-modal-actions">
              <button
                type="button"
                className="kitchen-button secondary"
                onClick={() => setWeekRandomizeConfirmOpen(false)}
                disabled={weekRandomizing}
              >
                Cancelar
              </button>
              <button
                type="button"
                className="kitchen-button"
                onClick={handleConfirmWeekRandomize}
                disabled={weekRandomizing}
              >
                {weekRandomizing ? "Randomizando..." : "Randomizar libres"}
              </button>
            </div>
          </div>
        </div>
      ) : null}
      {moveDialogDay ? (
        <div
          className="kitchen-modal-backdrop"
          role="presentation"
          onClick={closeMoveDialog}
        >
          <div
            className="kitchen-modal kitchen-move-day-modal"
            role="dialog"
            aria-modal="true"
            aria-label="Mover a otro dÃ­a"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="kitchen-modal-header">
              <h3>Mover a otro dÃ­a</h3>
              <p className="kitchen-muted">Se mantendrÃ¡ la misma planificaciÃ³n y solo cambiarÃ¡ el dÃ­a dentro de esta semana visible.</p>
            </div>
            <label className="kitchen-field">
              <span className="kitchen-label">Nuevo dÃ­a</span>
              <select
                className="kitchen-select"
                value={moveTargetByDay[moveDialogDay] || ""}
                onChange={(event) => {
                  setMoveTargetByDay((prev) => ({ ...prev, [moveDialogDay]: event.target.value }));
                }}
                disabled={moveDialogBusy}
              >
                <option value="">Seleccionar dÃ­a</option>
                {visibleDays
                  .filter((item) => item?.date?.slice(0, 10) !== moveDialogDay)
                  .map((item) => (
                    <option key={item.date} value={item.date.slice(0, 10)}>
                      {formatDateLabel(item.date)}
                    </option>
                  ))}
              </select>
            </label>
            <div className="kitchen-modal-actions">
              <button
                type="button"
                className="kitchen-button secondary"
                onClick={closeMoveDialog}
                disabled={moveDialogBusy}
              >
                Cancelar
              </button>
              <button
                type="button"
                className="kitchen-button"
                onClick={confirmMoveDialog}
                disabled={moveDialogBusy || !moveTargetByDay[moveDialogDay]}
              >
                {moveDialogBusy ? "Moviendo..." : "Mover"}
              </button>
            </div>
          </div>
        </div>
      ) : null}
      {weekDeleteConfirmOpen ? (
        <div
          className="kitchen-modal-backdrop"
          role="presentation"
          onClick={() => {
            if (weekDeleteBusy) return;
            setWeekDeleteConfirmOpen(false);
          }}
        >
          <div
            className="kitchen-modal kitchen-week-delete-modal"
            role="dialog"
            aria-modal="true"
            aria-label="Borrar programacion semanal"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="kitchen-modal-header">
              <h3>Borrar semana</h3>
              <p className="kitchen-muted">
                Se borrara toda la programacion visible de {selectedMealType === "dinner" ? "cenas" : "comidas"} para esta semana.
                Los dias base de lunes a viernes seguiran visibles vacios y el FINDE opcional se eliminara si existe.
              </p>
            </div>
            <div className="kitchen-modal-actions">
              <button
                type="button"
                className="kitchen-button secondary"
                onClick={() => setWeekDeleteConfirmOpen(false)}
                disabled={weekDeleteBusy}
              >
                Cancelar
              </button>
              <button
                type="button"
                className="kitchen-button kitchen-week-delete-confirm"
                onClick={handleConfirmWeekDelete}
                disabled={weekDeleteBusy}
              >
                {weekDeleteBusy ? "Borrando..." : "Borrar semana"}
              </button>
            </div>
          </div>
        </div>
      ) : null}
      {dinnerShoppingChoiceDialog ? (
        <div className="kitchen-modal-backdrop" role="presentation">
          <div
            className="kitchen-modal"
            role="dialog"
            aria-modal="true"
            aria-label="Confirmar ingredientes para cena"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="kitchen-modal-header">
              <h3>¿Añadir ingredientes a la lista de la compra?</h3>
              <p className="kitchen-muted">
                {dinnerShoppingChoiceDialog.target === "side"
                  ? `Guarnición: ${dinnerShoppingChoiceDialog.dishName || "seleccionada"}`
                  : `Plato principal: ${dinnerShoppingChoiceDialog.dishName || "seleccionado"}`}
              </p>
            </div>
            <div className="kitchen-modal-actions">
              <button
                type="button"
                className="kitchen-button secondary"
                onClick={() => resolveDinnerShoppingChoice(false)}
              >
                No, ya los tengo
              </button>
              <button
                type="button"
                className="kitchen-button"
                onClick={() => resolveDinnerShoppingChoice(true)}
              >
                Sí, añadir
              </button>
            </div>
            <div className="kitchen-modal-actions">
              <button
                type="button"
                className="kitchen-button kitchen-button-ghost"
                onClick={closeDinnerShoppingChoiceDialog}
              >
                Cancelar
              </button>
            </div>
          </div>
        </div>
      ) : null}
      {swapDialogDay ? (
        <div className="kitchen-modal-backdrop" role="presentation" onClick={closeSwapDialog}>
          <div
            className="kitchen-modal"
            role="dialog"
            aria-modal="true"
            aria-label="Intercambiar planificación de día"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="kitchen-modal-header">
              <h3>Intercambiar día</h3>
              <p className="kitchen-muted">Selecciona con qué día de la misma semana quieres intercambiar.</p>
            </div>
            <div className="kitchen-field">
              <select
                className="kitchen-select"
                value={swapTargetDate}
                onChange={(event) => setSwapTargetDate(event.target.value)}
                disabled={swapBusy}
              >
                <option value="">Seleccionar día</option>
                {visibleDays
                  .filter((item) => item?.date?.slice(0, 10) !== swapDialogDay)
                  .map((item) => (
                    <option key={item.date} value={item.date.slice(0, 10)}>
                      {formatDateLabel(item.date)}
                    </option>
                  ))}
              </select>
            </div>
            <div className="kitchen-modal-actions">
              <button
                type="button"
                className="kitchen-button secondary"
                onClick={closeSwapDialog}
                disabled={swapBusy}
              >
                Cancelar
              </button>
              <button
                type="button"
                className="kitchen-button"
                onClick={confirmSwapDay}
                disabled={swapBusy || !swapTargetDate}
              >
                {swapBusy ? "Intercambiando..." : "Intercambiar"}
              </button>
            </div>
          </div>
        </div>
      ) : null}
      {deleteDialogDay ? (
        <div className="kitchen-modal-backdrop" role="presentation">
          <div
            className="kitchen-modal"
            role="dialog"
            aria-modal="true"
            aria-label={isOptionalWeekendDayKey(deleteDialogDay, weekStart) ? "Eliminar dia opcional" : "Eliminar plato de la planificación"}
            onClick={(event) => event.stopPropagation()}
          >
            <div className="kitchen-modal-header">
              <h3>{isOptionalWeekendDayKey(deleteDialogDay, weekStart) ? "Eliminar dia opcional" : "Eliminar plato de la planificación"}</h3>
              <p className="kitchen-muted">
                {isOptionalWeekendDayKey(deleteDialogDay, weekStart)
                  ? "Este dia es opcional. Se eliminara del WeekNavigator y de la semana visible, y podras volver a anadirlo despues desde FINDE."
                  : "Esta acción quitará el plato del día y lo dejará vacío."}
              </p>
            </div>
            <div className="kitchen-modal-actions">
              <button
                type="button"
                className="kitchen-button secondary"
                onClick={closeDeleteDialog}
                disabled={deleteBusy}
              >
                Cancelar
              </button>
              <button
                type="button"
                className={`kitchen-button ${isOptionalWeekendDayKey(deleteDialogDay, weekStart) ? "danger" : ""}`}
                onClick={confirmRemoveDayAssignment}
                disabled={deleteBusy}
              >
                {deleteBusy
                  ? "Eliminando..."
                  : isOptionalWeekendDayKey(deleteDialogDay, weekStart)
                    ? "Eliminar dia"
                    : "Eliminar"}
              </button>
            </div>
          </div>
        </div>
      ) : null}
      {missingWeekPromptOpen && !plan ? (
        <div
          className="kitchen-modal-backdrop"
          role="presentation"
          onClick={handleDismissMissingWeekPrompt}
        >
          <div
            className="kitchen-modal"
            role="dialog"
            aria-modal="true"
            aria-label="Crear planificación semanal"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="kitchen-modal-header">
              <h3>No existe planificación para esta semana</h3>
              <p className="kitchen-muted">
                Semana de {formatDateLabel(weekStart)}. ¿Quieres crearla ahora?
              </p>
            </div>
            <div className="kitchen-modal-actions">
              <button type="button" className="kitchen-button kitchen-button-ghost" onClick={handleDismissMissingWeekPrompt}>
                Cancelar
              </button>
              <button
                type="button"
                className="kitchen-button"
                onClick={handleCreatePlan}
                disabled={creatingPlan}
              >
                {creatingPlan ? "Creando..." : "Crear"}
              </button>
            </div>
          </div>
        </div>
      ) : null}
      <DishModal
        isOpen={dishModalOpen}
        onClose={closeDishModal}
        onSaved={handleDishSaved}
        categories={categories}
        dishCategories={dishCategories}
        onCategoryCreated={handleCategoryCreated}
        initialName={dishModalName}
        initialSidedish={dishModalSidedish}
        initialIsDinner={dishModalMealType === "dinner"}
      />
    </KitchenLayout>
  );
}

