import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { apiRequest } from "../api.js";
import KitchenLayout from "../Layout.jsx";
import { useAuth } from "../auth";
import IngredientPicker from "../components/IngredientPicker.jsx";
import { normalizeIngredientName } from "../utils/normalize.js";

export default function DishesPage() {
  const { user } = useAuth();
  const [dishes, setDishes] = useState([]);
  const [categories, setCategories] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [form, setForm] = useState({ name: "", ingredients: [] });
  const [editingId, setEditingId] = useState(null);
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState("");
  const [isCreatingIngredient, setIsCreatingIngredient] = useState(false);
  const ingredientCache = useRef(new Map());

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

  const loadCategories = async () => {
    try {
      const data = await apiRequest("/api/categories");
      setCategories(data.categories || []);
    } catch (err) {
      setError(err.message || "No se pudieron cargar las categorías.");
    }
  };

  useEffect(() => {
    loadCategories();
  }, []);

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
          const canonicalName = String(item?.canonicalName || normalizeIngredientName(displayName)).trim();
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
      return resolved.filter((item) => item.displayName);
    },
    [fetchIngredientMatch]
  );

  const startEdit = useCallback(
    async (dish) => {
      setNotice("");
      const ingredients = await resolveIngredients(dish.ingredients || []);
      setForm({ name: dish.name || "", ingredients });
      setEditingId(dish._id);
    },
    [resolveIngredients]
  );

  const resetForm = () => {
    setForm({ name: "", ingredients: [] });
    setEditingId(null);
    setNotice("");
  };

  const onSave = async (event) => {
    event.preventDefault();
    setError("");
    setNotice("");
    setSaving(true);
    try {
      const payload = {
        name: form.name,
        ingredients: (form.ingredients || []).map((item) => ({
          ingredientId: item.ingredientId,
          displayName: item.displayName,
          canonicalName: item.canonicalName || normalizeIngredientName(item.displayName)
        }))
      };
      if (editingId) {
        await apiRequest(`/api/kitchen/dishes/${editingId}`, {
          method: "PUT",
          body: JSON.stringify(payload)
        });
        setNotice("Plato actualizado.");
      } else {
        await apiRequest("/api/kitchen/dishes", {
          method: "POST",
          body: JSON.stringify(payload)
        });
        setNotice("Plato creado.");
      }
      resetForm();
      loadDishes();
    } catch (err) {
      setError(err.message || "No se pudo guardar el plato.");
    } finally {
      setSaving(false);
    }
  };

  const onCategoryCreated = async (name) => {
    const data = await apiRequest("/api/categories", {
      method: "POST",
      body: JSON.stringify({ name })
    });
    const category = data.category;
    setCategories((prev) => {
      const exists = prev.find((item) => item._id === category._id);
      if (exists) return prev;
      return [...prev, category];
    });
    return category;
  };

  const pendingCount = useMemo(
    () => (form.ingredients || []).filter((item) => item.status === "pending").length,
    [form.ingredients]
  );

  return (
    <KitchenLayout>
      <div className="kitchen-grid">
        <div className="kitchen-card">
          <div>
            <h3>{editingId ? "Editar plato" : "Crear plato"}</h3>
            <p className="kitchen-muted">Selecciona ingredientes con búsqueda y añade nuevos al vuelo.</p>
          </div>
          <form onSubmit={onSave} className="kitchen-form">
            <label className="kitchen-field">
              <span className="kitchen-label">Nombre del plato</span>
              <input
                className="kitchen-input"
                value={form.name}
                onChange={(event) => setForm({ ...form, name: event.target.value })}
                required
                placeholder="Ej. Pollo al horno"
              />
            </label>
            <div className="kitchen-field">
              <span className="kitchen-label">Ingredientes</span>
              <IngredientPicker
                value={form.ingredients}
                onChange={(ingredients) => setForm({ ...form, ingredients })}
                categories={categories}
                onCategoryCreated={onCategoryCreated}
                onCreateStateChange={setIsCreatingIngredient}
              />
              {pendingCount ? (
                <p className="kitchen-inline-warning">
                  Hay {pendingCount} ingrediente{pendingCount > 1 ? "s" : ""} pendiente{pendingCount > 1 ? "s" : ""} de
                  vincular con el catálogo global.
                </p>
              ) : null}
            </div>
            {notice ? <div className="kitchen-alert success">{notice}</div> : null}
            {error ? <div className="kitchen-alert error">{error}</div> : null}
            <div className="kitchen-actions">
              {isCreatingIngredient ? (
                <div className="kitchen-inline-warning">
                  Termina de crear el ingrediente para guardar el plato.
                </div>
              ) : (
                <button className="kitchen-button" type="submit" disabled={saving}>
                  {saving ? "Guardando..." : "Guardar plato"}
                </button>
              )}
              {editingId ? (
                <button className="kitchen-button ghost" type="button" onClick={resetForm}>
                  Cancelar edición
                </button>
              ) : null}
            </div>
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
                  <div className="kitchen-dish-row">
                    <div>
                      <strong>{dish.name}</strong>
                      <div className="kitchen-muted">
                        {(dish.ingredients || []).map((item) => item.displayName).join(", ") || "Sin ingredientes"}
                      </div>
                    </div>
                    <div className="kitchen-dish-actions">
                      <button className="kitchen-button secondary" type="button" onClick={() => startEdit(dish)}>
                        Editar
                      </button>
                      {user?.role === "admin" ? (
                        <button
                          className="kitchen-button ghost"
                          type="button"
                          onClick={async () => {
                            await apiRequest(`/api/kitchen/dishes/${dish._id}`, { method: "DELETE" });
                            if (editingId === dish._id) resetForm();
                            loadDishes();
                          }}
                        >
                          Eliminar
                        </button>
                      ) : null}
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </KitchenLayout>
  );
}
