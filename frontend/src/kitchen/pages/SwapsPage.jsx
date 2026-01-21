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

export default function SwapsPage() {
  const [swaps, setSwaps] = useState([]);
  const [users, setUsers] = useState([]);
  const [error, setError] = useState("");
  const [form, setForm] = useState({
    weekStart: getMondayISO(),
    toUserId: "",
    fromDate: "",
    toDate: ""
  });

  const loadData = async () => {
    try {
      const [swapsData, usersData] = await Promise.all([
        apiRequest("/api/kitchen/swaps"),
        apiRequest("/api/kitchen/users/members")
      ]);
      setSwaps(swapsData.swaps || []);
      setUsers(usersData.users || []);
    } catch (err) {
      setError(err.message || "No se pudieron cargar los cambios.");
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const submitSwap = async (event) => {
    event.preventDefault();
    setError("");
    try {
      await apiRequest("/api/kitchen/swaps", {
        method: "POST",
        body: JSON.stringify(form)
      });
      setForm({ weekStart: getMondayISO(), toUserId: "", fromDate: "", toDate: "" });
      loadData();
    } catch (err) {
      setError(err.message || "No se pudo solicitar el cambio.");
    }
  };

  const act = async (swapId, action) => {
    try {
      await apiRequest(`/api/kitchen/swaps/${swapId}/${action}`, { method: "POST" });
      loadData();
    } catch (err) {
      setError(err.message || "No se pudo actualizar el cambio.");
    }
  };

  return (
    <KitchenLayout>
      <div className="kitchen-grid">
        <div className="kitchen-card">
          <h3>Solicitar cambio</h3>
          <p className="kitchen-muted">Propón intercambiar días con otro miembro.</p>
          <form onSubmit={submitSwap} style={{ display: "grid", gap: 12, marginTop: 12 }}>
            <label>
              <span className="kitchen-label">Semana (lunes)</span>
              <input
                className="kitchen-input"
                type="date"
                value={form.weekStart}
                onChange={(event) => setForm({ ...form, weekStart: event.target.value })}
                required
              />
            </label>
            <label>
              <span className="kitchen-label">Para quién</span>
              <select
                className="kitchen-select"
                value={form.toUserId}
                onChange={(event) => setForm({ ...form, toUserId: event.target.value })}
                required
              >
                <option value="">Selecciona un miembro</option>
                {users.map((u) => (
                  <option key={u.id} value={u.id}>{u.displayName}</option>
                ))}
              </select>
            </label>
            <label>
              <span className="kitchen-label">Mi día actual</span>
              <input
                className="kitchen-input"
                type="date"
                value={form.fromDate}
                onChange={(event) => setForm({ ...form, fromDate: event.target.value })}
                required
              />
            </label>
            <label>
              <span className="kitchen-label">Día que quiero</span>
              <input
                className="kitchen-input"
                type="date"
                value={form.toDate}
                onChange={(event) => setForm({ ...form, toDate: event.target.value })}
                required
              />
            </label>
            {error ? <div style={{ color: "#b42318" }}>{error}</div> : null}
            <button className="kitchen-button" type="submit">Solicitar</button>
          </form>
        </div>

        <div className="kitchen-card">
          <h3>Mis cambios</h3>
          {swaps.length === 0 ? (
            <div className="kitchen-empty">
              <p>No hay solicitudes todavía.</p>
            </div>
          ) : (
            <ul style={{ listStyle: "none", padding: 0, margin: 0 }}>
              {swaps.map((swap) => (
                <li key={swap._id} style={{ marginBottom: 12 }}>
                  <strong>{swap.status.toUpperCase()}</strong>
                  <div className="kitchen-muted">
                    {new Date(swap.fromDate).toLocaleDateString("es-ES")} → {new Date(swap.toDate).toLocaleDateString("es-ES")}
                  </div>
                  {swap.status === "pending" ? (
                    <div className="kitchen-actions">
                      <button className="kitchen-button secondary" onClick={() => act(swap._id, "accept")}>Aceptar</button>
                      <button className="kitchen-button secondary" onClick={() => act(swap._id, "reject")}>Rechazar</button>
                    </div>
                  ) : null}
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </KitchenLayout>
  );
}
