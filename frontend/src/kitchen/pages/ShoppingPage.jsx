import React, { useEffect, useMemo, useState } from "react";
import KitchenLayout from "../Layout.jsx";
import { apiRequest } from "../api.js";
import { useAuth } from "../auth";
import { useActiveWeek } from "../weekContext.jsx";

function ChevronIcon(props) {
  return (
    <svg viewBox="0 0 20 20" fill="none" aria-hidden="true" {...props}>
      <path d="M11.75 4.5 6.25 10l5.5 5.5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
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
  const { activeWeek: weekStart, setActiveWeek: setWeekStart } = useActiveWeek();
  const [tab, setTab] = useState("pending");
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [stores, setStores] = useState([]);
  const [activeTrip, setActiveTrip] = useState(null);
  const [activeTripPurchasedCount, setActiveTripPurchasedCount] = useState(0);
  const [pendingByCategory, setPendingByCategory] = useState([]);
  const [purchasedByTrip, setPurchasedByTrip] = useState([]);
  const [transitioningItemKey, setTransitioningItemKey] = useState(null);
  const [recentlyMovedItemKey, setRecentlyMovedItemKey] = useState(null);
  const isDiodGlobalMode = user?.globalRole === "diod" && !user?.activeHouseholdId;

  const applyPayload = (data) => {
    setStores(data.stores || []);
    setActiveTrip(data.activeTrip || null);
    setActiveTripPurchasedCount(data.activeTripPurchasedCount || 0);
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
      setError(err.message || "No se pudo crear el supermercado.");
    }
  };

  const canCloseTrip = Boolean(activeTrip) && activeTripPurchasedCount > 0;
  const closeDisabledReason = canCloseTrip ? "" : "Marca algún ítem para cerrar compra";

  const closeTrip = async () => {
    if (!canCloseTrip) return;
    try {
      await apiRequest("/api/kitchen/shopping/trip/active/close", { method: "POST" });
      setSuccess("Compra guardada");
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
        <div className="kitchen-card">Selecciona un hogar activo para ver su lista de la compra.</div>
      </KitchenLayout>
    );
  }

  return (
    <KitchenLayout>
      <div className="kitchen-stack-lg">
        <div className="kitchen-card shopping-header-card">
          <div className="shopping-header-row">
            <div>
              <h3>Lista de la compra · Semana {formatWeekTitle(weekStart)}</h3>
              <p className="kitchen-muted">Marca productos y cierra cada compra para registrar los tickets.</p>
            </div>
            <button className="kitchen-button secondary" type="button" onClick={refreshList} disabled={isRefreshing}>Refrescar</button>
          </div>

          <div className="shopping-week-nav">
            <button className="shopping-week-arrow" type="button" onClick={() => setWeekStart((prev) => addDaysToISO(prev, -7))}><ChevronIcon className="shopping-week-arrow-icon" /></button>
            <input className="kitchen-input" type="date" value={weekStart} onChange={(event) => setWeekStart(normalizeWeekStartInput(event.target.value))} />
            <button className="shopping-week-arrow" type="button" onClick={() => setWeekStart((prev) => addDaysToISO(prev, 7))}><ChevronIcon className="shopping-week-arrow-icon is-next" /></button>
          </div>

          <div className="shopping-toolbar">
            <select
              className="kitchen-select"
              value={activeTrip?.storeId || ""}
              onChange={(event) => {
                const value = event.target.value;
                if (value === "__add__") {
                  void createStoreFromDropdown();
                  return;
                }
                void updateTrip({ storeId: value || null, totalAmount: activeTrip?.totalAmount ?? null });
              }}
            >
              <option value="">Supermercado (opcional)</option>
              {stores.map((store) => (
                <option key={store._id} value={store._id}>{store.name}</option>
              ))}
              <option value="__add__">Añadir supermercado…</option>
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
            <button className="kitchen-button secondary" onClick={closeTrip} disabled={!canCloseTrip} title={closeDisabledReason}>Cerrar compra</button>
          </div>
          {!canCloseTrip ? <p className="kitchen-muted">Marca algún ítem para cerrar compra.</p> : null}
          {success ? <div className="kitchen-alert success">{success}</div> : null}
          {error ? <div className="kitchen-alert error">{error}</div> : null}
        </div>

        <div className="kitchen-dishes-tabs" role="tablist" aria-label="Estado de la compra">
          <button className={`kitchen-tab-button ${tab === "pending" ? "is-active" : ""}`} onClick={() => setTab("pending")}>Pendiente ({pendingCount})</button>
          <button className={`kitchen-tab-button ${tab === "purchased" ? "is-active" : ""}`} onClick={() => setTab("purchased")}>Comprado</button>
        </div>

        {tab === "pending" ? (
          <div className="shopping-categories">
            {pendingByCategory.length === 0 ? (
              <div className="kitchen-card kitchen-empty"><h4>No hay pendientes para esta semana.</h4></div>
            ) : pendingByCategory.map((group) => {
              const category = { name: group.categoryInfo?.name || "Sin categoría", ...slugColor(group.categoryInfo?.slug), ...group.categoryInfo };
              return (
                <div className="kitchen-card shopping-category-card" key={group.categoryId || group.categoryInfo?.slug || group.categoryInfo?.name} style={{ "--category-bg": category.colorBg, "--category-text": category.colorText }}>
                  <div className="shopping-category-head"><h4>{category.name.toUpperCase()}</h4><span className="shopping-category-count">{group.items.length} items</span></div>
                  <div className="shopping-items-list">
                    {group.items.map((item) => {
                      const key = itemKey(item);
                      return (
                        <div className={`shopping-item ${transitioningItemKey === key ? "is-leaving" : ""}`} key={key}>
                          <button className="shopping-check" type="button" onClick={() => setItemStatus(item, "purchased")}><span className="shopping-check-dot">✓</span></button>
                          <span className="shopping-item-text">{item.displayName} {item.occurrences > 1 ? `x${item.occurrences}` : ""}</span>
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
            {purchasedByTrip.length === 0 ? (
              <div className="kitchen-card kitchen-empty"><h4>Aún no hay ingredientes comprados.</h4></div>
            ) : purchasedByTrip.map((trip) => (
              <div className="kitchen-card shopping-category-card" key={trip.tripId || `trip-${trip.startedAt}`}>
                <h4>{trip.storeName} · {formatTripDate(trip.startedAt)} {trip.totalAmount !== null ? `· ${formatAmount(trip.totalAmount)}` : ""}</h4>
                <div className="shopping-items-list">
                  {trip.items.map((item) => {
                    const key = itemKey(item);
                    return (
                      <div className={`shopping-item purchased ${transitioningItemKey === key ? "is-leaving" : ""} ${recentlyMovedItemKey === key ? "is-entering" : ""}`} key={key}>
                        <button className="shopping-check is-checked" type="button" onClick={() => setItemStatus(item, "pending")}><span className="shopping-check-dot">✓</span></button>
                        <span className="shopping-item-text">{item.displayName} {item.occurrences > 1 ? `x${item.occurrences}` : ""}</span>
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </KitchenLayout>
  );
}
