import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Calendar, ChevronLeft, ChevronRight, Check, Plus } from "lucide-react";
import { UNSAFE_NavigationContext as NavigationContext, useLocation, useNavigate, useSearchParams } from "react-router-dom";
import KitchenLayout from "../Layout.jsx";
import { ApiRequestError, apiRequest } from "../api.js";
import { useAuth } from "../auth";
import ShareWhatsAppButton from "../components/ShareWhatsAppButton.jsx";
import { buildShoppingShareUrl, normalizeWeekParam } from "../deepLinks.js";
import { canUseBasicsFeature, isBudgetFeatureUnavailableError } from "../subscription.js";
import { useActiveWeek } from "../weekContext.jsx";
import ModalSheet from "../components/ui/ModalSheet.jsx";
import { useOnboarding } from "../contexts/OnboardingContext.jsx";
import { useWeeklyChallenge } from "../contexts/WeeklyChallengeContext.jsx";
import BasicsPopup from "../components/BasicsPopup.jsx";
import { burstParticles, triggerMilestone } from "../hooks/useRewardAnimation.js";

function RefreshIcon(props) {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true" {...props}>
      <path d="M20 12a8 8 0 1 1-2.343-5.657" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/>
      <path d="M20 4v4h-4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
  );
}

function TodayIcon(props) {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true" {...props}>
      <rect x="3" y="5" width="18" height="16" rx="2.5" stroke="currentColor" strokeWidth="1.7" />
      <path d="M3 10h18" stroke="currentColor" strokeWidth="1.7" />
      <path d="M8 3v4M16 3v4" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
      <rect x="9.5" y="12.5" width="5" height="4.5" rx="1" fill="currentColor" />
    </svg>
  );
}

