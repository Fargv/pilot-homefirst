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
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState("");
  const [isCreatingIngredient, setIsCreatingIngredient] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
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
      setError("");
      setIsModalOpen(true);
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
    setError("");
  };

  const startCreate = () => {
    resetForm();
    setIsModalOpen(true);
  };

  const closeModal = () => {
    resetForm();
    setIsModalOpen(false);
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
      closeModal();
      loadDishes();
    } catch (err) {
      setError(err.message || "No se pudo guardar el plato.");
    } finally {
      setSaving(false);
    }
  };

  const onCategoryCreated = async (name, colors = null) => {
    const data = await apiRequest("/api/categories", {
      method: "POST",
      body: JSON.stringify({
        name,
        colorBg: colors?.colorBg,
        colorText: colors?.colorText
      })
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

  const normalizedSearch = useMemo(() => normalizeIngredientName(searchTerm), [searchTerm]);
  const visibleDishes = useMemo(() => {
    if (!normalizedSearch) return dishes;
    return dishes.filter((dish) => {
      const nameMatch = normalizeIngredientName(dish.name || "").includes(normalizedSearch);
      if (nameMatch) return true;
      return (dish.ingredients || []).some((item) => {
        const displayName = normalizeIngredientName(item.displayName || "");
        const canonicalName = normalizeIngredientName(item.canonicalName || "");
        return displayName.includes(normalizedSearch) || canonicalName.includes(normalizedSearch);
      });
    });
  }, [dishes, normalizedSearch]);

  return (
    <KitchenLayout>
      <div className="kitchen-dishes-page">
        <div className="kitchen-dishes-header">
          <div>
            <h2>Platos</h2>
            <p className="kitchen-muted">Administra tus platos y sus ingredientes en un solo lugar.</p>
          </div>
          <button className="kitchen-button" type="button" onClick={startCreate}>
            Nuevo plato
          </button>
        </div>
        <div className="kitchen-dishes-search">
          <input
            className="kitchen-input"
            placeholder="Buscar por plato o ingrediente…"
            value={searchTerm}
            onChange={(event) => setSearchTerm(event.target.value)}
          />
        </div>
        {loading ? (
          <div className="kitchen-card kitchen-dishes-loading">Cargando platos...</div>
        ) : visibleDishes.length === 0 ? (
          <div className="kitchen-card kitchen-empty">
            <p>
              {dishes.length === 0
                ? "No hay platos aún. Crea el primero."
                : "No encontramos platos con ese criterio."}
            </p>
          </div>
        ) : (
          <div className="kitchen-dishes-grid">
            {visibleDishes.map((dish) => {
              const ingredientsText =
                (dish.ingredients || []).map((item) => item.displayName).join(", ") || "Sin ingredientes";
              return (
                <article className="kitchen-dish-card" key={dish._id}>
                  <div>
                    <h3 className="kitchen-dish-name">{dish.name}</h3>
                    <p className="kitchen-dish-ingredients-text" title={ingredientsText}>
                      {ingredientsText}
                    </p>
                  </div>
                  <div className="kitchen-dish-actions">
                    <button
                      className="kitchen-icon-button"
                      type="button"
                      onClick={() => startEdit(dish)}
                      aria-label={`Editar ${dish.name}`}
                    >
                      <svg viewBox="0 0 24 24" aria-hidden="true">
                        <path
                          d="M16.862 4.487a2.25 2.25 0 0 1 3.182 3.182l-9.19 9.19a2.25 2.25 0 0 1-1.06.592l-3.293.823.823-3.293a2.25 2.25 0 0 1 .592-1.06l9.19-9.19Z"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="1.5"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        />
                        <path
                          d="M15.75 5.625 18.375 8.25"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="1.5"
                          strokeLinecap="round"
                        />
                      </svg>
                    </button>
                    {user?.role === "admin" ? (
                      <button
                        className="kitchen-icon-button danger"
                        type="button"
                        onClick={async () => {
                          await apiRequest(`/api/kitchen/dishes/${dish._id}`, { method: "DELETE" });
                          if (editingId === dish._id) closeModal();
                          loadDishes();
                        }}
                        aria-label={`Eliminar ${dish.name}`}
                      >
                        <svg viewBox="0 0 24 24" aria-hidden="true">
                          <path
                            d="M4 7h16M10 11v6m4-6v6M9 4h6l1 2H8l1-2Z"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="1.5"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                          />
                          <path
                            d="M6 7l1 12a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2l1-12"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="1.5"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                          />
                        </svg>
                      </button>
                    ) : null}
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </div>

      {isModalOpen ? (
        <div className="kitchen-modal-backdrop" role="presentation" onClick={closeModal}>
          <div
            className="kitchen-modal"
            role="dialog"
            aria-modal="true"
            aria-label={editingId ? "Editar plato" : "Crear plato"}
            onClick={(event) => event.stopPropagation()}
          >
            <div className="kitchen-modal-header">
              <div>
                <h3>{editingId ? "Editar plato" : "Crear plato"}</h3>
                <p className="kitchen-muted">Selecciona ingredientes con búsqueda y añade nuevos al vuelo.</p>
              </div>
              <button className="kitchen-icon-button" type="button" onClick={closeModal} aria-label="Cerrar">
                <svg viewBox="0 0 24 24" aria-hidden="true">
                  <path
                    d="M6 6l12 12M18 6l-12 12"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.5"
                    strokeLinecap="round"
                  />
                </svg>
              </button>
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
              <div className="kitchen-field kitchen-dish-ingredients">
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
                    Hay {pendingCount} ingrediente{pendingCount > 1 ? "s" : ""} pendiente
                    {pendingCount > 1 ? "s" : ""} de vincular con el catálogo global.
                  </p>
                ) : null}
              </div>
              {notice ? <div className="kitchen-alert success">{notice}</div> : null}
              {error ? <div className="kitchen-alert error">{error}</div> : null}
              <div className="kitchen-modal-actions">
                {isCreatingIngredient ? (
                  <div className="kitchen-inline-warning">
                    Termina de crear el ingrediente para guardar el plato.
                  </div>
                ) : (
                  <button className="kitchen-button" type="submit" disabled={saving}>
                    {saving ? "Guardando..." : "Guardar"}
                  </button>
                )}
                <button className="kitchen-button ghost" type="button" onClick={closeModal}>
                  Cancelar
                </button>
              </div>
            </form>
          </div>
        </div>
      ) : null}
    </KitchenLayout>
  );
}
