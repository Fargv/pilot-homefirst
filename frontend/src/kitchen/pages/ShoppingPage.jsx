import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import KitchenLayout from "../Layout.jsx";
import { ApiRequestError, apiRequest } from "../api.js";
import { useAuth } from "../auth";
import { useActiveWeek } from "../weekContext.jsx";
import WeekNavigator from "../components/ui/WeekNavigator.jsx";

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
      <path d="M8 3.5v2.2M16 3.5v2.2M4.5 9h15" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
      <rect x="4.5" y="5.8" width="15" height="14.7" rx="2.4" stroke="currentColor" strokeWidth="1.7" />
      <circle cx="12" cy="14" r="2.1" fill="currentColor" />
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

function addDaysToISO(iso, days) {
  const date = new Date(`${iso}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function normalizeWeekStartInput(value) {
  if (!value) return "";
  const d = new Date(`${value}T00:00:00Z`);
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
  return new Date(`${iso}T00:00:00Z`).toLocaleDateString("es-ES", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric"
  });
}

function formatTripDate(value) {
  if (!value || value === "sin-fecha") return "Sin fecha";
  return new Date(`${value}T00:00:00Z`).toLocaleDateString("es-ES", { day: "2-digit", month: "2-digit", year: "numeric" });
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

export default function ShoppingPage() {
  const { user } = useAuth();
  const { activeWeek: weekStart, setActiveWeek: setWeekStart } = useActiveWeek();
  const [tab, setTab] = useState("pending");
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [stores, setStores] = useState([]);
  const [selectedStoreId, setSelectedStoreId] = useState("");
  const selectedStoreRef = useRef("");
  const [pendingByCategory, setPendingByCategory] = useState(null);
  const [purchasedByStoreDay, setPurchasedByStoreDay] = useState(null);
  const [transitioningItemKey, setTransitioningItemKey] = useState(null);
  const [recentlyMovedItemKey, setRecentlyMovedItemKey] = useState(null);
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
  const quickInputRef = useRef(null);
  const quickCategoryFieldRef = useRef(null);
  const quickCategoryMenuRef = useRef(null);
  const isDiodGlobalMode = user?.globalRole === "diod" && !user?.activeHouseholdId;
  const isCurrentWeek = weekStart === getCurrentWeekStart();

  const handleJumpToCurrentWeek = useCallback(() => {
    setWeekStart(getCurrentWeekStart());
  }, [setWeekStart]);

  const applyPayload = (data) => {
    setStores(data.stores || []);
    setPendingByCategory(data.pendingByCategory || []);
    setPurchasedByStoreDay(data.purchasedByStoreDay || []);
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

  const loadList = async ({ silent = false } = {}) => {
    if (isDiodGlobalMode) return;
    if (!silent) setIsRefreshing(true);
    setError("");
    try {
      const data = await apiRequest(`/api/kitchen/shopping/${weekStart}`);
      applyPayload(data);
    } catch (err) {
      logShoppingApiError("loadList", `/api/kitchen/shopping/${weekStart}`, err);
      setPendingByCategory(null);
      setPurchasedByStoreDay(null);
      setError(err.message || "No se pudo cargar la lista.");
    } finally {
      if (!silent) setIsRefreshing(false);
    }
  };

  useEffect(() => {
    void loadList();
  }, [weekStart, isDiodGlobalMode]);

  useEffect(() => {
    if (!recentlyMovedItemKey) return undefined;
    const timer = setTimeout(() => setRecentlyMovedItemKey(null), 650);
    return () => clearTimeout(timer);
  }, [recentlyMovedItemKey]);

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

  const refreshList = async () => {
    if (isDiodGlobalMode) return;
    setIsRefreshing(true);
    try {
      const data = await apiRequest(`/api/kitchen/shopping/${weekStart}/rebuild`, { method: "POST" });
      applyPayload(data);
      setSuccess("Lista reconstruida");
    } catch (err) {
      logShoppingApiError("refreshList", `/api/kitchen/shopping/${weekStart}/rebuild`, err);
      setError(err.message || "No se pudo refrescar la lista.");
    } finally {
      setIsRefreshing(false);
    }
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
      setSuccess(`Creado y añadido: ${ingredient.name}`);
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

  const setItemStatus = async (item, status) => {
    if (isDiodGlobalMode) return;
    const key = itemKey(item);
    setTransitioningItemKey(key);
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

  const pendingCount = useMemo(() => {
    if (!Array.isArray(pendingByCategory)) return null;
    return pendingByCategory.reduce((acc, group) => acc + (group.items?.length || 0), 0);
  }, [pendingByCategory]);

  const purchasedCount = useMemo(() => {
    if (!Array.isArray(purchasedByStoreDay)) return null;
    return purchasedByStoreDay.reduce((acc, group) => acc + (group.items?.length || 0), 0);
  }, [purchasedByStoreDay]);

  const hasExactSuggestion = quickSuggestions.some((item) => normalizeQuery(item.name) === normalizeQuery(quickQuery));
  const selectedQuickCategory = useMemo(
    () => quickCategories.find((category) => category._id === quickCategoryId) || null,
    [quickCategories, quickCategoryId]
  );
  const filteredQuickCategories = useMemo(() => {
    const normalizedSearch = normalizeQuery(quickCategorySearch);
    if (!normalizedSearch) return quickCategories;
    return quickCategories.filter((category) => normalizeQuery(category.name).includes(normalizedSearch));
  }, [quickCategories, quickCategorySearch]);

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
            <div className="shopping-header-row">
              <div className="shopping-header-title">
                <h1>Lista de la compra</h1>
                <button className="shopping-refresh-icon" type="button" onClick={refreshList} disabled={isRefreshing} aria-label="Reconstruir lista" title="Reconstruir lista">
                  <RefreshIcon className="shopping-week-arrow-icon" />
                </button>
              </div>
            </div>

            <div className="shopping-header-week-row">
              <div className="kitchen-week-nav-row shopping-week-nav-row">
                <WeekNavigator
                  className="shopping-week-nav shopping-week-header-navigator"
                  value={weekStart}
                  onChange={(nextValue) => setWeekStart(normalizeWeekStartInput(nextValue))}
                  onPrevious={() => setWeekStart((prev) => addDaysToISO(prev, -7))}
                  onNext={() => setWeekStart((prev) => addDaysToISO(prev, 7))}
                />
                {!isCurrentWeek ? (
                  <button
                    type="button"
                    className="kitchen-week-now-button shopping-week-now-button"
                    onClick={handleJumpToCurrentWeek}
                    aria-label="Volver a hoy"
                    title="Volver a hoy"
                  >
                    <TodayIcon className="kitchen-week-now-icon" />
                    <span>Hoy</span>
                  </button>
                ) : null}
              </div>
            </div>

            <div className="shopping-header-tabs-row">
              <div className="kitchen-dishes-tabs shopping-tabs-inline" role="tablist" aria-label="Estado de la compra">
                <button className={`kitchen-tab-button ${tab === "pending" ? "is-active" : ""}`} onClick={() => setTab("pending")}>Pendiente ({pendingCount === null ? "—" : pendingCount})</button>
                <button className={`kitchen-tab-button ${tab === "purchased" ? "is-active" : ""}`} onClick={() => setTab("purchased")}>Comprado</button>
              </div>
            </div>

            {tab === "pending" ? (
              <div className="shopping-header-input-row">
                <div className="shopping-header-store-col">
                  <select
                    className="kitchen-select shopping-store-select"
                    value={selectedStoreId}
                    onChange={(event) => {
                      const value = event.target.value;
                      if (value === "__add__") {
                        void createStoreFromDropdown();
                        return;
                      }
                      selectedStoreRef.current = value;
                      setSelectedStoreId(value);
                    }}
                  >
                    <option value="">Supermercado (opcional)</option>
                    {stores.map((store) => (
                      <option key={store._id} value={store._id}>{store.name}</option>
                    ))}
                    <option value="__add__">Añadir supermercado…</option>
                  </select>
                </div>

                <div className="shopping-header-quick-col">
                  <div className="shopping-quick-add shopping-quick-add-header" role="region" aria-label="Añadir ingrediente rápido">
                    <div className="shopping-quick-add-row">
                      <input
                        ref={quickInputRef}
                        className="kitchen-input shopping-quick-add-input"
                        value={quickQuery}
                        onChange={(event) => setQuickQuery(event.target.value)}
                        placeholder="Añadir ingrediente a la lista..."
                      />
                    </div>
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
                </div>
              </div>
            ) : null}
          </div>
          {(success || error) ? (
            <div className="shopping-toolbar-alerts" aria-live="polite">
              {success ? <div className="kitchen-alert success shopping-toolbar-alert">{success}</div> : null}
              {error ? <div className="kitchen-alert error shopping-toolbar-alert">{error}</div> : null}
            </div>
          ) : null}

          {tab === "pending" ? (
            <div className="shopping-categories">
              <div className="shopping-bulk-actions">
                <button className="kitchen-button ghost shopping-bulk-button" type="button" onClick={() => setAllItemsStatus("purchased")}>Marcar todo como comprado</button>
              </div>
              {!Array.isArray(pendingByCategory) ? (
                <div className="shopping-empty-state"><EmptyStateIcon /><h4>No se pudo cargar la lista.</h4></div>
              ) : pendingByCategory.length === 0 ? (
                <div className="shopping-empty-state">
                  {purchasedCount ? <EmptyCheckIcon /> : <EmptyListIcon />}
                  <h4>{purchasedCount ? "Todo comprado por esta semana." : "No hay nada por comprar todavía."}</h4>
                </div>
              ) : pendingByCategory.map((group) => {
                const category = { name: group.categoryInfo?.name || "Sin categoría", ...slugColor(group.categoryInfo?.slug), ...group.categoryInfo };
                return (
                  <div className="shopping-category-card" key={group.categoryId || group.categoryInfo?.slug || group.categoryInfo?.name} style={{ "--category-bg": category.colorBg, "--category-text": category.colorText }}>
                    <div className="shopping-category-head"><h4>{category.name.toUpperCase()}</h4><span className="shopping-category-count">{group.items.length} items</span></div>
                    <div className="shopping-items-list">
                      {group.items.map((item) => {
                        const key = itemKey(item);
                        return (
                          <div className={`shopping-item ${transitioningItemKey === key ? "is-leaving" : ""}`} key={key}>
                            <button className="shopping-check" type="button" onClick={() => setItemStatus(item, "purchased")}><span className="shopping-check-dot">✓</span></button>
                            <span className="shopping-item-text">{item.displayName}</span>
                            <div className="shopping-item-controls">
                              <button
                                className="shopping-qty-button shopping-remove-item"
                                type="button"
                                onClick={() => adjustItemOccurrences(item, -1)}
                                aria-label={`Reducir cantidad de ${item.displayName}`}
                                title="Reducir"
                              >
                                <MinusIcon />
                              </button>
                              <span className="shopping-item-amount">x{Math.max(1, Number(item.occurrences || 1))}</span>
                              <button
                                className="shopping-qty-button"
                                type="button"
                                onClick={() => adjustItemOccurrences(item, 1)}
                                aria-label={`Aumentar cantidad de ${item.displayName}`}
                                title="Aumentar"
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
          ) : (
            <div className="shopping-categories">
              <div className="shopping-bulk-actions">
                <button
                  className="kitchen-button ghost shopping-bulk-button"
                  type="button"
                  onClick={() => {
                    if (window.confirm("¿Desmarcar todo lo comprado de esta semana?")) {
                      void setAllItemsStatus("pending");
                    }
                  }}
                >
                  Desmarcar todo
                </button>
              </div>
              {!Array.isArray(purchasedByStoreDay) ? (
                <div className="shopping-empty-state"><EmptyStateIcon /><h4>No se pudo cargar la lista.</h4></div>
              ) : purchasedByStoreDay.length === 0 ? (
                <div className="shopping-empty-state"><EmptyHistoryIcon /><h4>No hay nada comprado esta semana.</h4></div>
              ) : purchasedByStoreDay.map((group) => (
                <div className="shopping-category-card shopping-purchased-card" key={`${group.purchasedDate}-${group.storeId || "none"}`}>
                  <h4>Comprado por <span>{group.purchasedByName || "Usuario"}</span> · <em>{group.storeName || "Sin supermercado"}</em> · {formatTripDate(group.purchasedDate)}</h4>
                  <div className="shopping-items-list shopping-items-list-purchased">
                    {group.items.map((item) => {
                      const key = itemKey(item);
                      return (
                        <div className={`shopping-item purchased ${transitioningItemKey === key ? "is-leaving" : ""} ${recentlyMovedItemKey === key ? "is-entering" : ""}`} key={key}>
                          <button className="shopping-check is-checked" type="button" onClick={() => setItemStatus(item, "pending")}><span className="shopping-check-dot">✓</span></button>
                          <span className="shopping-item-text">{item.displayName}</span>
                          {item.occurrences > 1 ? <span className="shopping-item-amount">x{item.occurrences}</span> : null}
                          <select className="kitchen-select shopping-store-select-compact" value={item.storeId || ""} onChange={(event) => updatePurchasedItemStore(item, event.target.value)}>
                            <option value="">Sin supermercado</option>
                            {stores.map((store) => (
                              <option key={store._id} value={store._id}>{store.name}</option>
                            ))}
                          </select>
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
          )}
        </div>
      </div>
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
    </KitchenLayout>
  );
}
