import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
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

const MAX_DISH_RESULTS = 8;

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

function resolveDayAttendees(day, users = []) {
  if (Array.isArray(day?.attendeeIds)) return day.attendeeIds.map((item) => String(item));
  return users.filter((member) => isActiveMember(member)).map((member) => String(member.id));
}

export default function WeekPage() {
  const { user } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();
  const { activeWeek: weekStart, setActiveWeek: setWeekStart } = useActiveWeek();
  const [plan, setPlan] = useState(null);
  const [dishes, setDishes] = useState([]);
  const [sideDishes, setSideDishes] = useState([]);
  const [users, setUsers] = useState([]);
  const [categories, setCategories] = useState([]);
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
  const [sideDishEnabled, setSideDishEnabled] = useState({});
  const [showCarouselControls, setShowCarouselControls] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const [mainDishQueries, setMainDishQueries] = useState({});
  const [mainDishOpen, setMainDishOpen] = useState({});
  const [sideDishQueries, setSideDishQueries] = useState({});
  const [sideDishOpen, setSideDishOpen] = useState({});
  const [assigneeOpen, setAssigneeOpen] = useState({});
  const [moveTargetByDay, setMoveTargetByDay] = useState({});
  const [infoOpenByDay, setInfoOpenByDay] = useState({});
  const [swapDialogDay, setSwapDialogDay] = useState(null);
  const [swapTargetDate, setSwapTargetDate] = useState("");
  const [swapBusy, setSwapBusy] = useState(false);
  const [deleteDialogDay, setDeleteDialogDay] = useState(null);
  const [deleteBusy, setDeleteBusy] = useState(false);
  const [dishModalOpen, setDishModalOpen] = useState(false);
  const [dishModalName, setDishModalName] = useState("");
  const [dishModalDayKey, setDishModalDayKey] = useState(null);
  const [dishModalMode, setDishModalMode] = useState("main");
  const [dishModalSidedish, setDishModalSidedish] = useState(false);
  const [weekRandomizeConfirmOpen, setWeekRandomizeConfirmOpen] = useState(false);
  const [weekRandomizing, setWeekRandomizing] = useState(false);
  const ingredientCache = useRef(new Map());
  const saveTimers = useRef({});
  const carouselRef = useRef(null);
  const dayRefs = useRef(new Map());
  const mainDishRefs = useRef(new Map());
  const sideDishRefs = useRef(new Map());
  const sideDishPickingRef = useRef({});
  const selectedDayRef = useRef(selectedDay);
  const hasInitializedRef = useRef(false);
  const assignIntentRef = useRef(null);
  const dismissedMissingWeekPromptRef = useRef(new Set());
  const loadRequestSeqRef = useRef(0);
  const userRef = useRef(user);
  const weekStartRef = useRef(weekStart);
  const dishesRef = useRef(dishes);
  const safeDaysRef = useRef([]);
  const [missingWeekPromptOpen, setMissingWeekPromptOpen] = useState(false);
  const safeDays = useMemo(() => (Array.isArray(plan?.days) ? plan.days : []), [plan]);
  const isOwnerAdmin = user?.role === "owner" || user?.role === "admin";
  const isDiodGlobalMode = user?.globalRole === "diod" && !user?.activeHouseholdId;
  const hasAnyMainDishInWeek = safeDays.some((day) => Boolean(day?.mainDishId));
  const canShowWeekRandomize = Boolean(plan && safeDays.length && !hasAnyMainDishInWeek);
  const currentHouseholdId = user?.activeHouseholdId || user?.householdId || null;
  const currentHouseholdKey = currentHouseholdId ? String(currentHouseholdId) : "__no_household__";
  const dishesReadyForCurrentHousehold = !dishesLoading && dishesLoadedForHouseholdKey === currentHouseholdKey;

  const getCurrentHouseholdId = useCallback(() => {
    return userRef.current?.activeHouseholdId || userRef.current?.householdId || null;
  }, []);

  const refreshCurrentDishes = useCallback(async () => {
    const householdIdAtRequest = getCurrentHouseholdId();
    const householdKeyAtRequest = householdIdAtRequest ? String(householdIdAtRequest) : "__no_household__";
    setDishesLoading(true);
    try {
      const [dishesData, sideDishesData] = await Promise.all([
        apiRequest("/api/kitchen/dishes"),
        apiRequest("/api/kitchen/dishes?sidedish=true")
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
  }, [getCurrentHouseholdId]);

  const handleConfirmWeekRandomize = useCallback(async () => {
    setWeekRandomizing(true);
    setWeekNotice(null);
    try {
      const data = await apiRequest(`/api/kitchen/weeks/${weekStartRef.current}/randomize`, {
        method: "POST",
        body: JSON.stringify({ overwriteAll: false })
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
  }, []);

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
      const [planData, dishesData, sideDishesData] = await Promise.all([
        apiRequest(`/api/kitchen/weeks/${weekStart}`),
        apiRequest("/api/kitchen/dishes"),
        apiRequest("/api/kitchen/dishes?sidedish=true")
      ]);
      if (requestSeq !== loadRequestSeqRef.current) return;
      setPlan(planData.plan || null);
      if (!planData.plan && !dismissedMissingWeekPromptRef.current.has(weekStart)) {
        setMissingWeekPromptOpen(true);
      }
      setDishes(dishesData.dishes || []);
      setSideDishes(sideDishesData.dishes || []);
      setDishesLoadedForHouseholdKey(householdKeyAtRequest);
      const usersData = await apiRequest("/api/kitchen/users/members");
      if (requestSeq !== loadRequestSeqRef.current) return;
      setUsers(usersData.users || []);
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
  }, [user, weekStart, isOwnerAdmin, isDiodGlobalMode]);

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
    safeDaysRef.current = safeDays;
  }, [safeDays]);

  useEffect(() => {
    if (!weekNotice) return undefined;
    const timer = window.setTimeout(() => {
      setWeekNotice(null);
    }, 3200);
    return () => window.clearTimeout(timer);
  }, [weekNotice]);

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
    if (!safeDays.length) {
      return;
    }
    let active = true;
    const loadExtras = async () => {
      const resolved = await Promise.all(
        safeDays.map(async (day) => {
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
  }, [plan, resolveIngredients]);

  useEffect(() => {
    if (!safeDays.length) {
      return;
    }
    const todayKey = new Date().toISOString().slice(0, 10);
    const fallbackDay = safeDays[0]?.date?.slice(0, 10) || "";
    const todayIndex = safeDays.findIndex((day) => day.date?.slice(0, 10) === todayKey);
    const containsToday = todayIndex !== -1;

    if (!hasInitializedRef.current) {
      const nextDay = containsToday ? todayKey : fallbackDay;
      setSelectedDay(nextDay);
      const targetIndex = containsToday && todayIndex >= 0 ? todayIndex : 0;
      setActiveIndex(targetIndex);
      requestAnimationFrame(() => {
        const element = carouselRef.current;
        if (!element) return;
        element.scrollTo({ left: targetIndex * element.clientWidth, behavior: "auto" });
      });
      hasInitializedRef.current = true;
      return;
    }

    setSelectedDay((prev) => {
      if (prev && safeDays.some((day) => day.date?.slice(0, 10) === prev)) {
        return prev;
      }
      return fallbackDay;
    });
  }, [safeDays, weekStart]);

  useEffect(() => {
    selectedDayRef.current = selectedDay;
  }, [selectedDay]);

  const dayKeys = useMemo(
    () => safeDays.map((day) => day?.date?.slice(0, 10)).filter(Boolean),
    [safeDays]
  );
  const dishMap = useMemo(() => {
    const map = new Map();
    [...dishes, ...sideDishes].forEach((dish) => {
      if (dish?._id) map.set(dish._id, dish);
    });
    return map;
  }, [dishes, sideDishes]);
  const showCookTiming = useMemo(() => {
    if (!safeDays.length) {
      return false;
    }
    const [first] = safeDays;
    return safeDays.some((day) => day.cookTiming !== first.cookTiming);
  }, [safeDays]);

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

  const updateDay = async (day, updates, options = {}) => {
    const targetWeekStart = options.weekStart || weekStartRef.current;
    const dayKey = day.date.slice(0, 10);
    setDayErrors((prev) => ({ ...prev, [dayKey]: "" }));
    setDayStatus((prev) => ({ ...prev, [dayKey]: "saving" }));
    try {
      if (import.meta.env.DEV) {
        console.debug("[kitchen][update-day] request", {
          householdId: getCurrentHouseholdId() ? String(getCurrentHouseholdId()) : null,
          weekStart: targetWeekStart,
          day: day.date.slice(0, 10),
          mainDishId: updates?.mainDishId ? String(updates.mainDishId) : null
        });
      }
      const data = await apiRequest(`/api/kitchen/weeks/${targetWeekStart}/day/${day.date.slice(0, 10)}`, {
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

  const toggleSelfAttendance = async (day) => {
    const dayKey = day.date.slice(0, 10);
    setDayAttendanceBusy((prev) => ({ ...prev, [dayKey]: true }));
    setDayErrors((prev) => ({ ...prev, [dayKey]: "" }));
    try {
      const data = await apiRequest(`/api/kitchen/weeks/${weekStartRef.current}/day/${dayKey}/toggle-attendance`, {
        method: "POST"
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
      ingredientOverrides: [],
      baseIngredientExclusions: []
    });
    if (result) {
      stopEditingDay(dayKey);
    }
    return result;
  };

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
    const day = safeDaysRef.current.find((entry) => entry?.date?.slice(0, 10) === deleteDialogDay);
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
      const data = await apiRequest(`/api/kitchen/weeks/${weekStart}/day/${dayKey}/move`, {
        method: "POST",
        body: JSON.stringify({ targetDate })
      });
      setPlan(data.plan);
      setDayStatus((prev) => ({ ...prev, [dayKey]: "saved" }));
      setMoveTargetByDay((prev) => ({ ...prev, [dayKey]: "" }));
      stopEditingDay(dayKey);
      setSelectedDay(targetDate);
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
    const sourceDay = safeDays.find((item) => item?.date?.slice(0, 10) === swapDialogDay);
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

  const startEditingDay = (day) => {
    const dayKey = day.date.slice(0, 10);
    const dishName = day.mainDishId ? dishMap.get(day.mainDishId)?.name : "";
    const sideDishName = day.sideDishId ? dishMap.get(day.sideDishId)?.name : "";
    setSelectedDay(dayKey);
    setEditingDays({ [dayKey]: true });
    setSideDishEnabled((prev) => ({ ...prev, [dayKey]: Boolean(day.sideDishId) }));
    setAddIngredientsOpen((prev) => ({ ...prev, [dayKey]: Boolean(day.ingredientOverrides?.length) }));
    setMainDishQueries((prev) => ({ ...prev, [dayKey]: dishName || "" }));
    setMainDishOpen((prev) => ({ ...prev, [dayKey]: false }));
    setSideDishQueries((prev) => ({ ...prev, [dayKey]: sideDishName || "" }));
    setSideDishOpen((prev) => ({ ...prev, [dayKey]: false }));
  };

  const stopEditingDay = (dayKey) => {
    setEditingDays({});
    setMainDishOpen((prev) => ({ ...prev, [dayKey]: false }));
    setSideDishOpen((prev) => ({ ...prev, [dayKey]: false }));
    setAddIngredientsOpen((prev) => ({ ...prev, [dayKey]: false }));
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
      if (!targetDate || !safeDays.length) return false;
      const targetDay = safeDays.find((day) => day.date?.slice(0, 10) === targetDate);
      if (!targetDay) return false;

      const targetIndex = safeDays.findIndex((day) => day.date?.slice(0, 10) === targetDate);
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
          updateDay(targetDay, { sideDishId: targetDish._id });
          focusSideDish(targetDate);
        } else if (targetDish) {
          setMainDishQueries((prev) => ({ ...prev, [targetDate]: targetDish.name }));
          updateDay(targetDay, { mainDishId: targetDish._id, baseIngredientExclusions: [] });
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
      dishes,
      focusMainDish,
      focusSideDish,
      safeDays,
      sideDishes,
      startEditingDay,
      updateDay
    ]
  );

  useEffect(() => {
    const assignPlateId = searchParams.get("assignPlateId") || searchParams.get("plateId");
    const assignDate = searchParams.get("date");
    if (!assignPlateId || !assignDate) return;

    const intentKey = `${assignPlateId}-${assignDate}`;
    if (assignIntentRef.current?.key === intentKey) {
      return;
    }

    assignIntentRef.current = {
      key: intentKey,
      handled: false,
      plateId: assignPlateId,
      date: assignDate
    };

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
    setSearchParams(nextParams, { replace: true });
  }, [searchParams, setSearchParams]);

  useEffect(() => {
    const intent = assignIntentRef.current;
    if (!intent || intent.handled) return;
    if (loading || !plan || !safeDays.length) return;

    const planWeekStart = plan?.weekStart
      ? getMondayISO(new Date(plan.weekStart))
      : null;
    if (planWeekStart && planWeekStart !== weekStart) return;

    const { date: assignDate, plateId: assignPlateId, key: intentKey } = intent;
    const targetDay = safeDays.find((day) => day.date?.slice(0, 10) === assignDate);
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
    safeDays,
    weekStart
  ]);

  const handleAssignCta = async (day, canEdit, isAssigned) => {
    const dayKey = day.date.slice(0, 10);
    if (canEdit) {
      if (!isAssigned && user) {
        const updatedPlan = await onAssignSelf(day);
        if (updatedPlan) {
          startEditingDay(day);
          focusMainDish(dayKey);
        }
        return;
      }
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
      (safeDaysRef.current || [])
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
      const assignResult = await onAssignSelf(day, { weekStart: clickWeekStart, returnErrorObject: true });
      if (!assignResult?.plan) return;
      targetDay =
        assignResult.plan.days?.find((entry) => entry?.date?.slice(0, 10) === dayKey) || day;
    } else if (!canEdit) {
      return;
    }

    const fetchRandomCandidate = async () => {
      return apiRequest(`/api/kitchen/weeks/${clickWeekStart}/day/${dayKey}/random-main`, {
        method: "POST"
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

    let updateResult = await updateDay(
      targetDay,
      { mainDishId: randomDish._id, baseIngredientExclusions: [] },
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
        updateResult = await updateDay(
          targetDay,
          { mainDishId: retryDish._id, baseIngredientExclusions: [] },
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
    const { mode = "main", sidedish = false } = options;
    setDishModalDayKey(dayKey);
    setDishModalName(name);
    setDishModalMode(mode);
    setDishModalSidedish(sidedish);
    setDishModalOpen(true);
  };

  const closeDishModal = () => {
    setDishModalOpen(false);
    setDishModalName("");
    setDishModalDayKey(null);
    setDishModalMode("main");
    setDishModalSidedish(false);
  };

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
      const targetDay = safeDays.find((day) => day.date?.slice(0, 10) === dishModalDayKey);
      if (targetDay) {
        if (dishModalMode === "side") {
          updateDay(targetDay, { sideDishId: dish._id });
          setSideDishEnabled((prev) => ({ ...prev, [dishModalDayKey]: true }));
          setSideDishQueries((prev) => ({ ...prev, [dishModalDayKey]: dish.name }));
          setSideDishOpen((prev) => ({ ...prev, [dishModalDayKey]: false }));
        } else {
          updateDay(targetDay, { mainDishId: dish._id, baseIngredientExclusions: [] });
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

  const handleDismissMissingWeekPrompt = () => {
    dismissedMissingWeekPromptRef.current.add(weekStart);
    setMissingWeekPromptOpen(false);
  };

  if (loading) {
    return (
      <KitchenLayout>
        <div className="kitchen-card">Cargando semana...</div>
      </KitchenLayout>
    );
  }

  const handleSelectDay = (dayKey) => {
    setSelectedDay(dayKey);
    const target = dayRefs.current.get(dayKey) || document.getElementById(`daycard-${dayKey}`);
    if (target) {
      target.scrollIntoView({ behavior: "smooth", block: "nearest", inline: "start" });
      target.focus?.({ preventScroll: true });
    }
  };

  const handleCreateDishFromStrip = (dayKey) => {
    setSelectedDay(dayKey);
    openDishModal(dayKey, "", { mode: "main", sidedish: false });
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
    <KitchenLayout>
      <div className="kitchen-week-controls">
        <WeekDaysStrip
          days={safeDays}
          userMap={userMap}
          selectedDay={selectedDay}
          onSelectDay={handleSelectDay}
          onCreateDish={handleCreateDishFromStrip}
        />
        <div className="kitchen-week-mobile-frame">
          <section className="kitchen-week-header">
            <div className="kitchen-week-header-actions">
              <WeekNavigator
                value={weekStart}
                onChange={(nextValue) => setWeekStart(normalizeWeekStart(nextValue))}
                onPrevious={() => handleWeekShift(-7)}
                onNext={() => handleWeekShift(7)}
              />
              {canShowWeekRandomize ? (
                <button
                  type="button"
                  className="kitchen-button secondary is-small kitchen-week-randomize-button"
                  onClick={() => setWeekRandomizeConfirmOpen(true)}
                  disabled={weekRandomizing || !dishesReadyForCurrentHousehold}
                  title={!dishesReadyForCurrentHousehold ? "Actualizando platos del hogar..." : "Randomizar semana"}
                >
                  <DiceIcon /> Randomizar semana
                </button>
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
              {safeDays.map((day, index) => {
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
                const cookUser = day.cookUserId ? userMap.get(day.cookUserId) : null;
                const dayAttendeeIds = resolveDayAttendees(day, users);
                const attendeeCount = dayAttendeeIds.length;
                const dayAttendeeNames = dayAttendeeIds
                  .map((id) => userMap.get(id)?.displayName)
                  .filter((name) => String(name || "").trim());
                const currentUserId = String(user?.id || user?._id || "");
                const isSelfAttending = Boolean(currentUserId) && dayAttendeeIds.includes(currentUserId);
                const cookInitials = getUserInitialsFromProfile(cookUser?.initials, cookUser?.id, cookUser?.displayName);
                const cookColors = getUserColorById(cookUser?.colorId, day.cookUserId);
                const isAssigned = Boolean(day.cookUserId);
                const isPlanned = Boolean(day.mainDishId);
                const isAssignedToSelf = day.cookUserId
                  && (day.cookUserId === user?.id || day.cookUserId === user?._id);
                const canEdit = isOwnerAdmin || isAssignedToSelf;
                const isEditing = Boolean(editingDays[dayKey]);
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
                const cardColors = isAssigned && cookUser
                  ? cookColors
                  : { background: dayVisual.background, text: dayVisual.color };
                const displayDishName = mainDish
                  ? `${mainDish?.name || ""}${sideDish?.name ? ` con ${sideDish.name}` : ""}`.trim()
                  : "";
                const canDeletePlanning = isOwnerAdmin || isAssignedToSelf;
                const baseIngredientExclusions = Array.isArray(day.baseIngredientExclusions)
                  ? day.baseIngredientExclusions.map((item) => String(item))
                  : [];
                const baseExclusionSet = new Set(baseIngredientExclusions);
                const baseIngredientsRaw = mergeIngredientLists(
                  mainDish?.ingredients || [],
                  sideDish?.ingredients || []
                );
                const baseIngredients = baseIngredientsRaw.filter((item) => {
                  const canonicalKey = String(item?.canonicalName || "").trim();
                  const idKey = item?.ingredientId ? String(item.ingredientId) : "";
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
          return (
            <div
              key={day.date}
              id={`daycard-${dayKey}`}
              style={{
                "--day-card-bg": cardColors.background,
                "--day-card-text": cardColors.text,
                "--day-card-highlight": cardColors.text
              }}
              className={`kitchen-card kitchen-day-card ${selectedDay === dayKey ? "is-selected" : ""} ${isEmptyState ? "is-empty" : ""}`}
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
                  <h3 className="kitchen-day-title">{formatDateLabel(day.date)}</h3>
                  <div className="kitchen-day-cook-block">
                    <span className="kitchen-day-cook-name">
                      {cookUser?.displayName || "Sin cocinar"}
                    </span>
                  </div>
                </div>
                <div className="kitchen-day-subtitle">
                  Comen {attendeeCount} {attendeeCount === 1 ? "persona" : "personas"}
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
                          const normalized = normalizeIngredientName(trimmed);
                          const match = dishes.find(
                            (dish) => normalizeIngredientName(dish.name || "") === normalized
                          );
                          if (!trimmed) {
                            updateDay(day, { mainDishId: null, baseIngredientExclusions: [] });
                            setMainDishQueries((prev) => ({ ...prev, [dayKey]: "" }));
                          } else if (match) {
                            updateDay(day, { mainDishId: match._id, baseIngredientExclusions: [] });
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
                                  updateDay(day, { mainDishId: null, baseIngredientExclusions: [] });
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
                                      updateDay(day, { mainDishId: dish._id, baseIngredientExclusions: [] });
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
                  </label>

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
                              updateDay(day, { sideDishId: null });
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
                              updateDay(day, { sideDishId: null });
                              setSideDishQueries((prev) => ({ ...prev, [dayKey]: "" }));
                            } else if (match) {
                              updateDay(day, { sideDishId: match._id });
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
                                    updateDay(day, { sideDishId: null });
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
                                        updateDay(day, { sideDishId: dish._id });
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
                                const canonicalKey = String(item?.canonicalName || "").trim();
                                const idKey = item?.ingredientId ? String(item.ingredientId) : "";
                                const nextExclusions = Array.from(
                                  new Set([
                                    ...(Array.isArray(day.baseIngredientExclusions) ? day.baseIngredientExclusions : []),
                                    ...(canonicalKey ? [canonicalKey] : []),
                                    ...(idKey ? [idKey] : [])
                                  ].map((value) => String(value || "").trim()).filter(Boolean))
                                );
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
                                  updateDay(day, { cookUserId: null });
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
                                      updateDay(day, { cookUserId: person.id });
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
                              {safeDays
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
        </div>
      </div>
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
            aria-label="Randomizar semana"
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
                {weekRandomizing ? "Randomizando..." : "Randomizar"}
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
                {safeDays
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
            aria-label="Eliminar plato de la planificación"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="kitchen-modal-header">
              <h3>Eliminar plato de la planificación</h3>
              <p className="kitchen-muted">Esta acción quitará el plato del día y lo dejará vacío.</p>
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
                className="kitchen-button"
                onClick={confirmRemoveDayAssignment}
                disabled={deleteBusy}
              >
                {deleteBusy ? "Eliminando..." : "Eliminar"}
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
        onCategoryCreated={handleCategoryCreated}
        initialName={dishModalName}
        initialSidedish={dishModalSidedish}
      />
    </KitchenLayout>
  );
}


