import React, { useCallback, useEffect, useMemo, useState } from "react";
import { apiRequest } from "../api.js";
import KitchenLayout from "../Layout.jsx";
import { useAuth } from "../auth";
import DishModal from "../components/DishModal.jsx";
import { normalizeIngredientName } from "../utils/normalize.js";

export default function DishesPage() {
  const { user } = useAuth();
  const [dishes, setDishes] = useState([]);
  const [categories, setCategories] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [activeDish, setActiveDish] = useState(null);
  const [searchTerm, setSearchTerm] = useState("");

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

  const startEdit = useCallback(
    (dish) => {
      setError("");
      setActiveDish(dish);
      setIsModalOpen(true);
    },
    []
  );

  const startCreate = () => {
    setActiveDish(null);
    setError("");
    setIsModalOpen(true);
  };

  const closeModal = () => {
    setIsModalOpen(false);
    setActiveDish(null);
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
                          if (activeDish?._id === dish._id) closeModal();
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
        {error ? <div className="kitchen-alert error">{error}</div> : null}
      </div>

      <DishModal
        isOpen={isModalOpen}
        onClose={closeModal}
        onSaved={async () => {
          await loadDishes();
        }}
        categories={categories}
        onCategoryCreated={onCategoryCreated}
        initialDish={activeDish}
      />
    </KitchenLayout>
  );
}
