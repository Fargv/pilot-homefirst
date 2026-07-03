import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { apiRequest } from "../api.js";
import IngredientPicker from "./IngredientPicker.jsx";
import RecipeEditor from "./RecipeEditor.jsx";
import SearchableSelect from "./ui/SearchableSelect.jsx";
import { ProBadge } from "./ui/ProBadge.jsx";
import { normalizeIngredientName } from "../utils/normalize.js";
import { useAuth } from "../auth.jsx";
import { emitOnboardingEvent, ONBOARDING_EVENTS } from "./tour/guidedOnboardingEvents.js";
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

function getDishIngredientName(item) {
  return String(item?.displayName || item?.name || item?.canonicalName || "").trim();
}

function getIngredientKeys(item) {
  const keys = [];
  if (item?.ingredientId) keys.push(`id:${String(item.ingredientId)}`);
  const normalizedName = normalizeIngredientName(getDishIngredientName(item));
  if (normalizedName) keys.push(`name:${normalizedName}`);
  return keys;
}

function dishIngredientsToRecipeIngredients(ingredients = []) {
  return (ingredients || [])
    .map((item) => ({
      name: getDishIngredientName(item),
      quantity: "",
      ingredientId: item?.ingredientId || null
    }))
    .filter((item) => item.name);
}

function mergeDishIngredientsIntoRecipe(recipeIngredients = [], dishIngredients = []) {
  const existing = new Set();
  (recipeIngredients || []).forEach((item) => {
    getIngredientKeys(item).forEach((key) => existing.add(key));
  });
  const additions = dishIngredientsToRecipeIngredients(dishIngredients).filter((item) => {
    const keys = getIngredientKeys(item);
    if (!keys.length || keys.some((key) => existing.has(key))) return false;
    keys.forEach((key) => existing.add(key));
    return true;
  });
  return additions.length ? [...recipeIngredients, ...additions] : recipeIngredients;
}

function hasRecipeContent(recipe = {}) {
  const hasSteps = Boolean(recipe?.steps);
  const hasIngredients = (recipe?.ingredients || []).some((item) => (
    String(item?.name || "").trim() || item?.quantity
  ));
  return hasSteps || hasIngredients || recipe?.servings != null || recipe?.prepMinutes != null || recipe?.cookMinutes != null;
}

