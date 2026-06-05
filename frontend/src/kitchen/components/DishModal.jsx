import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { apiRequest } from "../api.js";
import IngredientPicker from "./IngredientPicker.jsx";
import RecipeEditor from "./RecipeEditor.jsx";
import SearchableSelect from "./ui/SearchableSelect.jsx";
import { ProBadge } from "./ui/ProBadge.jsx";
import { normalizeIngredientName } from "../utils/normalize.js";
import { useAuth } from "../auth.jsx";
import { canRandomizeFullWeek, canUseDinnersFeature } from "../subscription.js";

const EMPTY_FORM = {
  name: "",
  ingredients: [],
  dishCategoryId: "",
  isDinner: false,
  special: false,
  allowRandom: true,
  active: true,
  isArchived: false
};

export default function DishModal({
  isOpen,
  onClose,
  onSaved,
  onRecipeSaved,
  categories = [],
  dishCategories = [],
  onCategoryCreated,
  initialDish = null,
  initialName = "",
  initialIsDinner = false,
  scope = undefined
}) {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [form, setForm] = useState(EMPTY_FORM);
  const [editingId, setEditingId] = useState(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [isCreatingIngredient, setIsCreatingIngredient] = useState(false);
  const [activeTab, setActiveTab] = useState("datos");
  const [recipe, setRecipe] = useState({ ingredients: [], steps: null, baseServings: null, servings: null });
  const [recipeSaving, setRecipeSaving] = useState(false);
  const [recipeError, setRecipeError] = useState("");
  const [recipeSaved, setRecipeSaved] = useState(false);
  const [recipeEditing, setRecipeEditing] = useState(false);
  const ingredientCache = useRef(new Map());

  const isDiod = user?.globalRole === "diod";
  const isPro = isDiod || canRandomizeFullWeek(user);
  const canDinnerDishes = isDiod || canUseDinnersFeature(user);

  const hasExistingRecipe = Boolean(
    recipe.steps || (recipe.ingredients || []).some((i) => i.name || i.quantity)
  );

  const dishIngredientNames = useMemo(
    () => (form.ingredients || []).map((ing) => (ing.displayName || ing.canonicalName || "").toLowerCase().trim()),
    [form.ingredients]
  );

  const dishCategoryOptions = useMemo(
    () => dishCategories.map((c) => ({ value: c._id, label: c.name, dotColor: c.colorText || "#344054" })),
    [dishCategories]
  );

  const fetchIngredientMatch = useCallback(async (canonicalName) => {
    if (!canonicalName) return null;
    if (ingredientCache.current.has(canonicalName)) return ingredientCache.current.get(canonicalName);
    try {
      const data = await apiRequest(`/api/kitchenIngredients?q=${encodeURIComponent(canonicalName)}`);
      const match = (data.ingredients || []).find((item) => item.canonicalName === canonicalName);
      ingredientCache.current.set(canonicalName, match || null);
      return match || null;
    } catch {
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

  useEffect(() => {
    if (!isOpen) return;
    let active = true;
    setError("");
    setRecipeError("");
    setRecipeSaved(false);
    setActiveTab("datos");
    setRecipeEditing(false);
    const setup = async () => {
      if (initialDish?._id) {
        const ingredients = await resolveIngredients(initialDish.ingredients || []);
        if (!active) return;
        setForm({
          name: initialDish.name || "",
          ingredients,
          dishCategoryId: initialDish.dishCategoryId?._id || initialDish.dishCategoryId || "",
          isDinner: Boolean(initialDish.isDinner),
          special: Boolean(initialDish.special),
          allowRandom: initialDish.allowRandom !== false,
          active: initialDish.active !== false,
          isArchived: Boolean(initialDish.isArchived)
        });
        setEditingId(initialDish._id);
        const existingRecipeIngredients = initialDish.recipe?.ingredients || [];
        const recipeIngredients = existingRecipeIngredients.length > 0
          ? existingRecipeIngredients
          : (initialDish.ingredients || []).map((ing) => ({
              name: ing.displayName || ing.canonicalName || "",
              quantity: "",
              ingredientId: ing.ingredientId || null
            })).filter((ing) => ing.name);
        setRecipe({
          ingredients: recipeIngredients,
          steps: initialDish.recipe?.steps || null,
          baseServings: initialDish.recipe?.baseServings || initialDish.recipe?.servings || null,
          servings: initialDish.recipe?.baseServings || initialDish.recipe?.servings || null
        });
      } else {
        setForm({
          name: initialName || "",
          ingredients: [],
          dishCategoryId: "",
          isDinner: Boolean(initialIsDinner),
          special: false,
          allowRandom: true,
          active: true,
          isArchived: false
        });
        setEditingId(null);
        setRecipe({ ingredients: [], steps: null, baseServings: null, servings: null });
      }
    };
    setup();
    return () => { active = false; };
  }, [initialDish, initialName, initialIsDinner, isOpen, resolveIngredients]);

  const pendingCount = useMemo(
    () => (form.ingredients || []).filter((item) => item.status === "pending").length,
    [form.ingredients]
  );

  const resetAndClose = () => {
    setForm(EMPTY_FORM);
    setEditingId(null);
    setError("");
    setRecipeError("");
    setRecipeSaved(false);
    setActiveTab("datos");
    setRecipe({ ingredients: [], steps: null, baseServings: null, servings: null });
    setIsCreatingIngredient(false);
    setRecipeEditing(false);
    onClose?.();
  };

  const onSave = async (event) => {
    event.preventDefault();
    setError("");
    setSaving(true);
    try {
      const payload = {
        name: form.name,
        scope: scope || initialDish?.scope || "household",
        active: Boolean(form.active),
        isArchived: Boolean(form.isArchived),
        dishCategoryId: form.dishCategoryId || null,
        isDinner: form.isDinner,
        special: form.special,
        allowRandom: form.allowRandom,
        ingredients: (form.ingredients || []).map((item) => ({
          ingredientId: item.ingredientId,
          displayName: item.displayName,
          canonicalName: item.canonicalName || normalizeIngredientName(item.displayName)
        }))
      };
      let dish = null;
      if (editingId) {
        const data = await apiRequest(`/api/kitchen/dishes/${editingId}`, { method: "PUT", body: JSON.stringify(payload) });
        dish = data.dish;
      } else {
        const data = await apiRequest("/api/kitchen/dishes", { method: "POST", body: JSON.stringify(payload) });
        dish = data.dish;
      }
      if (dish) await onSaved?.(dish);
      resetAndClose();
    } catch (err) {
      setError(err.message || "No se pudo guardar el plato.");
    } finally {
      setSaving(false);
    }
  };

  const handleAddIngredientToDish = async (ingredientName) => {
    if (!editingId || !ingredientName) return;
    const updatedIngredients = [...(form.ingredients || []), { displayName: ingredientName }];
    try {
      const result = await apiRequest(`/api/kitchen/dishes/${editingId}`, {
        method: "PUT",
        body: JSON.stringify({
          name: form.name,
          ingredients: updatedIngredients,
          isDinner: form.isDinner,
          special: form.special,
          active: form.active,
          allowRandom: form.allowRandom,
          isArchived: form.isArchived,
          dishCategoryId: form.dishCategoryId || null
        })
      });
      if (result.dish) {
        const resolved = await resolveIngredients(result.dish.ingredients || []);
        setForm((prev) => ({ ...prev, ingredients: resolved }));
        if (result.overridden && result.dish._id) setEditingId(String(result.dish._id));
      }
    } catch {
      // silently ignore — not critical
    }
  };

  const saveRecipe = async () => {
    if (!editingId) return;
    setRecipeError("");
    setRecipeSaved(false);
    setRecipeSaving(true);
    try {
      const result = await apiRequest(`/api/kitchen/dishes/${editingId}/recipe`, {
        method: "PUT",
        body: JSON.stringify({
          ingredients: recipe.ingredients || [],
          steps: recipe.steps || null,
          baseServings: recipe.servings || recipe.baseServings || null,
          servings: recipe.servings || null
        })
      });
      if (result.overridden && result.dish?.id) setEditingId(result.dish.id);
      setRecipeSaved(true);
      setRecipeEditing(false);
      setTimeout(() => setRecipeSaved(false), 2500);
      await onRecipeSaved?.();
    } catch (err) {
      setRecipeError(err.message || "No se pudo guardar la receta.");
    } finally {
      setRecipeSaving(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="kitchen-modal-backdrop" role="presentation">
      <div
        className="kitchen-modal"
        role="dialog"
        aria-modal="true"
        aria-label={editingId ? "Editar plato" : "Crear plato"}
        onClick={(event) => event.stopPropagation()}
      >
        {/* Header */}
        <div className="kitchen-modal-header">
          <div>
            <h3>{editingId ? "Editar plato" : "Nuevo plato"}</h3>
            <p className="kitchen-muted">
              {editingId ? "Modifica los datos, ingredientes o receta." : "Añade nombre, categoría e ingredientes."}
            </p>
          </div>
          <button className="kitchen-icon-button" type="button" onClick={resetAndClose} aria-label="Cerrar">
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path d="M6 6l12 12M18 6l-12 12" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
            </svg>
          </button>
        </div>

        {/* Tabs */}
        <div className="recipe-tabs">
          <button type="button" className={activeTab === "datos" ? "is-active" : ""} onClick={() => setActiveTab("datos")}>
            Datos
          </button>
          <button type="button" className={activeTab === "receta" ? "is-active" : ""} onClick={() => setActiveTab("receta")}>
            Elaboración
            {hasExistingRecipe ? <span className="dish-modal-recipe-dot" aria-label="Tiene elaboración" /> : null}
          </button>
        </div>

        {/* ── ELABORACIÓN TAB ──────────────────────────────────────── */}
        {activeTab === "receta" ? (
          <div className="recipe-tab-content">
            {hasExistingRecipe ? (
              <>
                {recipeEditing && isPro ? (
                  /* Pro — editing mode */
                  <>
                    <RecipeEditor
                      recipeIngredients={recipe.ingredients}
                      recipeSteps={recipe.steps}
                      recipeServings={recipe.servings}
                      recipeBaseServings={recipe.baseServings}
                      dishIngredientNames={dishIngredientNames}
                      onAddIngredientToDish={editingId ? handleAddIngredientToDish : undefined}
                      onChange={setRecipe}
                      readOnly={false}
                    />
                    {recipeError ? <div className="kitchen-alert error" style={{ marginTop: 8 }}>{recipeError}</div> : null}
                    {recipeSaved ? <div className="kitchen-alert success" style={{ marginTop: 8 }}>Elaboración guardada.</div> : null}
                    <div className="recipe-save-bar">
                      {editingId ? (
                        <div style={{ display: "flex", gap: 8 }}>
                          <button type="button" className="kitchen-button" onClick={saveRecipe} disabled={recipeSaving}>
                            {recipeSaving ? "Guardando..." : "Guardar elaboración"}
                          </button>
                          <button type="button" className="kitchen-button ghost" onClick={() => setRecipeEditing(false)}>
                            Cancelar
                          </button>
                        </div>
                      ) : (
                        <p className="kitchen-muted">Guarda el plato primero para poder añadir su elaboración.</p>
                      )}
                    </div>
                  </>
                ) : (
                  /* Read-only view (all plans) */
                  <>
                    <RecipeEditor
                      recipeIngredients={recipe.ingredients}
                      recipeSteps={recipe.steps}
                      recipeServings={recipe.servings}
                      recipeBaseServings={recipe.baseServings}
                      dishIngredientNames={dishIngredientNames}
                      onChange={setRecipe}
                      readOnly
                    />
                    {recipeSaved ? <div className="kitchen-alert success" style={{ marginTop: 8 }}>Elaboración guardada.</div> : null}
                    <div className="recipe-save-bar">
                      {isPro ? (
                        <button type="button" className="kitchen-button secondary" onClick={() => setRecipeEditing(true)}>
                          Editar elaboración
                        </button>
                      ) : (
                        <div className="dish-recipe-lock-bar">
                          <ProBadge />
                          <span>Edición disponible en Pro y Premium</span>
                          <button
                            type="button"
                            className="kitchen-button ghost"
                            style={{ marginLeft: "auto", fontSize: "0.79rem" }}
                            onClick={() => navigate(`/kitchen/upgrade?from=recipe`)}
                          >
                            Mejorar plan
                          </button>
                        </div>
                      )}
                    </div>
                  </>
                )}
              </>
            ) : isPro ? (
              /* Pro — no elaboración yet, empty editor */
              <>
                <RecipeEditor
                  recipeIngredients={recipe.ingredients}
                  recipeSteps={recipe.steps}
                  recipeServings={recipe.servings}
                  recipeBaseServings={recipe.baseServings}
                  dishIngredientNames={dishIngredientNames}
                  onAddIngredientToDish={editingId ? handleAddIngredientToDish : undefined}
                  onChange={setRecipe}
                  readOnly={false}
                />
                {recipeError ? <div className="kitchen-alert error" style={{ marginTop: 8 }}>{recipeError}</div> : null}
                {recipeSaved ? <div className="kitchen-alert success" style={{ marginTop: 8 }}>Elaboración guardada.</div> : null}
                <div className="recipe-save-bar">
                  {editingId ? (
                    <button type="button" className="kitchen-button" onClick={saveRecipe} disabled={recipeSaving}>
                      {recipeSaving ? "Guardando..." : "Guardar elaboración"}
                    </button>
                  ) : (
                    <p className="kitchen-muted">Guarda el plato primero para poder añadir su elaboración.</p>
                  )}
                </div>
              </>
            ) : (
              /* Basic — no elaboración */
              <div className="pro-gate-message">
                <p className="kitchen-muted">Añade una elaboración detallada a este plato con el plan</p>
                <button
                  type="button"
                  className="pro-gate-pill"
                  onClick={() => navigate(`/kitchen/upgrade?from=${encodeURIComponent(window.location.pathname)}`)}
                >
                  <ProBadge /> Actualizar plan
                </button>
              </div>
            )}
          </div>
        ) : null}

        {/* ── DATOS TAB ─────────────────────────────────────────────── */}
        <form onSubmit={onSave} className="kitchen-form" style={{ display: activeTab === "datos" ? undefined : "none" }}>

          {/* 1. Name */}
          <label className="kitchen-field">
            <span className="kitchen-label">Nombre del plato</span>
            <input
              className="kitchen-input"
              value={form.name}
              onChange={(event) => setForm((prev) => ({ ...prev, name: event.target.value }))}
              required
              placeholder="Ej. Pollo al horno"
            />
          </label>

          {/* 2. Category */}
          <div className="kitchen-field">
            <span className="kitchen-label">Categoría</span>
            <SearchableSelect
              options={dishCategoryOptions}
              value={form.dishCategoryId || ""}
              onChange={(val) => setForm((prev) => ({ ...prev, dishCategoryId: val }))}
              emptyLabel="Sin categoría"
              placeholder="Buscar categoría..."
            />
          </div>

          {/* 3. Ingredients */}
          <div className="kitchen-field kitchen-dish-ingredients">
            <span className="kitchen-label">Ingredientes</span>
            <IngredientPicker
              value={form.ingredients}
              onChange={(ingredients) => setForm((prev) => ({ ...prev, ingredients }))}
              categories={categories}
              onCategoryCreated={onCategoryCreated}
              onCreateStateChange={setIsCreatingIngredient}
              mode="recipe"
            />
            {pendingCount ? (
              <p className="kitchen-inline-warning">
                {pendingCount} ingrediente{pendingCount > 1 ? "s" : ""} pendiente{pendingCount > 1 ? "s" : ""} de vincular con el catálogo.
              </p>
            ) : null}
          </div>

          {/* 4. Advanced options */}
          <div className="dish-modal-advanced">
            <p className="dish-modal-advanced-label">Opciones</p>

            {/* isDinner */}
            <div className="dish-modal-flag-row">
              <div className="dish-modal-flag-main">
                <span className="dish-modal-flag-title">
                  Plato de cena
                  {!canDinnerDishes ? <span className="dinner-gate-pro-badge dinner-gate-pro-badge-inline">PRO</span> : null}
                </span>
                {!canDinnerDishes ? (
                  <span className="dish-modal-flag-hint">Disponible en Pro y Premium</span>
                ) : null}
              </div>
              {canDinnerDishes ? (
                <label className="kitchen-toggle" htmlFor="dish-dinnerswitch">
                  <input
                    id="dish-dinnerswitch"
                    type="checkbox"
                    className="kitchen-toggle-input"
                    checked={form.isDinner}
                    onChange={(e) => setForm((prev) => ({ ...prev, isDinner: e.target.checked }))}
                  />
                  <span className="kitchen-toggle-track" aria-hidden="true" />
                </label>
              ) : (
                <label className="kitchen-toggle kitchen-toggle-locked" title="Requiere plan Pro o Premium">
                  <input type="checkbox" className="kitchen-toggle-input" checked={false} disabled readOnly />
                  <span className="kitchen-toggle-track" aria-hidden="true" />
                </label>
              )}
            </div>

            {/* special */}
            <div className="dish-modal-flag-row">
              <div className="dish-modal-flag-main">
                <span className="dish-modal-flag-title">Plato especial</span>
                <span className="dish-modal-flag-hint">No aparecerá en sugerencias aleatorias</span>
              </div>
              <label className="kitchen-toggle" htmlFor="dish-specialswitch">
                <input
                  id="dish-specialswitch"
                  type="checkbox"
                  className="kitchen-toggle-input"
                  checked={form.special}
                  onChange={(e) => setForm((prev) => ({ ...prev, special: e.target.checked }))}
                />
                <span className="kitchen-toggle-track" aria-hidden="true" />
              </label>
            </div>

            {/* allowRandom */}
            <div className="dish-modal-flag-row">
              <div className="dish-modal-flag-main">
                <span className="dish-modal-flag-title">Incluir en randomización</span>
                <span className="dish-modal-flag-hint">Si lo desactivas, este plato no entrará en randomización</span>
              </div>
              <label className="kitchen-toggle" htmlFor="dish-randomswitch">
                <input
                  id="dish-randomswitch"
                  type="checkbox"
                  className="kitchen-toggle-input"
                  checked={form.allowRandom}
                  onChange={(e) => setForm((prev) => ({ ...prev, allowRandom: e.target.checked }))}
                />
                <span className="kitchen-toggle-track" aria-hidden="true" />
              </label>
            </div>
          </div>

          {error ? <div className="kitchen-alert error">{error}</div> : null}

          <div className="kitchen-modal-actions">
            {isCreatingIngredient ? (
              <div className="kitchen-inline-warning">Termina de crear el ingrediente para guardar el plato.</div>
            ) : (
              <button className="kitchen-button" type="submit" disabled={saving}>
                {saving ? "Guardando..." : "Guardar"}
              </button>
            )}
            <button className="kitchen-button ghost" type="button" onClick={resetAndClose}>Cancelar</button>
          </div>
        </form>
      </div>
    </div>
  );
}
