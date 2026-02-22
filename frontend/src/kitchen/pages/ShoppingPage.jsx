import React, { useEffect, useMemo, useRef, useState } from "react";
import KitchenLayout from "../Layout.jsx";
import { ApiRequestError, apiRequest } from "../api.js";
import { useAuth } from "../auth";
import { useActiveWeek } from "../weekContext.jsx";

function ChevronIcon(props) {
  return (
    <svg viewBox="0 0 20 20" fill="none" aria-hidden="true" {...props}>
      <path d="M11.75 4.5 6.25 10l5.5 5.5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function RefreshIcon(props) {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true" {...props}>
      <path d="M20 12a8 8 0 1 1-2.343-5.657" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/>
      <path d="M20 4v4h-4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
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
  return `${item.ingredientId || "no-id"}-${item.canonicalName}`;
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
  const isDiodGlobalMode = user?.globalRole === "diod" && !user?.activeHouseholdId;

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

  const assignStoreToTodayUnassigned = async () => {
    try {
      const data = await apiRequest(`/api/kitchen/shopping/${weekStart}/purchased/assign-store`, {
        method: "POST",
        body: JSON.stringify({ storeId: selectedStoreId || null })
      });
      applyPayload(data);
      setSuccess(data.updated ? "Supermercado asignado" : "No había comprados de hoy sin supermercado");
    } catch (err) {
      logShoppingApiError("assignStoreToTodayUnassigned", `/api/kitchen/shopping/${weekStart}/purchased/assign-store`, err);
      setError(err.message || "No se pudo asignar supermercado en bloque.");
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
              <div>
                <h1>Lista de la compra · Semana {formatWeekTitle(weekStart)}</h1>
              </div>
              <button className="shopping-refresh-icon" type="button" onClick={refreshList} disabled={isRefreshing} aria-label="Reconstruir lista" title="Reconstruir lista">
                <RefreshIcon className="shopping-week-arrow-icon" />
              </button>
            </div>

            <div className="shopping-week-nav">
              <button className="shopping-week-arrow" type="button" onClick={() => setWeekStart((prev) => addDaysToISO(prev, -7))}><ChevronIcon className="shopping-week-arrow-icon" /></button>
              <input className="kitchen-input" type="date" value={weekStart} onChange={(event) => setWeekStart(normalizeWeekStartInput(event.target.value))} />
              <button className="shopping-week-arrow" type="button" onClick={() => setWeekStart((prev) => addDaysToISO(prev, 7))}><ChevronIcon className="shopping-week-arrow-icon is-next" /></button>
            </div>

            <div className="shopping-toolbar">
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
              <button className="kitchen-button ghost shopping-assign-button" type="button" onClick={assignStoreToTodayUnassigned}>Asignar a comprados sin supermercado</button>
            </div>
            {success ? <div className="kitchen-alert success">{success}</div> : null}
            {error ? <div className="kitchen-alert error">{error}</div> : null}
          </div>

          <div className="kitchen-dishes-tabs" role="tablist" aria-label="Estado de la compra">
            <button className={`kitchen-tab-button ${tab === "pending" ? "is-active" : ""}`} onClick={() => setTab("pending")}>Pendiente ({pendingCount === null ? "—" : pendingCount})</button>
            <button className={`kitchen-tab-button ${tab === "purchased" ? "is-active" : ""}`} onClick={() => setTab("purchased")}>Comprado</button>
          </div>

          {tab === "pending" ? (
            <div className="shopping-categories">
              {!Array.isArray(pendingByCategory) ? (
                <div className="shopping-empty-state"><EmptyStateIcon /><h4>No se pudo cargar la lista.</h4></div>
              ) : pendingByCategory.length === 0 ? (
                <div className="shopping-empty-state"><EmptyStateIcon /><h4>Todo listo por esta semana.</h4></div>
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
                          {item.occurrences > 1 ? <span className="shopping-item-amount">x{item.occurrences}</span> : null}
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
              {!Array.isArray(purchasedByStoreDay) ? (
                <div className="shopping-empty-state"><EmptyStateIcon /><h4>No se pudo cargar la lista.</h4></div>
              ) : purchasedByStoreDay.length === 0 ? (
                <div className="shopping-empty-state"><EmptyStateIcon /><h4>Aún no hay ingredientes comprados.</h4></div>
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
    </KitchenLayout>
  );
}
