import React, { useCallback, useEffect, useMemo, useState } from "react";
import { apiRequest } from "../api.js";
import KitchenLayout from "../Layout.jsx";
import { useAuth } from "../auth";
import DishModal from "../components/DishModal.jsx";
import IngredientModal from "../components/IngredientModal.jsx";
import CategoryChip from "../components/CategoryChip.jsx";
import { resolveCategoryColors } from "../components/categoryUtils.js";
import { normalizeIngredientName } from "../utils/normalize.js";

export default function DishesPage() {
  const { user } = useAuth();
  const [dishes, setDishes] = useState([]);
  const [categories, setCategories] = useState([]);
  const [loading, setLoading] = useState(true);
  const [dishError, setDishError] = useState("");
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [activeDish, setActiveDish] = useState(null);
  const [dishSearchTerm, setDishSearchTerm] = useState("");
  const [activeTab, setActiveTab] = useState("main");
  const [initialSidedish, setInitialSidedish] = useState(false);
  const [ingredients, setIngredients] = useState([]);
  const [ingredientsLoading, setIngredientsLoading] = useState(false);
  const [ingredientsError, setIngredientsError] = useState("");
  const [ingredientSearchTerm, setIngredientSearchTerm] = useState("");
  const [isIngredientModalOpen, setIsIngredientModalOpen] = useState(false);
  const [activeIngredient, setActiveIngredient] = useState(null);

  const loadDishes = async () => {
    setLoading(true);
    setDishError("");
    try {
      const data = await apiRequest("/api/kitchen/dishes");
      setDishes(data.dishes || []);
    } catch (err) {
      setDishError(err.message || "No se pudieron cargar los platos.");
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
      setDishError(err.message || "No se pudieron cargar las categorías.");
    }
  };

  useEffect(() => {
    loadCategories();
  }, []);

  const startEdit = useCallback(
    (dish) => {
      setDishError("");
      setActiveDish(dish);
      setIsModalOpen(true);
    },
    []
  );

  const startCreate = () => {
    setActiveDish(null);
    setDishError("");
    setInitialSidedish(activeTab === "side");
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

  const normalizedSearch = useMemo(
    () => normalizeIngredientName(dishSearchTerm),
    [dishSearchTerm]
  );
  const tabFilteredDishes = useMemo(() => {
    const shouldShowSide = activeTab === "side";
    return dishes.filter((dish) => Boolean(dish.sidedish) === shouldShowSide);
  }, [activeTab, dishes]);
  const visibleDishes = useMemo(() => {
    if (!normalizedSearch) return tabFilteredDishes;
    return tabFilteredDishes.filter((dish) => {
      const nameMatch = normalizeIngredientName(dish.name || "").includes(normalizedSearch);
      if (nameMatch) return true;
      return (dish.ingredients || []).some((item) => {
        const displayName = normalizeIngredientName(item.displayName || "");
        const canonicalName = normalizeIngredientName(item.canonicalName || "");
        return displayName.includes(normalizedSearch) || canonicalName.includes(normalizedSearch);
      });
    });
  }, [normalizedSearch, tabFilteredDishes]);

  const emptyMessage = useMemo(() => {
    if (dishes.length === 0) {
      return "No hay platos aún. Crea el primero.";
    }
    if (visibleDishes.length === 0) {
      if (dishSearchTerm.trim()) {
        return "No encontramos platos con ese criterio.";
      }
      return activeTab === "side"
        ? "No hay guarniciones aún. Crea la primera."
        : "No hay platos principales aún. Crea el primero.";
    }
    return "";
  }, [activeTab, dishSearchTerm, dishes.length, visibleDishes.length]);

  const loadIngredients = useCallback(async (query = "") => {
    setIngredientsLoading(true);
    setIngredientsError("");
    try {
      const params = new URLSearchParams({ includeInactive: "true", limit: "0" });
      if (query.trim()) params.set("q", query.trim());
      const data = await apiRequest(`/api/kitchenIngredients?${params.toString()}`);
      setIngredients(data.ingredients || []);
    } catch (err) {
      setIngredientsError(err.message || "No se pudieron cargar los ingredientes.");
    } finally {
      setIngredientsLoading(false);
    }
  }, []);

  useEffect(() => {
    if (activeTab !== "ingredients") return;
    const timeout = setTimeout(() => {
      loadIngredients(ingredientSearchTerm);
    }, 250);
    return () => clearTimeout(timeout);
  }, [activeTab, ingredientSearchTerm, loadIngredients]);

  const startIngredientCreate = () => {
    setActiveIngredient(null);
    setIngredientsError("");
    setIsIngredientModalOpen(true);
  };

  const startIngredientEdit = (ingredient) => {
    setActiveIngredient(ingredient);
    setIngredientsError("");
    setIsIngredientModalOpen(true);
  };

  const closeIngredientModal = () => {
    setIsIngredientModalOpen(false);
    setActiveIngredient(null);
  };

  const ingredientEmptyMessage = useMemo(() => {
    if (ingredients.length === 0) {
      return "No hay ingredientes aún. Crea el primero.";
    }
    if (ingredientSearchTerm.trim()) {
      return "No encontramos ingredientes con ese criterio.";
    }
    return "";
  }, [ingredientSearchTerm, ingredients.length]);

  const isIngredientsTab = activeTab === "ingredients";
  const headerTitle = isIngredientsTab ? "Ingredientes" : "Platos";
  const headerDescription = isIngredientsTab
    ? "Gestiona el catálogo de ingredientes con sus categorías y estado."
    : "Administra tus platos y sus ingredientes en un solo lugar.";
  const headerActionLabel = isIngredientsTab
    ? "Nuevo ingrediente"
    : activeTab === "side"
      ? "Nueva guarnición"
      : "Nuevo plato";
  const headerActionHandler = isIngredientsTab ? startIngredientCreate : startCreate;

  return (
    <KitchenLayout>
      <div className="kitchen-dishes-page">
        <div className="kitchen-dishes-header">
          <div>
            <h2>{headerTitle}</h2>
            <p className="kitchen-muted">{headerDescription}</p>
          </div>
          <button className="kitchen-button" type="button" onClick={headerActionHandler}>
            {headerActionLabel}
          </button>
        </div>
        <div className="kitchen-dishes-tabs" role="tablist" aria-label="Secciones de cocina">
          <button
            className={`kitchen-tab-button ${activeTab === "main" ? "is-active" : ""}`}
            type="button"
            role="tab"
            aria-selected={activeTab === "main"}
            onClick={() => setActiveTab("main")}
          >
            Platos
          </button>
          <button
            className={`kitchen-tab-button ${activeTab === "side" ? "is-active" : ""}`}
            type="button"
            role="tab"
            aria-selected={activeTab === "side"}
            onClick={() => setActiveTab("side")}
          >
            Guarniciones
          </button>
          <button
            className={`kitchen-tab-button ${activeTab === "ingredients" ? "is-active" : ""}`}
            type="button"
            role="tab"
            aria-selected={activeTab === "ingredients"}
            onClick={() => setActiveTab("ingredients")}
          >
            Ingredientes
          </button>
        </div>
        <div className="kitchen-dishes-search">
          <input
            className="kitchen-input"
            placeholder={
              isIngredientsTab ? "Buscar ingrediente…" : "Buscar por plato o ingrediente…"
            }
            value={isIngredientsTab ? ingredientSearchTerm : dishSearchTerm}
            onChange={(event) =>
              isIngredientsTab
                ? setIngredientSearchTerm(event.target.value)
                : setDishSearchTerm(event.target.value)
            }
          />
        </div>
        {isIngredientsTab ? (
          ingredientsLoading ? (
            <div className="kitchen-card kitchen-dishes-loading">Cargando ingredientes...</div>
          ) : ingredients.length === 0 ? (
            <div className="kitchen-card kitchen-empty">
              <p>{ingredientEmptyMessage}</p>
            </div>
          ) : (
            <div className="kitchen-dishes-grid">
              {ingredients.map((ingredient) => {
                const category = ingredient.categoryId || null;
                const colors = resolveCategoryColors(category);
                return (
                  <article className="kitchen-dish-card kitchen-ingredient-card" key={ingredient._id}>
                    <div>
                      <div className="kitchen-dish-title-row">
                        <h3 className="kitchen-dish-name">{ingredient.name}</h3>
                        <span
                          className={`kitchen-status-pill ${
                            ingredient.active ? "active" : "inactive"
                          }`}
                        >
                          {ingredient.active ? "Activo" : "Inactivo"}
                        </span>
                      </div>
                      <p className="kitchen-ingredient-canonical">
                        Canonical: {ingredient.canonicalName}
                      </p>
                      {category ? (
                        <div className="kitchen-ingredient-tags">
                          <CategoryChip
                            label={category.name}
                            colorBg={category.colorBg || colors.colorBg}
                            colorText={category.colorText || colors.colorText}
                          />
                        </div>
                      ) : null}
                    </div>
                    <div className="kitchen-dish-actions">
                      <button
                        className="kitchen-icon-button"
                        type="button"
                        onClick={() => startIngredientEdit(ingredient)}
                        aria-label={`Editar ${ingredient.name}`}
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
                    </div>
                  </article>
                );
              })}
            </div>
          )
        ) : loading ? (
          <div className="kitchen-card kitchen-dishes-loading">Cargando platos...</div>
        ) : visibleDishes.length === 0 ? (
          <div className="kitchen-card kitchen-empty">
            <p>{emptyMessage}</p>
          </div>
        ) : (
          <div className="kitchen-dishes-grid">
            {visibleDishes.map((dish) => {
              const ingredientsText =
                (dish.ingredients || []).map((item) => item.displayName).join(", ") ||
                "Sin ingredientes";
              return (
                <article
                  className={`kitchen-dish-card ${dish.sidedish ? "is-sidedish" : ""}`}
                  key={dish._id}
                >
                  <div>
                    <div className="kitchen-dish-title-row">
                      <h3 className="kitchen-dish-name">{dish.name}</h3>
                      {dish.sidedish ? <span className="kitchen-dish-badge">Guarnición</span> : null}
                    </div>
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
        {dishError ? <div className="kitchen-alert error">{dishError}</div> : null}
        {ingredientsError && isIngredientsTab ? (
          <div className="kitchen-alert error">{ingredientsError}</div>
        ) : null}
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
        initialSidedish={initialSidedish}
      />
      <IngredientModal
        isOpen={isIngredientModalOpen}
        onClose={closeIngredientModal}
        onSaved={async () => {
          await loadIngredients(ingredientSearchTerm);
        }}
        categories={categories}
        onCategoryCreated={onCategoryCreated}
        initialIngredient={activeIngredient}
      />
    </KitchenLayout>
  );
}
