import React, { useEffect, useMemo, useState } from "react";
import KitchenLayout from "../Layout.jsx";
import { apiRequest } from "../api.js";
import { useAuth } from "../auth";

function getMondayISO(date = new Date()) {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const day = d.getUTCDay();
  const diff = (day === 0 ? -6 : 1) - day;
  d.setUTCDate(d.getUTCDate() + diff);
  return d.toISOString().slice(0, 10);
}

function formatTripDate(value) {
  if (!value) return "";
  return new Date(value).toLocaleDateString("es-ES", { day: "2-digit", month: "2-digit", year: "numeric" });
}

function formatAmount(value) {
  if (value === null || value === undefined || value === "") return "";
  return `${Number(value).toFixed(2)} €`;
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
  const isDiodGlobalMode = user?.globalRole === "diod" && !user?.activeHouseholdId;

  const applyPayload = (data) => {
    setStores(data.stores || []);
    setActiveTrip(data.activeTrip || null);
    setPendingByCategory(data.pendingByCategory || []);
    setPurchasedByTrip(data.purchasedByTrip || []);
  };

  const loadList = async ({ silent = false } = {}) => {
    if (isDiodGlobalMode) {
      return;
    }
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
    try {
      const data = await apiRequest(`/api/kitchen/shopping/${weekStart}/item`, {
        method: "PUT",
        body: JSON.stringify({ canonicalName: item.canonicalName, ingredientId: item.ingredientId, status })
      });
      applyPayload(data);
    } catch (err) {
      setError(err.message || "No se pudo actualizar.");
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
            <h3>Lista de la compra</h3>
            <p className="kitchen-muted">Sincronizada automáticamente al asignar platos.</p>
          </div>
          <button className="shopping-refresh-icon" onClick={refreshList} title="Refrescar" disabled={isRefreshing}>↻</button>
        </div>

        <div className="shopping-toolbar">
          <input className="kitchen-input" type="date" value={weekStart} onChange={(event) => setWeekStart(event.target.value)} />
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
            pendingByCategory.map((group) => (
              <div className="kitchen-card shopping-category-card" key={group.categoryName}>
                <h4>{group.categoryName.toUpperCase()} ({group.items.length})</h4>
                <div className="shopping-items-list">
                  {group.items.map((item) => (
                    <label className="shopping-item" key={`${item.canonicalName}-${item.ingredientId || "no-id"}`}>
                      <input type="checkbox" checked={false} onChange={() => setItemStatus(item, "purchased")} />
                      <span>{item.displayName} {item.occurrences > 1 ? `x${item.occurrences}` : ""}</span>
                    </label>
                  ))}
                </div>
              </div>
            ))
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
                  {trip.items.map((item) => (
                    <label className="shopping-item purchased" key={`${item.canonicalName}-${item.ingredientId || "no-id"}`}>
                      <input type="checkbox" checked onChange={() => setItemStatus(item, "pending")} />
                      <span>
                        {item.displayName} {item.occurrences > 1 ? `x${item.occurrences}` : ""}
                        <small className="kitchen-muted"> · marcado por {item.purchasedByName || "Usuario"} {item.purchasedAt ? new Date(item.purchasedAt).toLocaleTimeString("es-ES", { hour: "2-digit", minute: "2-digit" }) : ""}</small>
                      </span>
                    </label>
                  ))}
                </div>
              </div>
            ))
          )}
        </div>
      )}
    </KitchenLayout>
  );
}