export default function DishModal({
  isOpen,
  onClose,
  onSaved,
  onRecipeSaved,
  categories = [],
  dishCategories = [],
  onCategoryCreated,
  onIngredientCreated,
  initialDish = null,
  initialName = "",
  initialIsDinner = false,
  scope = undefined,
  originInfo = null,
  onRevertOriginal = undefined
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
  const [recipeDirty, setRecipeDirty] = useState(false);
  const [persistedRecipeHasContent, setPersistedRecipeHasContent] = useState(false);
  const ingredientCache = useRef(new Map());

  const isDiod = user?.globalRole === "diod";
  const isPro = isDiod || canRandomizeFullWeek(user);
  const canDinnerDishes = isDiod || canUseDinnersFeature(user);

  const hasExistingRecipe = hasRecipeContent(recipe);
  const shouldEditRecipe = isPro && (recipeEditing || !persistedRecipeHasContent);

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
    setActiveTab(initialDish?._id ? "receta" : "datos");
    setRecipeEditing(false);
    setRecipeDirty(false);
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
        const initialRecipe = initialDish.recipe || {};
        const initialRecipeHasContent = hasRecipeContent(initialRecipe);
        const existingRecipeIngredients = initialRecipe.ingredients || [];
        const recipeIngredients = existingRecipeIngredients.length > 0
          ? existingRecipeIngredients
          : (initialDish.ingredients || []).map((ing) => ({
              name: ing.displayName || ing.canonicalName || "",
              quantity: "",
              ingredientId: ing.ingredientId || null
            })).filter((ing) => ing.name);
        setRecipe({
          ingredients: recipeIngredients,
          steps: initialRecipe.steps || null,
          baseServings: initialRecipe.baseServings || initialRecipe.servings || null,
          servings: initialRecipe.baseServings || initialRecipe.servings || null,
          prepMinutes: initialRecipe.prepMinutes || null,
          cookMinutes: initialRecipe.cookMinutes || null
        });
        setPersistedRecipeHasContent(initialRecipeHasContent);
        setRecipeEditing(!initialRecipeHasContent);
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
        setPersistedRecipeHasContent(false);
        setRecipeEditing(true);
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
    setRecipeDirty(false);
    setPersistedRecipeHasContent(false);
    onClose?.();
  };

  const updateRecipe = useCallback((updater) => {
    setRecipe((prev) => (typeof updater === "function" ? updater(prev) : updater));
    setRecipeDirty(true);
  }, []);

  useEffect(() => {
    const dishIngredients = form.ingredients || [];
    if (!dishIngredients.length) return;
    setRecipe((prev) => {
      const nextIngredients = mergeDishIngredientsIntoRecipe(prev.ingredients || [], dishIngredients);
      if (nextIngredients === (prev.ingredients || [])) return prev;
      return { ...prev, ingredients: nextIngredients };
    });
  }, [form.ingredients]);

  const buildDishPayload = () => ({
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
  });

  const saveDishOnly = async () => {
    const payload = buildDishPayload();
    let dish = null;
    const isCreate = !editingId;
    if (editingId) {
      const data = await apiRequest(`/api/kitchen/dishes/${editingId}`, { method: "PUT", body: JSON.stringify(payload) });
      dish = data.dish;
    } else {
      const data = await apiRequest("/api/kitchen/dishes", { method: "POST", body: JSON.stringify(payload) });
      dish = data.dish;
    }
    if (dish?._id) {
      setEditingId(String(dish._id));
      if (isCreate) {
        emitOnboardingEvent(ONBOARDING_EVENTS.DISH_CREATED, {
          dishId: String(dish._id),
          dishName: dish.name || ""
        });
      }
      await onSaved?.(dish);
    }
    return dish;
  };

  const saveRecipeForDish = async (dishId, baseDish = null) => {
    const result = await apiRequest(`/api/kitchen/dishes/${dishId}/recipe`, {
      method: "PUT",
      body: JSON.stringify({
        ingredients: recipe.ingredients || [],
        steps: recipe.steps || null,
        baseServings: recipe.servings || recipe.baseServings || null,
        servings: recipe.servings || null,
        prepMinutes: recipe.prepMinutes || null,
        cookMinutes: recipe.cookMinutes || null
      })
    });
    const resultDish = result.dish || {};
    const nextId = resultDish._id || resultDish.id || baseDish?._id || dishId;
    const mergedDish = {
      ...(initialDish || {}),
      ...(baseDish || {}),
      _id: String(nextId),
      recipe: resultDish.recipe || recipe
    };
    if (result.overridden && nextId) setEditingId(String(nextId));
    setRecipe(mergedDish.recipe || recipe);
    setPersistedRecipeHasContent(hasRecipeContent(mergedDish.recipe || recipe));
    setRecipeDirty(false);
    setRecipeEditing(false);
    await onRecipeSaved?.(mergedDish);
    return mergedDish;
  };

  const saveDishAndRecipe = async ({ closeAfterSave = false, requireRecipeSave = false } = {}) => {
    setError("");
    setRecipeError("");
    setRecipeSaved(false);
    setSaving(true);
    setRecipeSaving(true);
    try {
      if (!String(form.name || "").trim()) {
        throw new Error("El nombre del plato es obligatorio.");
      }
      const dish = await saveDishOnly();
      const dishId = dish?._id || editingId;
      if (isPro && dishId && (requireRecipeSave || recipeDirty)) {
        await saveRecipeForDish(String(dishId), dish);
        setRecipeSaved(true);
        setTimeout(() => setRecipeSaved(false), 2500);
      }
      if (closeAfterSave) resetAndClose();
    } catch (err) {
      const message = err.message || "No se pudo guardar el plato.";
      setError(message);
      setRecipeError(message);
    } finally {
      setSaving(false);
      setRecipeSaving(false);
    }
  };

  const onSave = async (event) => {
    event.preventDefault();
    await saveDishAndRecipe({ closeAfterSave: true });
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
    await saveDishAndRecipe({ requireRecipeSave: true });
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
          <button type="button" className={activeTab === "receta" ? "is-active" : ""} onClick={() => setActiveTab("receta")}>
            Elaboración
            {hasExistingRecipe ? <span className="dish-modal-recipe-dot" aria-label="Tiene elaboración" /> : null}
          </button>
          <button type="button" className={activeTab === "datos" ? "is-active" : ""} onClick={() => setActiveTab("datos")}>
            Datos e ingredientes
          </button>
        </div>

        {/* ── ELABORACIÓN TAB ──────────────────────────────────────── */}
        {editingId && originInfo?.canRevert ? (
          <div className="dish-modal-origin-row">
            <span className={`kitchen-dish-origin-badge is-${originInfo.type}`}>{originInfo.label}</span>
            <button type="button" className="dish-modal-revert-button" onClick={onRevertOriginal}>
              Volver al original
            </button>
          </div>
        ) : null}

        {activeTab === "receta" ? (
          <div className="recipe-tab-content">
            {hasExistingRecipe ? (
              <>
                {shouldEditRecipe ? (
                  /* Pro — editing mode */
                  <>
                    <RecipeEditor
                      recipeIngredients={recipe.ingredients}
                      recipeSteps={recipe.steps}
                      recipeServings={recipe.servings}
                      recipeBaseServings={recipe.baseServings}
                      recipePrepMinutes={recipe.prepMinutes}
                      recipeCookMinutes={recipe.cookMinutes}
                      dishIngredientNames={dishIngredientNames}
                      onAddIngredientToDish={editingId ? handleAddIngredientToDish : undefined}
                      onChange={updateRecipe}
                      readOnly={false}
                    />
                    {recipeError ? <div className="kitchen-alert error" style={{ marginTop: 8 }}>{recipeError}</div> : null}
                    {recipeSaved ? <div className="kitchen-alert success" style={{ marginTop: 8 }}>Elaboración guardada.</div> : null}
                    <div className="recipe-save-bar">
                      <div style={{ display: "flex", gap: 8 }}>
                          <button type="button" className="kitchen-button" onClick={saveRecipe} disabled={recipeSaving || saving}>
                            {recipeSaving || saving ? "Guardando..." : editingId ? "Guardar elaboración" : "Guardar plato y elaboración"}
                          </button>
                          <button type="button" className="kitchen-button ghost" onClick={() => setRecipeEditing(false)} disabled={!persistedRecipeHasContent}>
                            Cancelar
                          </button>
                        </div>
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
                      recipePrepMinutes={recipe.prepMinutes}
                      recipeCookMinutes={recipe.cookMinutes}
                      dishIngredientNames={dishIngredientNames}
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
                  recipePrepMinutes={recipe.prepMinutes}
                  recipeCookMinutes={recipe.cookMinutes}
                  dishIngredientNames={dishIngredientNames}
                  onAddIngredientToDish={editingId ? handleAddIngredientToDish : undefined}
                  onChange={updateRecipe}
                  readOnly={false}
                />
                {recipeError ? <div className="kitchen-alert error" style={{ marginTop: 8 }}>{recipeError}</div> : null}
                {recipeSaved ? <div className="kitchen-alert success" style={{ marginTop: 8 }}>Elaboración guardada.</div> : null}
                <div className="recipe-save-bar">
                    <button type="button" className="kitchen-button" onClick={saveRecipe} disabled={recipeSaving || saving}>
                      {recipeSaving || saving ? "Guardando..." : editingId ? "Guardar elaboración" : "Guardar plato y elaboración"}
                    </button>
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
              data-tour-id="dish-name-input"
              value={form.name}
              onChange={(event) => {
                const value = event.target.value;
                setForm((prev) => ({ ...prev, name: value }));
                // Tutorial gate: a meaningful name (create mode only).
                if (!editingId && value.trim().length >= 3) {
                  emitOnboardingEvent(ONBOARDING_EVENTS.DISH_NAME_ENTERED);
                }
              }}
              required
              placeholder="Ej. Plato de prueba"
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
          <div className="kitchen-field kitchen-dish-ingredients" data-tour-id="dish-add-ingredient">
            <span className="kitchen-label">Ingredientes</span>
            <IngredientPicker
              value={form.ingredients}
              onChange={(ingredients) => {
                // Tutorial gate: an ingredient was actually added (create mode).
                if (!editingId && (ingredients?.length || 0) > (form.ingredients?.length || 0)) {
                  emitOnboardingEvent(ONBOARDING_EVENTS.DISH_INGREDIENT_ADDED);
                }
                setForm((prev) => ({ ...prev, ingredients }));
              }}
              categories={categories}
              onCategoryCreated={onCategoryCreated}
              onIngredientCreated={onIngredientCreated}
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
              <button className="kitchen-button" type="submit" data-tour-id="dish-save" disabled={saving}>
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
