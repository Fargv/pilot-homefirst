import React, { useEffect, useState } from "react";
import { apiRequest } from "../api.js";
import KitchenLayout from "../Layout.jsx";
import { useAuth } from "../auth";

export default function DishesPage() {
  const { user } = useAuth();
  const [dishes, setDishes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [form, setForm] = useState({ name: "", ingredients: "" });

  const loadDishes = async () => {
    setLoading(true);
    setError("");
    try {
      const data = await apiRequest("/api/kitchen/dishes");
      setDishes(data.dishes || []);
    } catch (err) {
      setError(err.message || "No se pudieron cargar los platos.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadDishes();
  }, []);

  const onCreate = async (event) => {
    event.preventDefault();
    setError("");
    try {
      const payload = {
        name: form.name,
        ingredients: form.ingredients
          .split(",")
          .map((value) => ({ displayName: value.trim() }))
          .filter((item) => item.displayName)
      };
      await apiRequest("/api/kitchen/dishes", {
        method: "POST",
        body: JSON.stringify(payload)
      });
      setForm({ name: "", ingredients: "" });
      loadDishes();
    } catch (err) {
      setError(err.message || "No se pudo crear el plato.");
    }
  };

  return (
    <KitchenLayout>
      <div className="kitchen-grid">
        <div className="kitchen-card">
          <h3>Crear plato</h3>
          <p className="kitchen-muted">Añade ingredientes sin cantidades.</p>
          <form onSubmit={onCreate} style={{ display: "grid", gap: 12, marginTop: 12 }}>
            <label>
              <span className="kitchen-label">Nombre del plato</span>
              <input
                className="kitchen-input"
                value={form.name}
                onChange={(event) => setForm({ ...form, name: event.target.value })}
                required
              />
            </label>
            <label>
              <span className="kitchen-label">Ingredientes (separados por coma)</span>
              <textarea
                className="kitchen-textarea"
                rows="3"
                value={form.ingredients}
                onChange={(event) => setForm({ ...form, ingredients: event.target.value })}
              />
            </label>
            {error ? <div style={{ color: "#b42318" }}>{error}</div> : null}
            <button className="kitchen-button" type="submit">Guardar plato</button>
          </form>
        </div>

        <div className="kitchen-card">
          <h3>Platos guardados</h3>
          {loading ? (
            <p>Cargando...</p>
          ) : dishes.length === 0 ? (
            <div className="kitchen-empty">
              <p>No hay platos aún. Crea el primero.</p>
            </div>
          ) : (
            <ul style={{ listStyle: "none", padding: 0, margin: 0 }}>
              {dishes.map((dish) => (
                <li key={dish._id} style={{ marginBottom: 12 }}>
                  <strong>{dish.name}</strong>
                  <div className="kitchen-muted">
                    {(dish.ingredients || []).map((item) => item.displayName).join(", ") || "Sin ingredientes"}
                  </div>
                  {user?.role === "admin" ? (
                    <button
                      className="kitchen-button secondary"
                      style={{ marginTop: 8 }}
                      onClick={async () => {
                        await apiRequest(`/api/kitchen/dishes/${dish._id}`, { method: "DELETE" });
                        loadDishes();
                      }}
                    >
                      Eliminar
                    </button>
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