function ConfirmIcon(props) {
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

function MinusIcon(props) {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true" {...props}>
      <path d="M6 12h12" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

function PlusIcon(props) {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true" {...props}>
      <path d="M12 6v12M6 12h12" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

function PencilIcon(props) {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true" {...props}>
      <path d="M4 20h3.5l10-10-3.5-3.5-10 10V20z" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" />
      <path d="M13.5 6.5l3.5 3.5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  );
}

function EmptyStateIcon(props) {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true" {...props}>
      <path d="M4 7.5h16" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
      <path d="M6.5 7.5V6a2 2 0 0 1 2-2h7a2 2 0 0 1 2 2v1.5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
      <path d="M7.5 10.5h9l-.75 7.1a2 2 0 0 1-1.99 1.8H10.24a2 2 0 0 1-1.99-1.8z" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" />
    </svg>
  );
}

function EmptyCheckIcon(props) {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true" {...props}>
      <path d="M7 12.5 10.5 16 17.5 9" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M12 21a9 9 0 1 0-9-9" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  );
}

function EmptyListIcon(props) {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true" {...props}>
      <path d="M8 7h10M8 12h10M8 17h10" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
      <circle cx="5" cy="7" r="1" fill="currentColor" />
      <circle cx="5" cy="12" r="1" fill="currentColor" />
      <circle cx="5" cy="17" r="1" fill="currentColor" />
    </svg>
  );
}

function EmptyHistoryIcon(props) {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true" {...props}>
      <path d="M12 7.5v5l3 1.8" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M3.8 12a8.2 8.2 0 1 0 2.4-5.8" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
      <path d="M3.5 5.7v2.9h2.9" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function DotsIcon(props) {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true" {...props}>
      <circle cx="5" cy="12" r="1.5" fill="currentColor" />
      <circle cx="12" cy="12" r="1.5" fill="currentColor" />
      <circle cx="19" cy="12" r="1.5" fill="currentColor" />
    </svg>
  );
}

function ChevronSmallIcon({ className, ...props }) {
  return (
    <svg viewBox="0 0 16 16" fill="none" aria-hidden="true" className={className} {...props}>
      <path d="m4 6 4 4 4-4" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function addDaysToISO(iso, days) {
  const date = new Date(`${iso}T00:00:00Z`);
  if (Number.isNaN(date.getTime())) return getCurrentWeekStart();
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function normalizeWeekStartInput(value) {
  if (!value) return "";
  const d = new Date(`${value}T00:00:00Z`);
  if (Number.isNaN(d.getTime())) return "";
  const day = d.getUTCDay();
  const diff = (day === 0 ? -6 : 1) - day;
  d.setUTCDate(d.getUTCDate() + diff);
  return d.toISOString().slice(0, 10);
}

function getCurrentWeekStart() {
  return normalizeWeekStartInput(new Date().toISOString().slice(0, 10));
}

function formatWeekTitle(iso) {
  if (!iso) return "";
  const date = new Date(`${iso}T00:00:00Z`);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleDateString("es-ES", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric"
  });
}

function formatTripDate(value) {
  if (!value || value === "sin-fecha") return "Sin fecha";
  const date = new Date(`${value}T00:00:00Z`);
  if (Number.isNaN(date.getTime())) return "Sin fecha";
  return date.toLocaleDateString("es-ES", { day: "2-digit", month: "2-digit", year: "numeric" });
}

function slugColor(slug = "") {
  const normalized = String(slug || "otros");
  const seed = normalized.split("").reduce((acc, char) => acc + char.charCodeAt(0), 0);
  const hue = seed % 360;
  return {
    colorBg: `hsl(${hue} 70% 95%)`,
    colorText: `hsl(${hue} 55% 35%)`
  };
}

function itemKey(item) {
  return item.itemId || `${item.ingredientId || "no-id"}-${item.canonicalName}`;
}

function normalizeQuery(value = "") {
  return String(value).trim().toLowerCase();
}

function formatWeekLabel(iso) {
  if (!iso) return "";
  const date = new Date(`${iso}T00:00:00Z`);
  if (Number.isNaN(date.getTime())) return "";
  return `Semana del ${date.toLocaleDateString("es-ES", { weekday: "long", day: "numeric", month: "long", timeZone: "UTC" })}`;
}

function formatWeekRange(iso) {
  if (!iso) return "";
  const start = new Date(`${iso}T00:00:00Z`);
  if (Number.isNaN(start.getTime())) return "";
  const end = new Date(start);
  end.setUTCDate(end.getUTCDate() + 6);
  const fmt = (d) => d.toLocaleDateString("es-ES", { day: "numeric", month: "short", timeZone: "UTC" });
  return `${fmt(start)} – ${fmt(end)}`;
}

function formatCurrency(value) {
  const amount = Number(value);
  if (!Number.isFinite(amount)) return "--";
  return amount.toLocaleString("es-ES", {
    style: "currency",
    currency: "EUR",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  });
}

function getPendingItemsCount(groups) {
  if (!Array.isArray(groups)) return 0;
  return groups.reduce((acc, group) => acc + (group.items?.length || 0), 0);
}

function isShoppingRoutePath(pathname = "") {
  return String(pathname || "").startsWith("/kitchen/compra");
}

function resolvePathnameFromTo(to, currentPathname = "") {
  if (typeof to === "string") {
    if (!to) return currentPathname;
    if (to.startsWith("?") || to.startsWith("#")) return currentPathname;
    const [pathPart] = to.split(/[?#]/);
    return pathPart || currentPathname;
  }
  if (to && typeof to === "object") {
    return to.pathname || currentPathname;
  }
  return currentPathname;
}

export default function ShoppingPage() {
  const { user } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();
  const location = useLocation();
  const navigate = useNavigate();
  const { notify: notifyOnboarding } = useOnboarding();
  const { notify: notifyWeekly } = useWeeklyChallenge();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { notifyOnboarding("visit_shopping"); }, []);
  const navigationContext = React.useContext(NavigationContext);
  const { activeWeek: weekStart, setActiveWeek: setWeekStart } = useActiveWeek();
  const [tab, setTab] = useState("pending");
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [stores, setStores] = useState([]);
  const [selectedStoreId, setSelectedStoreId] = useState("");
  const selectedStoreRef = useRef("");
  const [budget, setBudget] = useState(null);
  const [budgetFeatureEnabled, setBudgetFeatureEnabled] = useState(null);
  const [pendingByCategory, setPendingByCategory] = useState(null);
  const [purchasedByStoreDay, setPurchasedByStoreDay] = useState(null);
  const [pendingPurchaseSessions, setPendingPurchaseSessions] = useState([]);
  const [currentPurchaseSession, setCurrentPurchaseSession] = useState(null);
  const [transitioningItemKey, setTransitioningItemKey] = useState(null);
  const [recentlyMovedItemKey, setRecentlyMovedItemKey] = useState(null);
  const [leavePromptOpen, setLeavePromptOpen] = useState(false);
  const [purchaseConfirmOpen, setPurchaseConfirmOpen] = useState(false);
  const [purchaseConfirmBusy, setPurchaseConfirmBusy] = useState(false);
  const [purchaseConfirmTarget, setPurchaseConfirmTarget] = useState(null);
  const [purchaseConfirmStoreId, setPurchaseConfirmStoreId] = useState("");
  const [purchaseConfirmAmount, setPurchaseConfirmAmount] = useState("");
  const [hasMarkedPurchaseInViewSession, setHasMarkedPurchaseInViewSession] = useState(false);
  const [hasRestorableOpenPurchase, setHasRestorableOpenPurchase] = useState(false);
  const [quickQuery, setQuickQuery] = useState("");
  const [quickSuggestions, setQuickSuggestions] = useState([]);
  const [quickCategories, setQuickCategories] = useState([]);
  const [quickCategoryId, setQuickCategoryId] = useState("");
  const [quickBusy, setQuickBusy] = useState(false);
  const [quickSearching, setQuickSearching] = useState(false);
  const [quickCreateOpen, setQuickCreateOpen] = useState(false);
  const [quickCreateName, setQuickCreateName] = useState("");
  const [quickCategorySearch, setQuickCategorySearch] = useState("");
  const [quickCategoryMenuOpen, setQuickCategoryMenuOpen] = useState(false);
  const [quickCategoryMenuPosition, setQuickCategoryMenuPosition] = useState(null);
  const [allPendingSessions, setAllPendingSessions] = useState([]);
  const [sessionsTabBusy, setSessionsTabBusy] = useState(false);
  const [sessionsTabError, setSessionsTabError] = useState("");
  const [editingGroupSessionId, setEditingGroupSessionId] = useState(null);
  const [editingGroupAmount, setEditingGroupAmount] = useState("");
  const [contentSlideClass, setContentSlideClass] = useState("");
  const [basicsPopupOpen, setBasicsPopupOpen] = useState(false);
  const [basicsToast, setBasicsToast] = useState("");
  const basicsToastTimerRef = useRef(null);
  const [budgetModalOpen, setBudgetModalOpen] = useState(false);
  const [overflowMenuOpen, setOverflowMenuOpen] = useState(false);
  const [weekPickerOpen, setWeekPickerOpen] = useState(false);
  const weekPickerRef = useRef(null);
  const [addItemToasts, setAddItemToasts] = useState([]);
  const addItemToastCounterRef = useRef(0);

  const pushAddedToast = useCallback((name) => {
    const id = ++addItemToastCounterRef.current;
    setAddItemToasts((prev) => [...prev, { id, name }]);
    setTimeout(() => {
      setAddItemToasts((prev) => prev.filter((t) => t.id !== id));
    }, 3000);
  }, []);
  const overflowMenuRef = useRef(null);
  const weekDirRef = useRef(null);
  const [dismissedBannerIds, setDismissedBannerIds] = useState(() => {
    try {
      const stored = localStorage.getItem("kitchen_dismissed_banners");
      return new Set(stored ? JSON.parse(stored) : []);
    } catch {
      return new Set();
    }
  });
  const dismissedBannerIdsRef = useRef(dismissedBannerIds);
  const quickInputRef = useRef(null);
  const quickCategoryFieldRef = useRef(null);
  const quickCategoryMenuRef = useRef(null);
  const pendingNavigationRef = useRef(null);
  const prevPendingCountRef = useRef(null);
  const openPurchaseSessionRef = useRef(null);
  const isDiodGlobalMode = user?.globalRole === "diod" && !user?.activeHouseholdId;
  const isCurrentWeek = weekStart === getCurrentWeekStart();
  const openPurchaseSession = currentPurchaseSession || pendingPurchaseSessions[0] || null;
  const hasOpenPurchase = Boolean(openPurchaseSession?.id && Number(openPurchaseSession?.itemCount || 0) > 0);
  const shouldShowConfirmPurchaseButton = hasOpenPurchase && (hasMarkedPurchaseInViewSession || hasRestorableOpenPurchase);
  const selectedQuickCategory = useMemo(
    () => quickCategories.find((category) => category._id === quickCategoryId) || null,
    [quickCategories, quickCategoryId]
  );
  const filteredQuickCategories = useMemo(() => {
    const normalizedSearch = normalizeQuery(quickCategorySearch);
    if (!normalizedSearch) return quickCategories;
    return quickCategories.filter((category) => normalizeQuery(category.name).includes(normalizedSearch));
  }, [quickCategories, quickCategorySearch]);

  const updateVisibleWeek = useCallback((valueOrUpdater) => {
    const nextWeekValue = typeof valueOrUpdater === "function" ? valueOrUpdater(weekStart) : valueOrUpdater;
    const normalizedWeek = normalizeWeekParam(nextWeekValue, weekStart || getCurrentWeekStart());
    if (!normalizedWeek) return;
    if (normalizedWeek !== weekStart) {
      weekDirRef.current = normalizedWeek > weekStart ? "next" : "prev";
    }
    setWeekStart(normalizedWeek);
    const nextParams = new URLSearchParams(searchParams);
    nextParams.set("week", normalizedWeek);
    setSearchParams(nextParams, { replace: true });
  }, [searchParams, setSearchParams, setWeekStart, weekStart]);

  const handleJumpToCurrentWeek = useCallback(() => {
    updateVisibleWeek(getCurrentWeekStart());
  }, [updateVisibleWeek]);

  const openWeeklyBudgetPanel = useCallback(() => {
    if (!budgetFeatureEnabled) {
      navigate("/kitchen/upgrade");
      return;
    }
    const encodedWeek = encodeURIComponent(weekStart || getCurrentWeekStart());
    navigate(`/kitchen/compra/presupuesto?week=${encodedWeek}&origin=shopping&returnWeek=${encodedWeek}`);
  }, [budgetFeatureEnabled, navigate, weekStart]);

  const applyPayload = (data) => {
    const nextStores = Array.isArray(data?.stores) ? data.stores : [];
    const nextBudgetFeatureEnabled = data?.featureAvailability?.budget !== false;
    const nextBudget = nextBudgetFeatureEnabled ? {
      monthlyBudget: Number(data?.budget?.monthlyBudget) || 0,
      cycleStartDay: Number(data?.budget?.cycleStartDay) || 1,
      weeklyBudget: Number(data?.budget?.weeklyBudget) || 0,
      spent: Number(data?.budget?.spent) || 0,
      available: Number.isFinite(Number(data?.budget?.available)) ? Number(data.budget.available) : 0
    } : null;
    const normalizedPendingPurchaseSessions = Array.isArray(data?.pendingPurchaseSessions)
      ? data.pendingPurchaseSessions.map((session) => ({
          ...session,
          itemCount: Number(session?.itemCount) || 0
        }))
      : [];
    const nextCurrentPurchaseSession = nextBudgetFeatureEnabled && data?.currentPurchaseSession && typeof data.currentPurchaseSession === "object"
      ? {
          ...data.currentPurchaseSession,
          itemCount: Number(data.currentPurchaseSession.itemCount) || 0
        }
      : null;
    const nextOpenPurchaseSession = nextCurrentPurchaseSession || normalizedPendingPurchaseSessions[0] || null;

    setStores(nextStores);
    setBudgetFeatureEnabled(nextBudgetFeatureEnabled);
    setBudget(nextBudget);
    setPendingByCategory(Array.isArray(data?.pendingByCategory) ? data.pendingByCategory : []);
    setPurchasedByStoreDay(Array.isArray(data?.purchasedByStoreDay) ? data.purchasedByStoreDay : []);
    setPendingPurchaseSessions(nextBudgetFeatureEnabled ? normalizedPendingPurchaseSessions : []);
    setCurrentPurchaseSession(nextCurrentPurchaseSession);
    setHasRestorableOpenPurchase(Boolean(nextOpenPurchaseSession?.id && Number(nextOpenPurchaseSession?.itemCount || 0) > 0));

    // Trigger week-change slide animation
    if (weekDirRef.current) {
      setContentSlideClass(weekDirRef.current === "next" ? "slide-from-right" : "slide-from-left");
      weekDirRef.current = null;
    }

    // Prune dismissed IDs that are no longer pending (already confirmed/cancelled)
    const activePendingIds = new Set(normalizedPendingPurchaseSessions.map((s) => String(s.id)));
    if (nextCurrentPurchaseSession?.id) activePendingIds.add(String(nextCurrentPurchaseSession.id));
    setDismissedBannerIds((prev) => {
      const pruned = new Set([...prev].filter((id) => activePendingIds.has(id)));
      if (pruned.size === prev.size) return prev;
      dismissedBannerIdsRef.current = pruned;
      try {
        localStorage.setItem("kitchen_dismissed_banners", JSON.stringify([...pruned]));
      } catch {}
      return pruned;
    });
  };

  const handleBudgetFeatureUnavailable = (message = "Upgrade your license to enable budgets.") => {
    setBudgetFeatureEnabled(false);
    setBudget(null);
    setPendingPurchaseSessions([]);
    setCurrentPurchaseSession(null);
    setHasRestorableOpenPurchase(false);
    setPurchaseConfirmOpen(false);
    setPurchaseConfirmTarget(null);
    setPurchaseConfirmStoreId("");
    setPurchaseConfirmAmount("");
    setLeavePromptOpen(false);
    setError(message);
  };

  const logShoppingApiError = (context, endpoint, err) => {
    if (err instanceof ApiRequestError) {
      console.error(`[shopping] ${context} failed`, {
        endpoint,
        status: err.status,
        body: err.body,
        message: err.message
      });
      return;
    }
    console.error(`[shopping] ${context} failed`, { endpoint, message: err?.message || err });
  };

  const loadList = async ({ silent = false, checkBasicsPopup = false } = {}) => {
    if (isDiodGlobalMode) return;
    if (!silent) setIsRefreshing(true);
    setError("");
    try {
      const data = await apiRequest(`/api/kitchen/shopping/${weekStart}`);
      applyPayload(data);
      if (checkBasicsPopup) {
        if (canUseBasicsFeature(user)) {
          const householdId = user?.activeHouseholdId || user?.householdId || "";
          const popupKey = `lunchfy_basics_popup_${householdId}_${weekStart}`;
          try {
            if (!localStorage.getItem(popupKey)) {
              localStorage.setItem(popupKey, "1");
              setBasicsPopupOpen(true);
            }
          } catch { /* ignore */ }
        }
      }
    } catch (err) {
      if (isBudgetFeatureUnavailableError(err)) {
        handleBudgetFeatureUnavailable();
        return;
      }
      logShoppingApiError("loadList", `/api/kitchen/shopping/${weekStart}`, err);
      setBudgetFeatureEnabled(true);
      setBudget(null);
      setPendingByCategory(null);
      setPurchasedByStoreDay(null);
      setPendingPurchaseSessions([]);
      setCurrentPurchaseSession(null);
      setHasRestorableOpenPurchase(false);
      setError(err.message || "No se pudo cargar la lista.");
    } finally {
      if (!silent) setIsRefreshing(false);
    }
  };

  useEffect(() => {
    void loadList({ checkBasicsPopup: true });
  }, [weekStart, isDiodGlobalMode]);

  useEffect(() => {
    const requestedWeek = normalizeWeekParam(searchParams.get("week"), "");
    if (!requestedWeek || requestedWeek === weekStart) return;
    setWeekStart(requestedWeek);
  }, [searchParams, setWeekStart, weekStart]);

  useEffect(() => {
    if (!recentlyMovedItemKey) return undefined;
    const timer = setTimeout(() => setRecentlyMovedItemKey(null), 650);
    return () => clearTimeout(timer);
  }, [recentlyMovedItemKey]);

  useEffect(() => {
    const shouldWarnBeforeUnload = hasOpenPurchase;
    if (!shouldWarnBeforeUnload) return undefined;
    const handleBeforeUnload = (event) => {
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => window.removeEventListener("beforeunload", handleBeforeUnload);
  }, [hasOpenPurchase]);

  useEffect(() => {
    const navigator = navigationContext?.navigator;
    if (!navigator || !hasOpenPurchase || !isShoppingRoutePath(location.pathname)) return undefined;

    const originalPush = navigator.push?.bind(navigator);
    const originalReplace = navigator.replace?.bind(navigator);
    const originalGo = navigator.go?.bind(navigator);

    const shouldInterceptPath = (nextPathname) => !isShoppingRoutePath(nextPathname);

    if (originalPush) {
      navigator.push = (to, state, options) => {
        const nextPathname = resolvePathnameFromTo(to, location.pathname);
        if (!shouldInterceptPath(nextPathname)) {
          return originalPush(to, state, options);
        }
        pendingNavigationRef.current = () => originalPush(to, state, options);
        setLeavePromptOpen(true);
      };
    }

    if (originalReplace) {
      navigator.replace = (to, state, options) => {
        const nextPathname = resolvePathnameFromTo(to, location.pathname);
        if (!shouldInterceptPath(nextPathname)) {
          return originalReplace(to, state, options);
        }
        pendingNavigationRef.current = () => originalReplace(to, state, options);
        setLeavePromptOpen(true);
      };
    }

    if (originalGo) {
      navigator.go = (delta) => {
        if (!delta) return originalGo(delta);
        pendingNavigationRef.current = () => originalGo(delta);
        setLeavePromptOpen(true);
      };
    }

    return () => {
      if (originalPush) navigator.push = originalPush;
      if (originalReplace) navigator.replace = originalReplace;
      if (originalGo) navigator.go = originalGo;
    };
  }, [hasOpenPurchase, location.pathname, navigationContext]);

  useEffect(() => {
    let active = true;
    const loadCategories = async () => {
      try {
        const categoriesData = await apiRequest("/api/categories");
        if (!active) return;
        setQuickCategories(categoriesData.categories || []);
      } catch {
        if (!active) return;
        setQuickCategories([]);
      }
    };
    void loadCategories();
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    const onCatalogInvalidated = async () => {
      try {
        const categoriesData = await apiRequest("/api/categories");
        setQuickCategories(categoriesData.categories || []);
      } catch {
        setQuickCategories([]);
      }
    };
    window.addEventListener("kitchen:catalog-invalidated", onCatalogInvalidated);
    return () => window.removeEventListener("kitchen:catalog-invalidated", onCatalogInvalidated);
  }, []);

  useEffect(() => {
    if (!quickCreateOpen || !quickCategoryMenuOpen) return undefined;

    const handlePointerDown = (event) => {
      if (quickCategoryFieldRef.current?.contains(event.target)) return;
      if (quickCategoryMenuRef.current?.contains(event.target)) return;
      setQuickCategoryMenuOpen(false);
    };

    document.addEventListener("mousedown", handlePointerDown);
    return () => document.removeEventListener("mousedown", handlePointerDown);
  }, [quickCreateOpen, quickCategoryMenuOpen]);

  useEffect(() => {
    if (!overflowMenuOpen) return undefined;
    const handlePointerDown = (event) => {
      if (overflowMenuRef.current?.contains(event.target)) return;
      setOverflowMenuOpen(false);
    };
    document.addEventListener("mousedown", handlePointerDown);
    return () => document.removeEventListener("mousedown", handlePointerDown);
  }, [overflowMenuOpen]);

  useEffect(() => {
    if (!weekPickerOpen) return undefined;
    const handlePointerDown = (event) => {
      if (weekPickerRef.current?.contains(event.target)) return;
      setWeekPickerOpen(false);
    };
    document.addEventListener("mousedown", handlePointerDown);
    return () => document.removeEventListener("mousedown", handlePointerDown);
  }, [weekPickerOpen]);

  const updateQuickCategoryMenuPosition = useCallback(() => {
    const field = quickCategoryFieldRef.current;
    if (!field) return;
    const rect = field.getBoundingClientRect();
    const viewportHeight = window.innerHeight;
    const spaceBelow = viewportHeight - rect.bottom;
    const openUpward = spaceBelow < 240 && rect.top > spaceBelow;
    const menuHeight = Math.min(240, Math.max(160, openUpward ? rect.top - 16 : viewportHeight - rect.bottom - 16));

    setQuickCategoryMenuPosition({
      left: rect.left,
      width: rect.width,
      top: openUpward ? "auto" : rect.bottom + 8,
      bottom: openUpward ? viewportHeight - rect.top + 8 : "auto",
      maxHeight: menuHeight,
      placement: openUpward ? "top" : "bottom"
    });
  }, []);

  useLayoutEffect(() => {
    if (!quickCreateOpen || !quickCategoryMenuOpen) return undefined;

    updateQuickCategoryMenuPosition();
    const handleReposition = () => updateQuickCategoryMenuPosition();
    window.addEventListener("resize", handleReposition);
    window.addEventListener("scroll", handleReposition, true);

    return () => {
      window.removeEventListener("resize", handleReposition);
      window.removeEventListener("scroll", handleReposition, true);
    };
  }, [filteredQuickCategories.length, quickCategoryMenuOpen, quickCreateOpen, updateQuickCategoryMenuPosition]);

  useEffect(() => {
    if (!quickQuery.trim()) {
      setQuickSuggestions([]);
      return;
    }
    let active = true;
    setQuickSearching(true);
    const timer = setTimeout(async () => {
      try {
        const data = await apiRequest(`/api/kitchenIngredients?q=${encodeURIComponent(quickQuery)}&limit=20`);
        if (!active) return;
        setQuickSuggestions(data.ingredients || []);
      } catch {
        if (!active) return;
        setQuickSuggestions([]);
      } finally {
        if (active) setQuickSearching(false);
      }
    }, 200);
    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [quickQuery]);

  useEffect(() => {
    openPurchaseSessionRef.current = openPurchaseSession;
  }, [openPurchaseSession]);

  const markCategoryPurchased = async (group) => {
    if (isDiodGlobalMode || !group?.items?.length) return;
    setError("");
    try {
      let lastData;
      for (const item of group.items) {
        // eslint-disable-next-line no-await-in-loop
        lastData = await apiRequest(`/api/kitchen/shopping/${weekStart}/item`, {
          method: "PUT",
          body: JSON.stringify({
            canonicalName: item.canonicalName,
            ingredientId: item.ingredientId,
            status: "purchased",
            storeId: selectedStoreRef.current || null
          })
        });
      }
      if (lastData) applyPayload(lastData);
      notifyWeekly("item_purchased", { itemKey: "batch" });
    } catch (err) {
      logShoppingApiError("markCategoryPurchased", `/api/kitchen/shopping/${weekStart}/item`, err);
      setError(err.message || "No se pudo marcar la categoría.");
    }
  };

  const openPurchaseConfirmModal = (session) => {
    if (!session?.id) return;
    setPurchaseConfirmTarget(session);
    setPurchaseConfirmStoreId(session.storeId || selectedStoreRef.current || "");
    setPurchaseConfirmAmount(session.amount ? String(session.amount) : "");
    setPurchaseConfirmOpen(true);
  };

  const proceedPendingNavigation = () => {
    const pendingNavigation = pendingNavigationRef.current;
    pendingNavigationRef.current = null;
    if (typeof pendingNavigation === "function") {
      pendingNavigation();
    }
  };

  const closeLeavePrompt = () => {
    setLeavePromptOpen(false);
    pendingNavigationRef.current = null;
  };

  const confirmPurchaseBeforeLeaving = () => {
    if (!openPurchaseSession?.id) {
      proceedPendingNavigation();
      return;
    }
    setLeavePromptOpen(false);
    openPurchaseConfirmModal(openPurchaseSession);
  };

  const leavePurchasePending = () => {
    setLeavePromptOpen(false);
    proceedPendingNavigation();
  };

  const closePurchaseConfirmModal = () => {
    if (purchaseConfirmBusy) return;
    setPurchaseConfirmOpen(false);
    setPurchaseConfirmTarget(null);
    setPurchaseConfirmStoreId("");
    setPurchaseConfirmAmount("");
  };

  const addIngredientToList = async (ingredientId, categoryId) => {
    const data = await apiRequest(`/api/kitchen/shopping/${weekStart}/items`, {
      method: "POST",
      body: JSON.stringify({ ingredientId, categoryId: categoryId || null, storeId: selectedStoreRef.current || null })
    });
    applyPayload(data);
  };

  const createHouseholdIngredient = async (name, categoryId) => {
    const data = await apiRequest("/api/kitchenIngredients", {
      method: "POST",
      body: JSON.stringify({
        name: name.trim(),
        categoryId,
        scope: "household",
        householdId: user?.activeHouseholdId || null
      })
    });
    return data.ingredient || null;
  };

  const handleQuickSelect = async (ingredient) => {
    if (!ingredient?._id || quickBusy) return;
    setQuickBusy(true);
    setError("");
    try {
      await addIngredientToList(ingredient._id, ingredient.categoryId?._id || ingredient.categoryId || quickCategoryId || null);
      setQuickQuery("");
      setQuickSuggestions([]);
      setQuickCategoryId("");
      quickInputRef.current?.focus();
      pushAddedToast(ingredient.name);
      notifyWeekly("manual_item_added");
    } catch (err) {
      setError(err.message || "No se pudo añadir el ingrediente a la lista.");
    } finally {
      setQuickBusy(false);
    }
  };

  const openQuickCreateModal = () => {
    const trimmedName = quickQuery.trim();
    if (!trimmedName || quickBusy) return;
    setQuickCreateName(trimmedName);
    setQuickCategoryId("");
    setQuickCategorySearch("");
    setQuickCategoryMenuOpen(false);
    setQuickCreateOpen(true);
  };

  const closeQuickCreateModal = () => {
    if (quickBusy) return;
    setQuickCreateOpen(false);
    setQuickCategoryId("");
    setQuickCategorySearch("");
    setQuickCategoryMenuOpen(false);
  };

  const handleQuickCreate = async () => {
    if (!quickCreateName.trim() || !quickCategoryId || quickBusy) return;
    setQuickBusy(true);
    setError("");
    try {
      const ingredient = await createHouseholdIngredient(quickCreateName, quickCategoryId);
      if (!ingredient?._id) throw new Error("No se pudo crear el ingrediente.");
      await addIngredientToList(ingredient._id, quickCategoryId);
      setQuickQuery("");
      setQuickSuggestions([]);
      setQuickCreateName("");
      setQuickCategoryId("");
      setQuickCategorySearch("");
      setQuickCategoryMenuOpen(false);
      setQuickCreateOpen(false);
      quickInputRef.current?.focus();
      pushAddedToast(ingredient.name);
      notifyWeekly("manual_item_added");
    } catch (err) {
      setError(err.message || "No se pudo crear y añadir el ingrediente.");
    } finally {
      setQuickBusy(false);
    }
  };

  const removeItem = async (item) => {
    if (!item?.itemId) {
      setError("No se pudo eliminar: falta identificador del item.");
      return;
    }
    try {
      const data = await apiRequest(`/api/kitchen/shopping/${weekStart}/items/${item.itemId}`, { method: "DELETE" });
      applyPayload(data);
    } catch (err) {
      setError(err.message || "No se pudo eliminar el item.");
    }
  };

  const adjustItemOccurrences = async (item, delta) => {
    if (!item?.itemId || !Number.isInteger(delta) || delta === 0) return;
    try {
      const data = await apiRequest(`/api/kitchen/shopping/${weekStart}/items/${item.itemId}/occurrences`, {
        method: "PUT",
        body: JSON.stringify({ delta })
      });
      applyPayload(data);
    } catch (err) {
      setError(err.message || "No se pudo actualizar la cantidad.");
    }
  };

  // Anchor ref map: tracks the check button element for each item key so
  // burstParticles can receive a live DOM element even after rerender.
  const checkButtonRefsRef = useRef(new Map());

  const setItemStatus = async (item, status, checkButtonEl) => {
    if (isDiodGlobalMode) return;
    const key = itemKey(item);
    setTransitioningItemKey(key);

    // 🎯 Fire particle burst immediately (fire-and-forget, does not await)
    if (status === "purchased" && checkButtonEl) {
      burstParticles(checkButtonEl, { count: 5, radius: 38, duration: 560 });
    }

    try {
      const data = await apiRequest(`/api/kitchen/shopping/${weekStart}/item`, {
        method: "PUT",
        body: JSON.stringify({
          canonicalName: item.canonicalName,
          ingredientId: item.ingredientId,
          status,
          storeId: status === "purchased" ? selectedStoreRef.current || null : null
        })
      });
      applyPayload(data);
      if (status === "purchased") {
        notifyOnboarding("mark_purchased");
        notifyWeekly("item_purchased", { itemKey: key });
        const remaining = data.list?.pendingByCategory
          ? Object.values(data.list.pendingByCategory).reduce((s, arr) => s + arr.length, 0)
          : null;
        if (remaining === 0) {
          notifyWeekly("shopping_list_completed");
          // 🏆 Milestone toast: entire list is done
          triggerMilestone({
            title   : "Lista completada",
            subtitle: "¡Todo listo para esta semana!",
            icon    : "✓",
            variant : "check"
          });
        }
        if (data?.currentPurchaseSession?.id || data?.pendingPurchaseSessions?.[0]?.id) {
          setHasMarkedPurchaseInViewSession(true);
        }
      }
      setRecentlyMovedItemKey(key);
    } catch (err) {
      logShoppingApiError("setItemStatus", `/api/kitchen/shopping/${weekStart}/item`, err);
      setError(err.message || "No se pudo actualizar.");
    } finally {
      setTransitioningItemKey(null);
    }
  };

  const updatePurchasedItemStore = async (item, storeId) => {
    try {
      const data = await apiRequest(`/api/kitchen/shopping/${weekStart}/item/store`, {
        method: "PUT",
        body: JSON.stringify({ canonicalName: item.canonicalName, ingredientId: item.ingredientId, storeId: storeId || null })
      });
      applyPayload(data);
    } catch (err) {
      logShoppingApiError("updatePurchasedItemStore", `/api/kitchen/shopping/${weekStart}/item/store`, err);
      setError(err.message || "No se pudo cambiar el supermercado.");
    }
  };

  const saveGroupAmount = async (group) => {
    if (!group.purchaseSessionId) return;
    try {
      await apiRequest(`/api/kitchen/shopping/purchase-sessions/${group.purchaseSessionId}/amount`, {
        method: "PUT",
        body: JSON.stringify({ amount: editingGroupAmount })
      });
      setEditingGroupSessionId(null);
      await loadList({ silent: true });
    } catch (err) {
      setError(err.message || "No se pudo actualizar el importe.");
    }
  };

  const updateGroupStore = async (group, newStoreId) => {
    try {
      const data = await apiRequest(`/api/kitchen/shopping/${weekStart}/purchased/group-store`, {
        method: "PUT",
        body: JSON.stringify({ purchasedDate: group.purchasedDate, storeId: newStoreId || null })
      });
      applyPayload(data);
    } catch (err) {
      logShoppingApiError("updateGroupStore", `/api/kitchen/shopping/${weekStart}/purchased/group-store`, err);
      setError(err.message || "No se pudo cambiar el supermercado.");
    }
  };

  const setAllItemsStatus = async (status) => {
    try {
      const data = await apiRequest(`/api/kitchen/shopping/${weekStart}/items/status`, {
        method: "PUT",
        body: JSON.stringify({
          status,
          storeId: status === "purchased" ? selectedStoreId || null : null
        })
      });
      applyPayload(data);
      if (status === "purchased") {
        setSuccess(data.updated ? "Todo marcado como comprado" : "No había elementos pendientes.");
        if (data.updated && (data?.currentPurchaseSession?.id || data?.pendingPurchaseSessions?.[0]?.id)) {
          setHasMarkedPurchaseInViewSession(true);
        }
        // Fire challenge trigger when "mark all" leaves the list fully purchased
        const remainingAfter = data.list?.pendingByCategory
          ? Object.values(data.list.pendingByCategory).reduce((s, arr) => s + arr.length, 0)
          : 0;
        if (data.updated && remainingAfter === 0) {
          notifyWeekly("shopping_list_completed");
        }
      } else {
        setSuccess(data.updated ? "Todo volvió a pendiente" : "No había elementos comprados.");
      }
    } catch (err) {
      logShoppingApiError("setAllItemsStatus", `/api/kitchen/shopping/${weekStart}/items/status`, err);
      setError(err.message || "No se pudo actualizar en bloque.");
    }
  };

  const createStoreFromDropdown = async () => {
    const name = window.prompt("Nombre del supermercado");
    if (!name || !name.trim()) return;
    setError("");
    try {
      await apiRequest("/api/kitchen/shopping/stores", {
        method: "POST",
        body: JSON.stringify({ name: name.trim() })
      });
      await loadList({ silent: true });
    } catch (err) {
      logShoppingApiError("createStoreFromDropdown", "/api/kitchen/shopping/stores", err);
      setError(err.message || "No se pudo crear el supermercado.");
    }
  };

  const dismissBanner = (sessionId) => {
    if (!sessionId) return;
    setDismissedBannerIds((prev) => {
      const next = new Set(prev);
      next.add(String(sessionId));
      dismissedBannerIdsRef.current = next;
      try {
        localStorage.setItem("kitchen_dismissed_banners", JSON.stringify([...next]));
      } catch {}
      return next;
    });
  };

  const postponePurchaseConfirmation = async () => {
    if (!purchaseConfirmTarget?.id || purchaseConfirmBusy) return;
    setPurchaseConfirmBusy(true);
    setError("");
    try {
      await apiRequest(`/api/kitchen/shopping/purchase-sessions/${purchaseConfirmTarget.id}/postpone`, {
        method: "POST"
      });
      await loadList({ silent: true });
      setPurchaseConfirmOpen(false);
      setPurchaseConfirmTarget(null);
      setPurchaseConfirmStoreId("");
      setPurchaseConfirmAmount("");
      if (pendingNavigationRef.current) {
        proceedPendingNavigation();
      }
    } catch (err) {
      if (isBudgetFeatureUnavailableError(err)) {
        handleBudgetFeatureUnavailable();
        return;
      }
      setError(err.message || "No se pudo posponer la confirmación.");
    } finally {
      setPurchaseConfirmBusy(false);
    }
  };

  const completePendingPurchase = async () => {
    if (!purchaseConfirmTarget?.id || purchaseConfirmBusy) return;
    setPurchaseConfirmBusy(true);
    setError("");
    try {
      await apiRequest(`/api/kitchen/shopping/purchase-sessions/${purchaseConfirmTarget.id}/complete`, {
        method: "POST",
        body: JSON.stringify({
          storeId: purchaseConfirmStoreId || null,
          amount: purchaseConfirmAmount
        })
      });
      await loadList({ silent: true });
      // Refresh sessions tab if it was active
      if (tab === "sessions") {
        apiRequest("/api/kitchen/shopping/purchase-sessions/pending")
          .then((data) => setAllPendingSessions(Array.isArray(data?.sessions) ? data.sessions : []))
          .catch(() => {});
      }
      setPurchaseConfirmOpen(false);
      setPurchaseConfirmTarget(null);
      // Weekly challenge: purchase finalized with store + amount
      if (purchaseConfirmStoreId && purchaseConfirmAmount) {
        notifyWeekly("purchase_finalized", {
          storeId: purchaseConfirmStoreId,
          amount: purchaseConfirmAmount
        });
      }
      setPurchaseConfirmStoreId("");
      setPurchaseConfirmAmount("");
      if (pendingNavigationRef.current) {
        proceedPendingNavigation();
      }
      setSuccess("Compra registrada.");
    } catch (err) {
      if (isBudgetFeatureUnavailableError(err)) {
        handleBudgetFeatureUnavailable();
        return;
      }
      setError(err.message || "No se pudo guardar la compra.");
    } finally {
      setPurchaseConfirmBusy(false);
    }
  };

  const pendingCount = useMemo(() => {
    if (!Array.isArray(pendingByCategory)) return null;
    return getPendingItemsCount(pendingByCategory);
  }, [pendingByCategory]);

  useEffect(() => {
    if (!budgetFeatureEnabled || pendingCount === null) {
      prevPendingCountRef.current = pendingCount;
      return;
    }
    const prev = prevPendingCountRef.current;
    prevPendingCountRef.current = pendingCount;
    if (prev === null || prev === 0 || pendingCount > 0) return;
    const timer = setTimeout(() => {
      const session = openPurchaseSessionRef.current;
      if (session?.id && Number(session.itemCount || 0) > 0 && !dismissedBannerIdsRef.current.has(String(session.id))) {
        openPurchaseConfirmModal(session);
      }
    }, 1200);
    return () => clearTimeout(timer);
  }, [pendingCount, budgetFeatureEnabled]);

  useEffect(() => {
    if (tab !== "sessions" || !budgetFeatureEnabled) return;
    let active = true;
    setSessionsTabBusy(true);
    setSessionsTabError("");
    apiRequest("/api/kitchen/shopping/purchase-sessions/pending")
      .then((data) => {
        if (!active) return;
        setAllPendingSessions(Array.isArray(data?.sessions) ? data.sessions : []);
      })
      .catch((err) => {
        if (!active) return;
        if (isBudgetFeatureUnavailableError(err)) {
          setSessionsTabError("Esta función requiere el plan PRO.");
          return;
        }
        setSessionsTabError(err.message || "No se pudieron cargar las compras pendientes.");
      })
      .finally(() => {
        if (active) setSessionsTabBusy(false);
      });
    return () => { active = false; };
  }, [tab, budgetFeatureEnabled]);

  const purchasedCount = useMemo(() => {
    if (!Array.isArray(purchasedByStoreDay)) return null;
    return purchasedByStoreDay.reduce((acc, group) => acc + (group.items?.length || 0), 0);
  }, [purchasedByStoreDay]);
  const hasExactSuggestion = Array.isArray(quickSuggestions) && quickSuggestions.some((item) => normalizeQuery(item?.name) === normalizeQuery(quickQuery));
  const currentPendingCanonicals = useMemo(() => {
    if (!Array.isArray(pendingByCategory)) return new Set();
    const set = new Set();
    for (const group of pendingByCategory) {
      for (const item of (group.items || [])) {
        if (item.canonicalName) set.add(String(item.canonicalName).toLowerCase());
      }
    }
    return set;
  }, [pendingByCategory]);
  const currentPendingIngredientIds = useMemo(() => {
    if (!Array.isArray(pendingByCategory)) return new Set();
    const set = new Set();
    for (const group of pendingByCategory) {
      for (const item of (group.items || [])) {
        if (item.ingredientId) set.add(String(item.ingredientId));
      }
    }
    return set;
  }, [pendingByCategory]);

  if (isDiodGlobalMode) {
    return (
      <KitchenLayout>
        <div className="kitchen-card">Selecciona un hogar activo para ver su lista de la compra.</div>
      </KitchenLayout>
    );
  }

  return (
    <KitchenLayout>
      <div className="shopping-page-shell">
        <div className="kitchen-card shopping-main-card">
          <div className="shopping-header-card">
            {/* Row 1: title | WA share icon */}
            <div className="shopping-header-top">
              <div className="shopping-header-left">
                <h1 className="shopping-header-h1">Lista de la compra</h1>
                {/* Row 2: week navigator with visible chevrons */}
                <div className="shopping-header-week-area" ref={weekPickerRef}>
                  <div className="shopping-week-nav-strip">
                    <button
                      type="button"
                      className="shopping-week-chevron"
                      onClick={() => updateVisibleWeek((p) => addDaysToISO(p, -7))}
                      aria-label="Semana anterior"
                    >
                      <ChevronLeft size={14} />
                    </button>
                    <button
                      type="button"
                      className="shopping-week-date-trigger"
                      onClick={() => setWeekPickerOpen((v) => !v)}
                      aria-label="Seleccionar semana"
                      aria-expanded={weekPickerOpen}
                    >
                      <Calendar size={13} />
                      <span>{formatWeekRange(weekStart)}</span>
                    </button>
                    <button
                      type="button"
                      className="shopping-week-chevron"
                      onClick={() => updateVisibleWeek((p) => addDaysToISO(p, 7))}
                      aria-label="Semana siguiente"
                    >
                      <ChevronRight size={14} />
                    </button>
                  </div>
                  {!isCurrentWeek ? (
                    <button
                      type="button"
                      className="shopping-today-chip"
                      onClick={handleJumpToCurrentWeek}
                      aria-label="Ir a la semana actual"
                    >
                      Hoy
                    </button>
                  ) : null}
                  {weekPickerOpen ? (
                    <div className="shopping-week-picker-popover" role="dialog" aria-label="Seleccionar semana">
                      <button
                        type="button"
                        className="shopping-week-picker-arrow"
                        onClick={() => { updateVisibleWeek((p) => addDaysToISO(p, -7)); setWeekPickerOpen(false); }}
                        aria-label="Semana anterior"
                      >
                        <ChevronLeft size={16} />
                      </button>
                      <span className="shopping-week-picker-label">{formatWeekRange(weekStart)}</span>
                      <button
                        type="button"
                        className="shopping-week-picker-arrow"
                        onClick={() => { updateVisibleWeek((p) => addDaysToISO(p, 7)); setWeekPickerOpen(false); }}
                        aria-label="Semana siguiente"
                      >
                        <ChevronRight size={16} />
                      </button>
                    </div>
                  ) : null}
                </div>
              </div>
              <ShareWhatsAppButton
                iconOnly
                size={18}
                className="shopping-header-wa-btn shopping-header-wa-top"
                buttonLabel="Compartir lista de la compra"
                items={[
                  {
                    id: "shopping-list",
                    label: "Compartir esta lista",
                    description: "Comparte la lista de la compra de esta semana con acceso protegido.",
                    url: buildShoppingShareUrl(weekStart),
                    message: `Aquí tienes la lista de la compra en HomeFirst: ${buildShoppingShareUrl(weekStart)}`
                  }
                ]}
              />
            </div>

            {/* Budget pill — only when feature enabled AND budget configured */}
            {budgetFeatureEnabled === true && budget !== null && budget?.weeklyBudget > 0 ? (
              <button
                type="button"
                className="shopping-budget-pill-bar"
                onClick={() => setBudgetModalOpen(true)}
                aria-label="Ver desglose del presupuesto"
              >
                <div
                  className="shopping-budget-pill-fill"
                  style={{
                    width: `${Math.min(100, Math.round((budget.spent / budget.weeklyBudget) * 100))}%`
                  }}
                />
                <span className="shopping-budget-pill-text">
                  <span className="shopping-budget-pill-label">Presupuesto · </span>
                  <span className="shopping-budget-pill-amount">{formatCurrency(budget.spent)} / {formatCurrency(budget.weeklyBudget)}</span>
                </span>
              </button>
            ) : null}

            {/* Add input + basics button — inline row */}
            {tab === "pending" ? (
              <div className="shopping-add-inline">
                <div className="shopping-add-wrapper" role="region" aria-label="Añadir ingrediente">
                  <input
                    ref={quickInputRef}
                    className="kitchen-input shopping-add-input"
                    value={quickQuery}
                    onChange={(event) => setQuickQuery(event.target.value)}
                    placeholder="¿Qué necesitas comprar?"
                  />
                  {quickQuery ? (
                    <div className="shopping-quick-suggestions">
                      {quickSearching ? <div className="kitchen-muted">Buscando...</div> : null}
                      {!quickSearching ? quickSuggestions.slice(0, 8).map((item) => (
                        <button key={item._id} type="button" className="kitchen-suggestion" onClick={() => handleQuickSelect(item)} disabled={quickBusy}>
                          <span className="kitchen-suggestion-name">{item.name}</span>
                        </button>
                      )) : null}
                      {!quickSearching && !hasExactSuggestion && quickQuery.trim() ? (
                        <button className="kitchen-button ghost shopping-quick-create" type="button" onClick={openQuickCreateModal} disabled={quickBusy}>
                          Crear "{quickQuery.trim()}"
                        </button>
                      ) : null}
                    </div>
                  ) : null}
                </div>
                <button
                  type="button"
                  className="kitchen-button shopping-basics-btn-inline"
                  onClick={() => setBasicsPopupOpen(true)}
                  aria-label="Añadir básicos de compra"
                >
                  <Plus size={14} />
                  Básicos
                </button>
              </div>
            ) : null}

            {/* Tabs */}
            <div className="shopping-tabs-standalone">
              <div className="kitchen-dishes-tabs shopping-tabs-inline" role="tablist" aria-label="Estado de la compra">
                <button className={`kitchen-tab-button ${tab === "pending" ? "is-active" : ""}`} onClick={() => setTab("pending")}>Pendiente ({pendingCount === null ? "—" : pendingCount})</button>
                <button className={`kitchen-tab-button ${tab === "purchased" ? "is-active" : ""}`} onClick={() => setTab("purchased")}>Comprado</button>
                {budgetFeatureEnabled ? (
                  <button className={`kitchen-tab-button ${tab === "sessions" ? "is-active" : ""}`} onClick={() => setTab("sessions")}>
                    Por confirmar{pendingPurchaseSessions.length > 0 ? ` (${pendingPurchaseSessions.length})` : ""}
                  </button>
                ) : null}
              </div>
            </div>
          </div>
          {(success || error) ? (
            <div className="shopping-toolbar-alerts" aria-live="polite">
              {success ? <div className="kitchen-alert success shopping-toolbar-alert">{success}</div> : null}
              {error ? <div className="kitchen-alert error shopping-toolbar-alert">{error}</div> : null}
            </div>
          ) : null}

          {budgetFeatureEnabled && currentPurchaseSession && !dismissedBannerIds.has(String(currentPurchaseSession.id)) && !purchaseConfirmOpen && tab !== "sessions" ? (
            <div className="shopping-confirm-banner" role="status">
              <span className="shopping-confirm-banner-title">
                🧾 {currentPurchaseSession.itemCount} producto{currentPurchaseSession.itemCount !== 1 ? "s" : ""} comprado{currentPurchaseSession.itemCount !== 1 ? "s" : ""}{currentPurchaseSession.storeName ? ` · ${currentPurchaseSession.storeName}` : ""} sin gasto registrado
              </span>
              <div className="shopping-confirm-banner-actions">
                <button
                  type="button"
                  className="kitchen-button is-small shopping-confirm-banner-btn"
                  onClick={() => openPurchaseConfirmModal(currentPurchaseSession)}
                >
                  Registrar
                </button>
                <button
                  type="button"
                  className="shopping-confirm-banner-dismiss"
                  onClick={() => dismissBanner(currentPurchaseSession.id)}
                  aria-label="Cerrar aviso"
                  title="No volver a mostrar este aviso"
                >
                  ✕
                </button>
              </div>
            </div>
          ) : null}

          <div
            className={`shopping-week-content ${contentSlideClass}`}
            onAnimationEnd={() => setContentSlideClass("")}
          >
          {tab === "pending" ? (
            <div className="shopping-categories-wrap">
              {!Array.isArray(pendingByCategory) ? (
                <div className="shopping-empty-state"><EmptyStateIcon /><h4>No se pudo cargar la lista.</h4></div>
              ) : pendingByCategory.length === 0 ? (
                <div className="shopping-empty-state">
                  {purchasedCount ? <EmptyCheckIcon /> : <EmptyListIcon />}
                  <h4>{purchasedCount ? "Todo comprado por esta semana." : "No hay nada por comprar todavía."}</h4>
                </div>
              ) : (
                <>
                  <div className="shopping-global-actions-row">
                    <button
                      type="button"
                      className="shopping-global-mark-all"
                      onClick={() => setAllItemsStatus("purchased")}
                    >
                      Marcar todo
                    </button>
                  </div>
                  <div className="shopping-categories shopping-categories-grid">
                    {pendingByCategory.map((group) => {
                      const category = { name: group.categoryInfo?.name || "Sin categoría", ...slugColor(group.categoryInfo?.slug), ...group.categoryInfo };
                      return (
                        <div
                          className="shopping-category-card"
                          key={group.categoryId || group.categoryInfo?.slug || group.categoryInfo?.name}
                          style={{ "--category-bg": category.colorBg, "--category-text": category.colorText }}
                        >
                          <div className="shopping-category-head">
                            <h4>{category.name.toUpperCase()}</h4>
                            <span className="shopping-category-count">{group.items.length}</span>
                          </div>
                          <div className="shopping-items-flat-list">
                            {group.items.map((item) => {
                              const key = itemKey(item);
                              return (
                                <div className={`shopping-item-flat ${transitioningItemKey === key ? "is-leaving" : ""}`} key={key}>
                                  <button
                                    className="shopping-check"
                                    type="button"
                                    onClick={(e) => setItemStatus(item, "purchased", e.currentTarget)}
                                    aria-label={`Marcar ${item.displayName} como comprado`}
                                  >
                                    <span className="shopping-check-dot">✓</span>
                                  </button>
                                  <div className="shopping-item-name-col">
                                    <span className="shopping-item-text">{item.displayName}</span>
                                  </div>
                                  <div className="shopping-item-controls">
                                    <button
                                      className="shopping-qty-button"
                                      type="button"
                                      onClick={() => adjustItemOccurrences(item, -1)}
                                      aria-label={`Reducir cantidad de ${item.displayName}`}
                                    >
                                      <MinusIcon />
                                    </button>
                                    <span className="shopping-item-amount">{Math.max(1, Number(item.occurrences || 1))}</span>
                                    <button
                                      className="shopping-qty-button"
                                      type="button"
                                      onClick={() => adjustItemOccurrences(item, 1)}
                                      aria-label={`Aumentar cantidad de ${item.displayName}`}
                                    >
                                      <PlusIcon />
                                    </button>
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </>
              )}
            </div>
          ) : null}

          {tab === "purchased" ? (
            <div className="shopping-categories">
              {!Array.isArray(purchasedByStoreDay) ? (
                <div className="shopping-empty-state"><EmptyStateIcon /><h4>No se pudo cargar la lista.</h4></div>
              ) : purchasedByStoreDay.length === 0 ? (
                <div className="shopping-empty-state"><EmptyHistoryIcon /><h4>No hay nada comprado esta semana.</h4></div>
              ) : purchasedByStoreDay.map((group) => (
                <div className="shopping-category-card shopping-purchased-card" key={`${group.purchasedDate}-${group.storeId || "none"}`}>
                  <div className="shopping-purchased-card-head">
                    <div className="shopping-purchased-card-meta">
                      <span className="shopping-trip-date">{formatTripDate(group.purchasedDate)}</span>
                      <span className="shopping-purchased-by"> · por {group.purchasedByName || "Usuario"}</span>
                      {group.sessionAmount != null ? (
                        editingGroupSessionId === group.purchaseSessionId ? (
                          <form
                            className="shopping-trip-amount-form"
                            onSubmit={(e) => { e.preventDefault(); void saveGroupAmount(group); }}
                          >
                            <input
                              className="kitchen-input shopping-trip-amount-input"
                              type="number"
                              min="0"
                              step="0.01"
                              inputMode="decimal"
                              value={editingGroupAmount}
                              onChange={(e) => setEditingGroupAmount(e.target.value)}
                              onKeyDown={(e) => { if (e.key === "Escape") setEditingGroupSessionId(null); }}
                              autoFocus
                            />
                            <button type="submit" className="shopping-trip-amount-save" aria-label="Guardar">✓</button>
                            <button type="button" className="shopping-trip-amount-cancel" aria-label="Cancelar" onClick={() => setEditingGroupSessionId(null)}>✕</button>
                          </form>
                        ) : (
                          <button
                            type="button"
                            className="shopping-trip-amount"
                            onClick={() => { setEditingGroupSessionId(group.purchaseSessionId); setEditingGroupAmount(String(group.sessionAmount ?? "")); }}
                            title="Editar importe"
                          >
                            {formatCurrency(group.sessionAmount)}
                            <PencilIcon className="shopping-trip-amount-pencil" />
                          </button>
                        )
                      ) : null}
                    </div>
                    <div className="shopping-purchased-card-controls">
                      <select
                        className="kitchen-select shopping-group-store-select"
                        value={group.storeId || ""}
                        onChange={(event) => {
                          const val = event.target.value;
                          if (val === "__add__") { void createStoreFromDropdown(); return; }
                          void updateGroupStore(group, val || null);
                        }}
                      >
                        <option value="">Sin supermercado</option>
                        {stores.map((store) => (
                          <option key={store._id} value={store._id}>{store.name}</option>
                        ))}
                        <option value="__add__">Añadir supermercado…</option>
                      </select>
                      {budgetFeatureEnabled && group.purchaseSessionId && group.sessionAmount == null ? (
                        <button
                          type="button"
                          className="kitchen-button is-small"
                          onClick={() => openPurchaseConfirmModal({
                            id: group.purchaseSessionId,
                            itemCount: group.items.length,
                            storeId: group.storeId || null,
                            storeName: group.storeName || null,
                            weekStart: group.purchasedDate,
                            items: group.items.map((item) => ({ name: item.name || item.displayName || item.canonicalName || "—", occurrences: Number(item.occurrences) || 1 }))
                          })}
                        >
                          Confirmar gasto
                        </button>
                      ) : null}
                    </div>
                  </div>
                  <div className="shopping-items-list shopping-items-list-purchased">
                    {group.items.map((item) => {
                      const key = itemKey(item);
                      return (
                        <div className={`shopping-item purchased ${transitioningItemKey === key ? "is-leaving" : ""} ${recentlyMovedItemKey === key ? "is-entering" : ""}`} key={key}>
                          <button className="shopping-check is-checked" type="button" onClick={() => setItemStatus(item, "pending")}><span className="shopping-check-dot">✓</span></button>
                          <span className="shopping-item-text">{item.displayName}</span>
                          {item.occurrences > 1 ? <span className="shopping-item-amount">x{item.occurrences}</span> : null}
                          <button className="shopping-remove-item" type="button" onClick={() => removeItem(item)} aria-label={`Eliminar ${item.displayName}`} title="Eliminar">
                            <MinusIcon />
                          </button>
                        </div>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          ) : null}

          {tab === "sessions" ? (
            <div className="shopping-categories">
              {sessionsTabBusy ? (
                <div className="shopping-empty-state"><span className="kitchen-muted">Cargando compras pendientes…</span></div>
              ) : sessionsTabError ? (
                <div className="kitchen-alert error">{sessionsTabError}</div>
              ) : allPendingSessions.length === 0 ? (
                <div className="shopping-empty-state"><EmptyCheckIcon /><h4>No hay compras pendientes de confirmar.</h4></div>
              ) : (
                <div className="shopping-session-cards">
                  {allPendingSessions.map((session) => (
                    <div className="shopping-session-card" key={session.id}>
                      <div className="shopping-session-card-header">
                        <div className="shopping-session-card-info">
                          <strong className="shopping-session-card-title">
                            {session.weekStart ? `Semana del ${formatTripDate(session.weekStart)}` : "Sin fecha"}
                          </strong>
                          <span className="shopping-session-card-sub">
                            {session.itemCount} producto{session.itemCount !== 1 ? "s" : ""}
                            {session.storeName ? ` · ${session.storeName}` : " · Sin supermercado"}
                          </span>
                        </div>
                        <button
                          type="button"
                          className="kitchen-button is-small"
                          onClick={() => openPurchaseConfirmModal(session)}
                        >
                          Confirmar gasto
                        </button>
                      </div>
                      {session.items?.length > 0 ? (
                        <div className="shopping-session-card-items">
                          {session.items.map((item, idx) => (
                            <span key={idx} className="shopping-session-item-chip">
                              {item.name}{item.occurrences > 1 ? ` ×${item.occurrences}` : ""}
                            </span>
                          ))}
                        </div>
                      ) : null}
                    </div>
                  ))}
                </div>
              )}
            </div>
          ) : null}
          </div>{/* end shopping-week-content */}
        </div>
      </div>
      <ModalSheet
        open={leavePromptOpen}
        title="Compra pendiente"
        onClose={closeLeavePrompt}
        actions={(
          <>
            <button type="button" className="kitchen-button secondary" onClick={closeLeavePrompt}>
              Cancelar
            </button>
            <button type="button" className="kitchen-button secondary" onClick={leavePurchasePending}>
              Dejar pendiente
            </button>
            <button type="button" className="kitchen-button" onClick={confirmPurchaseBeforeLeaving}>
              Confirmar
            </button>
          </>
        )}
      >
        <div className="shopping-confirm-sheet">
          <p className="kitchen-muted">
            ¿Quieres confirmar esta compra ahora?
          </p>
          <p className="kitchen-muted">
            Si sales ahora, la compra quedará pendiente y los productos seguirán como comprados.
          </p>
        </div>
      </ModalSheet>
      <ModalSheet
        open={purchaseConfirmOpen}
        title="Confirmar compra"
        onClose={closePurchaseConfirmModal}
        actions={(
          <>
            <button type="button" className="kitchen-button secondary" onClick={postponePurchaseConfirmation} disabled={purchaseConfirmBusy}>
              Ahora no
            </button>
            <button type="button" className="kitchen-button" onClick={completePendingPurchase} disabled={purchaseConfirmBusy || !purchaseConfirmAmount.trim()}>
              {purchaseConfirmBusy ? "Guardando..." : "Guardar compra"}
            </button>
          </>
        )}
      >
        <div className="shopping-confirm-sheet">
          {purchaseConfirmTarget?.weekStart ? (
            <p className="shopping-confirm-week-label">
              {formatWeekLabel(purchaseConfirmTarget.weekStart)}
            </p>
          ) : null}
          {Array.isArray(purchaseConfirmTarget?.items) && purchaseConfirmTarget.items.length > 0 ? (
            <div className="shopping-confirm-items">
              {purchaseConfirmTarget.items.map((item, idx) => (
                <span key={idx} className="shopping-session-item-chip">
                  {item.name}{item.occurrences > 1 ? <span className="shopping-session-chip-count"> ×{item.occurrences}</span> : null}
                </span>
              ))}
            </div>
          ) : (
            <p className="kitchen-muted shopping-confirm-item-count">
              {purchaseConfirmTarget?.itemCount || 0} productos marcados como comprados.
            </p>
          )}
          <label className="kitchen-field">
            <span className="kitchen-label">Supermercado</span>
            <select
              className="kitchen-select"
              value={purchaseConfirmStoreId}
              onChange={(event) => {
                const value = event.target.value;
                if (value === "__add__") {
                  void createStoreFromDropdown();
                  return;
                }
                setPurchaseConfirmStoreId(value);
              }}
              disabled={purchaseConfirmBusy}
            >
              <option value="">Seleccionar supermercado</option>
              {stores.map((store) => (
                <option key={store._id} value={store._id}>{store.name}</option>
              ))}
              <option value="__add__">Añadir supermercado…</option>
            </select>
          </label>
          <label className="kitchen-field">
            <span className="kitchen-label">Importe</span>
            <input
              className="kitchen-input"
              type="number"
              min="0"
              step="0.01"
              inputMode="decimal"
              value={purchaseConfirmAmount}
              onChange={(event) => setPurchaseConfirmAmount(event.target.value)}
              placeholder="0,00"
              disabled={purchaseConfirmBusy}
            />
          </label>
        </div>
      </ModalSheet>
      {quickCreateOpen ? (
        <div className="kitchen-modal-backdrop" role="presentation" onClick={closeQuickCreateModal}>
          <div
            className="kitchen-modal shopping-ingredient-create-modal"
            role="dialog"
            aria-modal="true"
            aria-label="Crear ingrediente"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="kitchen-modal-header">
              <h3>Crear ingrediente</h3>
              <p className="kitchen-muted">Elige la categoría antes de añadirlo a la lista.</p>
            </div>
            <label className="kitchen-field">
              <span className="kitchen-label">Ingrediente</span>
              <input
                className="kitchen-input"
                value={quickCreateName}
                onChange={(event) => setQuickCreateName(event.target.value)}
                disabled={quickBusy}
              />
            </label>
            <label className="kitchen-field">
              <span className="kitchen-label">Categoría</span>
              <div className="shopping-modal-category-field" ref={quickCategoryFieldRef}>
                <input
                  className="kitchen-input shopping-modal-category-input"
                  value={quickCategorySearch}
                  onChange={(event) => {
                    setQuickCategorySearch(event.target.value);
                    setQuickCategoryMenuOpen(true);
                  }}
                  onFocus={() => setQuickCategoryMenuOpen(true)}
                  placeholder={selectedQuickCategory ? selectedQuickCategory.name : "Buscar o seleccionar categoría"}
                  disabled={quickBusy}
                  aria-expanded={quickCategoryMenuOpen}
                  aria-haspopup="listbox"
                />
              </div>
            </label>
            <div className="kitchen-modal-actions">
              <button
                type="button"
                className="kitchen-button secondary"
                onClick={closeQuickCreateModal}
                disabled={quickBusy}
              >
                <CloseIcon /> Cancelar
              </button>
              <button
                type="button"
                className="kitchen-button"
                onClick={handleQuickCreate}
                disabled={quickBusy || !quickCreateName.trim() || !quickCategoryId}
              >
                <ConfirmIcon /> {quickBusy ? "Guardando..." : "Crear"}
              </button>
            </div>
          </div>
        </div>
      ) : null}
      {quickCreateOpen && quickCategoryMenuOpen && quickCategoryMenuPosition ? createPortal(
        <div
          ref={quickCategoryMenuRef}
          className={`shopping-modal-category-menu is-floating ${quickCategoryMenuPosition.placement === "top" ? "is-above" : ""}`}
          role="listbox"
          aria-label="Categorías"
          style={{
            left: quickCategoryMenuPosition.left,
            width: quickCategoryMenuPosition.width,
            top: quickCategoryMenuPosition.top,
            bottom: quickCategoryMenuPosition.bottom,
            maxHeight: quickCategoryMenuPosition.maxHeight
          }}
        >
          {filteredQuickCategories.length ? filteredQuickCategories.map((category) => {
            const isSelected = category._id === quickCategoryId;
            return (
              <button
                key={category._id}
                type="button"
                className={`shopping-modal-category-option ${isSelected ? "is-selected" : ""}`}
                onClick={() => {
                  setQuickCategoryId(category._id);
                  setQuickCategorySearch(category.name);
                  setQuickCategoryMenuOpen(false);
                }}
              >
                {category.name}
              </button>
            );
          }) : (
            <div className="shopping-modal-category-empty">No hay categorías que coincidan.</div>
          )}
        </div>,
        document.body
      ) : null}

      {basicsPopupOpen && (
        <BasicsPopup
          weekStart={weekStart}
          plan={user}
          currentPendingCanonicals={currentPendingCanonicals}
          currentPendingIngredientIds={currentPendingIngredientIds}
          onClose={() => setBasicsPopupOpen(false)}
          onBasicCreated={() => notifyWeekly("basic_created")}
          onApplied={({ addedCount }) => {
            setBasicsPopupOpen(false);
            if (addedCount > 0) {
              void loadList({ silent: true });
              clearTimeout(basicsToastTimerRef.current);
              setBasicsToast(`${addedCount} básico${addedCount !== 1 ? "s" : ""} añadido${addedCount !== 1 ? "s" : ""} a la lista ✓`);
              basicsToastTimerRef.current = setTimeout(() => setBasicsToast(""), 5000);
              // Weekly challenge: basics added to shopping list
              notifyWeekly("basic_added_to_list");
            }
          }}
        />
      )}
      {basicsToast ? (
        <div className="basics-toast" role="status" aria-live="polite" onClick={() => setBasicsToast("")}>
          {basicsToast}
        </div>
      ) : null}

      {/* Budget breakdown modal */}
      {budgetModalOpen ? (
        <div className="shopping-budget-modal-backdrop" role="presentation" onClick={() => setBudgetModalOpen(false)}>
          <div
            className="shopping-budget-modal"
            role="dialog"
            aria-modal="true"
            aria-label="Desglose del presupuesto"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="shopping-budget-modal-header">
              <h3 className="shopping-budget-modal-title">Presupuesto semanal</h3>
              <button
                type="button"
                className="shopping-budget-modal-close"
                onClick={() => setBudgetModalOpen(false)}
                aria-label="Cerrar"
              >
                <CloseIcon style={{ width: 18, height: 18 }} />
              </button>
            </div>
            <div className="shopping-budget-row">
              <button type="button" className="shopping-budget-card shopping-budget-card-button" onClick={() => { setBudgetModalOpen(false); openWeeklyBudgetPanel(); }}>
                <span className="shopping-budget-label">Budget semanal</span>
                <strong className="shopping-budget-amount">{formatCurrency(budget?.weeklyBudget)}</strong>
              </button>
              <button type="button" className="shopping-budget-card shopping-budget-card-button shopping-budget-card--spent" onClick={() => { setBudgetModalOpen(false); openWeeklyBudgetPanel(); }}>
                <span className="shopping-budget-label">Gastado esta semana</span>
                <strong className="shopping-budget-amount">{formatCurrency(budget?.spent)}</strong>
              </button>
              <button type="button" className="shopping-budget-card shopping-budget-card-button shopping-budget-card--available" onClick={() => { setBudgetModalOpen(false); openWeeklyBudgetPanel(); }}>
                <span className="shopping-budget-label">Disponible</span>
                <strong className="shopping-budget-amount">{formatCurrency(budget?.available)}</strong>
              </button>
            </div>
          </div>
        </div>
      ) : null}
      {addItemToasts.length > 0 ? createPortal(
        <div className="shopping-toast-stack" aria-live="polite" aria-atomic="false">
          {addItemToasts.map((toast) => (
            <div key={toast.id} className="shopping-added-toast">
              <Check size={15} className="shopping-toast-icon" />
              <span>«{toast.name}» añadido a la lista</span>
            </div>
          ))}
        </div>,
        document.body
      ) : null}
    </KitchenLayout>
  );
}
