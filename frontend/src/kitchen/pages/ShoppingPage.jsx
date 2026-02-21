import React, { useEffect, useMemo, useState } from "react";
import KitchenLayout from "../Layout.jsx";
import { apiRequest } from "../api.js";
import { useAuth } from "../auth";

function ChevronIcon(props) {
  return (
    <svg viewBox="0 0 20 20" fill="none" aria-hidden="true" {...props}>
      <path d="M11.75 4.5 6.25 10l5.5 5.5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function getMondayISO(date = new Date()) {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const day = d.getUTCDay();
  const diff = (day === 0 ? -6 : 1) - day;
  d.setUTCDate(d.getUTCDate() + diff);
  return d.toISOString().slice(0, 10);
}

function addDaysToISO(iso, days) {
  const date = new Date(`${iso}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function normalizeWeekStartInput(value) {
  if (!value) return getMondayISO();
  return getMondayISO(new Date(`${value}T00:00:00Z`));
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
  if (!value) return "";
  return new Date(value).toLocaleDateString("es-ES", { day: "2-digit", month: "2-digit", year: "numeric" });
}

function formatAmount(value) {
  if (value === null || value === undefined || value === "") return "";
  return `${Number(value).toFixed(2)} €`;
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
  const [weekStart, setWeekStart] = useState(getMondayISO());
  const [tab, setTab] = useState("pending");
  const [error, setError] = useState("");
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [stores, setStores] = useState([]);
  const [activeTrip, setActiveTrip] = useState(null);
  const [pendingByCategory, setPendingByCategory] = useState([]);
  const [purchasedByTrip, setPurchasedByTrip] = useState([]);
  const [transitioningItemKey, setTransitioningItemKey] = useState(null);
  const [recentlyMovedItemKey, setRecentlyMovedItemKey] = useState(null);
  const isDiodGlobalMode = user?.globalRole === "diod" && !user?.activeHouseholdId;

  const applyPayload = (data) => {
    setStores(data.stores || []);
    setActiveTrip(data.activeTrip || null);
    setPendingByCategory(data.pendingByCategory || []);
    setPurchasedByTrip(data.purchasedByTrip || []);
  };

  const loadList = async ({ silent = false } = {}) => {
    if (isDiodGlobalMode) return;
    if (!silent) setIsRefreshing(true);
    setError("");
    try {
      const data = await apiRequest(`/api/kitchen/shopping/${weekStart}`);
      applyPayload(data);
    } catch (err) {
      setError(err.message || "No se pudo cargar la lista.");
    } finally {
      if (!silent) setIsRefreshing(false);
    }
  };

  useEffect(() => {
    loadList();
  }, [weekStart, isDiodGlobalMode]);

  useEffect(() => {
    if (isDiodGlobalMode) return undefined;
    const pollId = setInterval(() => loadList({ silent: true }), 15000);
    return () => clearInterval(pollId);
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
    } catch (err) {
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
        body: JSON.stringify({ canonicalName: item.canonicalName, ingredientId: item.ingredientId, status })
      });
      applyPayload(data);
      setRecentlyMovedItemKey(key);
    } catch (err) {
      setError(err.message || "No se pudo actualizar.");
    } finally {
      setTransitioningItemKey(null);
    }
  };

  const updateTrip = async (payload) => {
    if (isDiodGlobalMode) return;
    try {
      const data = await apiRequest("/api/kitchen/shopping/trip/active", {
        method: "PUT",
        body: JSON.stringify(payload)
      });
      setActiveTrip(data.activeTrip || null);
      await loadList({ silent: true });
    } catch (err) {
      setError(err.message || "No se pudo actualizar la compra activa.");
    }
  };

  const closeTrip = async () => {
    if (!activeTrip) return;
    try {
      await apiRequest("/api/kitchen/shopping/trip/active/close", { method: "POST" });
      await loadList();
    } catch (err) {
      setError(err.message || "No se pudo cerrar la compra.");
    }
  };

  const pendingCount = useMemo(
    () => pendingByCategory.reduce((acc, group) => acc + (group.items?.length || 0), 0),
    [pendingByCategory]
  );

  if (isDiodGlobalMode) {
    return (
      <KitchenLayout>
        <div className="kitchen-card">
          <h3>Selecciona un hogar para ver la lista de la compra</h3>
          <p className="kitchen-muted">En modo global DIOD no hay lista de compra asociada.</p>
        </div>
      </KitchenLayout>
    );
  }

  return (
    <KitchenLayout>
      <div className="kitchen-card shopping-header-card">
        <div className="shopping-header-row">
          <div>
            <h3>Lista de la compra · Semana {formatWeekTitle(weekStart)}</h3>
          </div>
          <button className="shopping-refresh-icon" onClick={refreshList} title="Refrescar" disabled={isRefreshing}>↻</button>
        </div>

        <div className="shopping-week-nav" role="group" aria-label="Cambiar semana de la lista de la compra">
          <button className="shopping-week-arrow" type="button" onClick={() => setWeekStart((prev) => addDaysToISO(prev, -7))}>
            <ChevronIcon className="shopping-week-arrow-icon" />
          </button>
          <input className="kitchen-input" type="date" value={weekStart} onChange={(event) => setWeekStart(normalizeWeekStartInput(event.target.value))} />
          <button className="shopping-week-arrow" type="button" onClick={() => setWeekStart((prev) => addDaysToISO(prev, 7))}>
            <ChevronIcon className="shopping-week-arrow-icon is-next" />
          </button>
        </div>

        <div className="shopping-toolbar">
          <select
            className="kitchen-select"
            value={activeTrip?.storeId || ""}
            onChange={(event) => updateTrip({ storeId: event.target.value || null, totalAmount: activeTrip?.totalAmount ?? null })}
          >
            <option value="">Supermercado (opcional)</option>
            {stores.map((store) => (
              <option key={store._id} value={store._id}>{store.name}</option>
            ))}
          </select>
          <input
            className="kitchen-input"
            type="number"
            min="0"
            step="0.01"
            placeholder="Importe total €"
            value={activeTrip?.totalAmount ?? ""}
            onChange={(event) => updateTrip({ storeId: activeTrip?.storeId || null, totalAmount: event.target.value })}
          />
          {activeTrip ? (
            <button className="kitchen-button secondary" onClick={closeTrip}>Cerrar compra</button>
          ) : null}
        </div>

        <div className="shopping-tabs">
          <button className={`shopping-tab ${tab === "pending" ? "active" : ""}`} onClick={() => setTab("pending")}>🛒 Pendiente ({pendingCount})</button>
          <button className={`shopping-tab ${tab === "purchased" ? "active" : ""}`} onClick={() => setTab("purchased")}>✅ Comprado</button>
        </div>

        {error ? <div style={{ color: "#b42318", marginTop: 8 }}>{error}</div> : null}
      </div>

      {tab === "pending" ? (
        <div className="shopping-categories">
          {pendingByCategory.length === 0 ? (
            <div className="kitchen-card kitchen-empty">
              <h4>No hay pendientes para esta semana.</h4>
            </div>
          ) : (
            pendingByCategory.map((group) => {
              const category = {
                name: group.categoryInfo?.name || "Sin categoría",
                ...slugColor(group.categoryInfo?.slug),
                ...group.categoryInfo
              };

              return (
                <div
                  className="kitchen-card shopping-category-card"
                  key={group.categoryId || group.categoryInfo?.slug || group.categoryInfo?.name}
                  style={{ "--category-bg": category.colorBg, "--category-text": category.colorText }}
                >
                  <div className="shopping-category-head">
                    <h4>{category.name.toUpperCase()}</h4>
                    <span className="shopping-category-count">{group.items.length} items</span>
                  </div>
                  <div className="shopping-items-list">
                    {group.items.map((item) => {
                      const key = itemKey(item);
                      const leaving = transitioningItemKey === key;
                      return (
                        <div className={`shopping-item ${leaving ? "is-leaving" : ""}`} key={key}>
                          <button className="shopping-check" type="button" onClick={() => setItemStatus(item, "purchased")} aria-label={`Marcar ${item.displayName}`}>
                            <span className="shopping-check-dot">✓</span>
                          </button>
                          <span className="shopping-item-text">{item.displayName} {item.occurrences > 1 ? `x${item.occurrences}` : ""}</span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })
          )}
        </div>
      ) : (
        <div className="shopping-categories">
          {purchasedByTrip.length === 0 ? (
            <div className="kitchen-card kitchen-empty">
              <h4>Aún no hay ingredientes comprados.</h4>
            </div>
          ) : (
            purchasedByTrip.map((trip) => (
              <div className="kitchen-card shopping-category-card" key={trip.tripId || `trip-${trip.startedAt}`}>
                <h4>{trip.storeName} · {formatTripDate(trip.startedAt)} {trip.totalAmount !== null ? `· ${formatAmount(trip.totalAmount)}` : ""}</h4>
                <div className="shopping-items-list">
                  {trip.items.map((item) => {
                    const key = itemKey(item);
                    const returning = transitioningItemKey === key;
                    const entering = recentlyMovedItemKey === key;
                    return (
                      <div className={`shopping-item purchased ${returning ? "is-leaving" : ""} ${entering ? "is-entering" : ""}`} key={key}>
                        <button className="shopping-check is-checked" type="button" onClick={() => setItemStatus(item, "pending")} aria-label={`Desmarcar ${item.displayName}`}>
                          <span className="shopping-check-dot">✓</span>
                        </button>
                        <span className="shopping-item-text">
                          {item.displayName} {item.occurrences > 1 ? `x${item.occurrences}` : ""}
                          <small className="kitchen-muted"> · marcado por {item.purchasedByName || "Usuario"} {item.purchasedAt ? new Date(item.purchasedAt).toLocaleTimeString("es-ES", { hour: "2-digit", minute: "2-digit" }) : ""}</small>
                        </span>
                      </div>
                    );
                  })}
                </div>
              </div>
            ))
          )}
        </div>
      )}
    </KitchenLayout>
  );
}
