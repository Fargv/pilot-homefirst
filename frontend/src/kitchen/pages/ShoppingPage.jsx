import React, { useEffect, useState } from "react";
import KitchenLayout from "../Layout.jsx";
import { apiRequest } from "../api.js";

function getMondayISO(date = new Date()) {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const day = d.getUTCDay();
  const diff = (day === 0 ? -6 : 1) - day;
  d.setUTCDate(d.getUTCDate() + diff);
  return d.toISOString().slice(0, 10);
}

export default function ShoppingPage() {
  const [weekStart, setWeekStart] = useState(getMondayISO());
  const [list, setList] = useState(null);
  const [filter, setFilter] = useState("need");
  const [error, setError] = useState("");

  const loadList = async () => {
    setError("");
    try {
      const data = await apiRequest(`/api/kitchen/shopping/${weekStart}`);
      setList(data.list);
    } catch (err) {
      setError(err.message || "No se pudo cargar la lista.");
    }
  };

  useEffect(() => {
    loadList();
  }, [weekStart]);

  const rebuild = async () => {
    try {
      const data = await apiRequest(`/api/kitchen/shopping/${weekStart}/rebuild`, { method: "POST" });
      setList(data.list);
    } catch (err) {
      setError(err.message || "No se pudo regenerar la lista.");
    }
  };

  const updateStatus = async (item, status) => {
    try {
      const data = await apiRequest(`/api/kitchen/shopping/${weekStart}/item`, {
        method: "PUT",
        body: JSON.stringify({ canonicalName: item.canonicalName, status, displayName: item.displayName })
      });
      setList(data.list);
    } catch (err) {
      setError(err.message || "No se pudo actualizar.");
    }
  };

  const items = (list?.items || []).filter((item) => (filter ? item.status === filter : true));

  return (
    <KitchenLayout>
      <div className="kitchen-card" style={{ marginBottom: 16 }}>
        <h3>Lista de la compra</h3>
        <p className="kitchen-muted">Generada desde la planificación semanal.</p>
        <div className="kitchen-actions">
          <button className="kitchen-button" onClick={rebuild}>Recalcular lista</button>
          <label>
            <span className="kitchen-label">Semana (lunes)</span>
            <input
              className="kitchen-input"
              type="date"
              value={weekStart}
              onChange={(event) => setWeekStart(event.target.value)}
            />
          </label>
          <label>
            <span className="kitchen-label">Filtro</span>
            <select className="kitchen-select" value={filter} onChange={(event) => setFilter(event.target.value)}>
              <option value="need">Pendiente</option>
              <option value="have">Ya lo tenemos</option>
              <option value="bought">Comprado</option>
              <option value="">Todos</option>
            </select>
          </label>
        </div>
        {error ? <div style={{ color: "#b42318", marginTop: 8 }}>{error}</div> : null}
      </div>

      <div className="kitchen-card">
        {items.length === 0 ? (
          <div className="kitchen-empty">
            <h4>No hay ingredientes en este estado.</h4>
            <p className="kitchen-muted">Recalcula la lista o cambia el filtro.</p>
          </div>
        ) : (
          <table className="kitchen-table">
            <thead>
              <tr>
                <th>Ingrediente</th>
                <th>Estado</th>
                <th>Acción rápida</th>
              </tr>
            </thead>
            <tbody>
              {items.map((item) => (
                <tr key={item.canonicalName}>
                  <td>{item.displayName}</td>
                  <td>{item.status}</td>
                  <td>
                    <div className="kitchen-actions">
                      <button className="kitchen-button secondary" onClick={() => updateStatus(item, "need")}>Pendiente</button>
                      <button className="kitchen-button secondary" onClick={() => updateStatus(item, "have")}>Tenemos</button>
                      <button className="kitchen-button secondary" onClick={() => updateStatus(item, "bought")}>Comprado</button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </KitchenLayout>
  );
}
