import React, { useEffect, useMemo, useRef, useState } from "react";
import { apiRequest } from "../api.js";
import CategoryChip from "./CategoryChip.jsx";
import { emptyCategory, PASTEL_PALETTE, resolveCategoryColors } from "./categoryUtils.js";
import { normalizeIngredientName } from "../utils/normalize.js";

export default function IngredientPicker({
  value = [],
  onChange,
  categories = [],
  onCategoryCreated,
  onCreateStateChange,
  mode = "all"
}) {
  const [query, setQuery] = useState("");
  const [suggestions, setSuggestions] = useState([]);
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState("");
  const [showCreate, setShowCreate] = useState(false);
  const [createName, setCreateName] = useState("");
  const [createError, setCreateError] = useState("");
  const [saving, setSaving] = useState(false);
  const [categoryQuery, setCategoryQuery] = useState("");
  const [selectedCategory, setSelectedCategory] = useState(null);
  const [lastUsedCategory, setLastUsedCategory] = useState(null);
  const [creatingCategory, setCreatingCategory] = useState(false);
  const [showCategoryModal, setShowCategoryModal] = useState(false);
  const [categoryDraftName, setCategoryDraftName] = useState("");
  const [categoryColor, setCategoryColor] = useState(null);
  const [replaceItem, setReplaceItem] = useState(null);
  const searchInputRef = useRef(null);
  const createInputRef = useRef(null);
  const categoryNameInputRef = useRef(null);

  useEffect(() => {
    if (onCreateStateChange) {
      onCreateStateChange(showCreate || showCategoryModal);
    }
  }, [onCreateStateChange, showCreate, showCategoryModal]);

  useEffect(() => {
    if (showCreate) {
      requestAnimationFrame(() => {
        createInputRef.current?.focus();
      });
    }
  }, [showCreate]);

  useEffect(() => {
    if (showCategoryModal) {
      requestAnimationFrame(() => {
        categoryNameInputRef.current?.focus();
      });
    }
  }, [showCategoryModal]);

  useEffect(() => {
    if (!query) {
      setSuggestions([]);
      setSearchError("");
      setSearching(false);
      return;
    }

    let active = true;
    setSearching(true);
    setSearchError("");

    const timeout = setTimeout(async () => {
      try {
        if (import.meta.env.DEV) {
          console.debug("[IngredientPicker] buscando", { query });
        }
        const data = await apiRequest(`/api/kitchenIngredients?q=${encodeURIComponent(query)}${mode === "recipe" ? "&mode=recipe" : ""}`);
        if (!active) return;
        setSuggestions(data.ingredients || []);
      } catch (err) {
        if (!active) return;
        setSearchError(err.message || "No se pudieron buscar ingredientes.");
      } finally {
        if (active) setSearching(false);
      }
    }, 250);

    return () => {
      active = false;
      clearTimeout(timeout);
    };
  }, [mode, query]);

  const normalizedQuery = useMemo(() => normalizeIngredientName(query), [query]);

  const filteredCategories = useMemo(() => {
    if (!categoryQuery) return categories;
    const lower = categoryQuery.toLowerCase();
    return categories.filter((category) => category.name.toLowerCase().includes(lower));
  }, [categories, categoryQuery]);

  const normalizedCategoryQuery = useMemo(
    () => normalizeIngredientName(categoryQuery),
    [categoryQuery]
  );

  const hasExactCategory = useMemo(
    () =>
      Boolean(
        normalizedCategoryQuery &&
          categories.some(
            (category) => normalizeIngredientName(category.name) === normalizedCategoryQuery
          )
      ),
    [categories, normalizedCategoryQuery]
  );

  const visibleSuggestions = useMemo(() => {
    if (!normalizedQuery) return suggestions;
    return suggestions.filter((item) =>
      normalizeIngredientName(item.name || "").includes(normalizedQuery)
    );
  }, [normalizedQuery, suggestions]);

  const addIngredient = (ingredient, displayNameOverride, targetToReplace = null) => {
    const canonicalName = ingredient.canonicalName || normalizeIngredientName(displayNameOverride || ingredient.name);
    const ingredientId = ingredient._id || ingredient.ingredientId;
    const nextBase = targetToReplace ? value.filter((item) => item !== targetToReplace) : value;
    if (
      nextBase.some((item) => item.ingredientId === ingredientId || item.canonicalName === canonicalName)
    ) {
      return;
    }
    const next = [
      ...nextBase,
      {
        ingredientId,
        displayName: displayNameOverride || ingredient.name,
        canonicalName,
        category: ingredient.categoryId || ingredient.category || emptyCategory,
        status: "resolved"
      }
    ];
    onChange(next);
    setReplaceItem(null);
  };

  const handleSelectSuggestion = (ingredient) => {
    addIngredient(ingredient, ingredient.name);
    setQuery("");
    setSuggestions([]);
    setShowCreate(false);
    setCreateName("");
  };

  const openCreateFlow = (name, itemToReplace = null) => {
    setCreateName(name);
    setCreateError("");
    setShowCreate(true);
    setSelectedCategory(lastUsedCategory);
    setCategoryQuery("");
    setShowCategoryModal(false);
    setCategoryDraftName("");
    setCategoryColor(null);
    setReplaceItem(itemToReplace);
  };

  const closeCreateFlow = () => {
    setShowCreate(false);
    setCreateName("");
    setCreateError("");
    setCategoryQuery("");
    setSelectedCategory(null);
    setShowCategoryModal(false);
    setCategoryDraftName("");
    setCategoryColor(null);
    setReplaceItem(null);
    requestAnimationFrame(() => {
      searchInputRef.current?.focus();
    });
  };

  const handleCreateIngredient = async () => {
    if (!createName.trim()) return;
    if (!selectedCategory?._id) {
      setCreateError("Selecciona una categoría para continuar.");
      return;
    }
    setSaving(true);
    setCreateError("");
    try {
      if (import.meta.env.DEV) {
        console.debug("[IngredientPicker] creando ingrediente", {
          name: createName.trim(),
          categoryId: selectedCategory?._id
        });
      }
      const data = await apiRequest("/api/kitchenIngredients", {
        method: "POST",
        body: JSON.stringify({ name: createName, categoryId: selectedCategory._id })
      });
      const ingredient = data.ingredient;
      addIngredient(ingredient, createName.trim(), replaceItem);
      setLastUsedCategory(selectedCategory);
      setQuery("");
      closeCreateFlow();
    } catch (err) {
      setCreateError(err.message || "No se pudo crear el ingrediente.");
    } finally {
      setSaving(false);
    }
  };

  const handleCreateCategory = async () => {
    if (!onCategoryCreated) return;
    if (!categoryDraftName.trim()) return;
    setCreatingCategory(true);
    try {
      const category = await onCategoryCreated(categoryDraftName.trim(), categoryColor);
      setSelectedCategory(category);
      setCategoryQuery("");
      setShowCategoryModal(false);
      setCategoryDraftName("");
      setCategoryColor(null);
    } catch (err) {
      setCreateError(err.message || "No se pudo crear la categoría.");
    } finally {
      setCreatingCategory(false);
    }
  };

  return (
    <div className="kitchen-ingredient-picker">
      <div className="kitchen-field kitchen-ingredient-search">
        <input
          className="kitchen-input"
          placeholder="Busca y añade ingredientes…"
          value={query}
          ref={searchInputRef}
          onChange={(event) => {
            setQuery(event.target.value);
            setShowCreate(false);
          }}
        />
        {searchError ? <span className="kitchen-inline-error">{searchError}</span> : null}
        {query && !showCreate ? (
          <div className="kitchen-suggestion-list">
            {searching ? <div className="kitchen-muted">Buscando...</div> : null}
            {!searching && visibleSuggestions.length === 0 ? (
              <button className="kitchen-button ghost" type="button" onClick={() => openCreateFlow(query)}>
                Crear “{query}”
              </button>
            ) : (
              visibleSuggestions.map((item) => (
                <button
                  className="kitchen-suggestion"
                  key={item._id}
                  type="button"
                  onClick={() => handleSelectSuggestion(item)}
                >
                  <span className="kitchen-suggestion-name">{item.name}</span>
                </button>
              ))
            )}
          </div>
        ) : null}
      </div>

      <div className="kitchen-chip-list">
        {value.length === 0 ? (
          <span className="kitchen-muted">Sin ingredientes todavía.</span>
        ) : (
          value.map((item) => {
            const colors = resolveCategoryColors(item.category);
            return (
              <div className="kitchen-chip-item" key={`${item.ingredientId || item.canonicalName}`}>
                <CategoryChip
                  label={item.displayName}
                  colorBg={colors.colorBg}
                  colorText={colors.colorText}
                  status={item.status === "pending" ? "pending" : ""}
                  onRemove={() => onChange(value.filter((entry) => entry !== item))}
                />
              {item.status === "pending" ? (
                <button
                  className="kitchen-chip-action"
                  type="button"
                  onClick={() => openCreateFlow(item.displayName, item)}
                >
                  Completar
                </button>
              ) : null}
              </div>
            );
          })
        )}
      </div>

      {showCreate ? (
        <div className="kitchen-context-modal-backdrop" role="presentation" onClick={closeCreateFlow}>
          <div
            className="kitchen-context-modal"
            role="dialog"
            aria-modal="true"
            aria-label="Crear ingrediente"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="kitchen-context-modal-header">
              <div>
                <h4>Crear ingrediente</h4>
                <p className="kitchen-muted">Añade un ingrediente rápido y sigue sumando al plato.</p>
              </div>
              <button className="kitchen-icon-button" type="button" onClick={closeCreateFlow} aria-label="Cerrar">
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
            <div className="kitchen-context-modal-body">
              <label className="kitchen-field">
                <span className="kitchen-label">Nombre del ingrediente</span>
                <input
                  className="kitchen-input"
                  value={createName}
                  ref={createInputRef}
                  onChange={(event) => setCreateName(event.target.value)}
                />
              </label>
              <div className="kitchen-field">
                <span className="kitchen-label">Categoría</span>
                <input
                  className="kitchen-input"
                  placeholder="Busca una categoría…"
                  value={categoryQuery}
                  onChange={(event) => setCategoryQuery(event.target.value)}
                />
                <div className="kitchen-category-list">
                  {filteredCategories.map((category) => {
                    const colors = resolveCategoryColors(category);
                    return (
                      <button
                        key={category._id}
                        className={`kitchen-category-option ${
                          selectedCategory?._id === category._id ? "selected" : ""
                        }`}
                        type="button"
                        onClick={() => setSelectedCategory(category)}
                      >
                        <CategoryChip
                          label={category.name}
                          colorBg={colors.colorBg}
                          colorText={colors.colorText}
                        />
                        {selectedCategory?._id === category._id ? (
                          <span className="kitchen-category-check" aria-hidden="true">
                            ✓
                          </span>
                        ) : null}
                      </button>
                    );
                  })}
                  {!hasExactCategory && categoryQuery ? (
                    <button
                      className="kitchen-button ghost"
                      type="button"
                      onClick={() => {
                        setCategoryDraftName(categoryQuery.trim());
                        setCreateError("");
                        setShowCategoryModal(true);
                      }}
                    >
                      Crear categoría “{categoryQuery}”
                    </button>
                  ) : null}
                </div>
              </div>
              {createError ? <div className="kitchen-inline-error">{createError}</div> : null}
            </div>
            <div className="kitchen-context-modal-actions">
              <button className="kitchen-button" type="button" onClick={handleCreateIngredient} disabled={saving}>
                {saving ? "Guardando..." : "Crear ingrediente"}
              </button>
              <button className="kitchen-button secondary" type="button" onClick={closeCreateFlow}>
                Cancelar
              </button>
            </div>
          </div>
          {showCategoryModal ? (
            <div
              className="kitchen-context-modal-backdrop inner"
              role="presentation"
              onClick={(event) => {
                event.stopPropagation();
                setShowCategoryModal(false);
              }}
            >
              <div
                className="kitchen-context-modal small"
                role="dialog"
                aria-modal="true"
                aria-label="Crear categoría"
                onClick={(event) => event.stopPropagation()}
              >
                <div className="kitchen-context-modal-header">
                  <div>
                    <h4>Crear categoría</h4>
                    <p className="kitchen-muted">Define el nombre y elige un color si quieres.</p>
                  </div>
                  <button
                    className="kitchen-icon-button"
                    type="button"
                    onClick={() => setShowCategoryModal(false)}
                    aria-label="Cerrar"
                  >
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
                <div className="kitchen-context-modal-body">
                  <label className="kitchen-field">
                    <span className="kitchen-label">Nombre de categoría</span>
                    <input
                      className="kitchen-input"
                      value={categoryDraftName}
                      ref={categoryNameInputRef}
                      onChange={(event) => setCategoryDraftName(event.target.value)}
                    />
                  </label>
                  <div className="kitchen-field">
                    <span className="kitchen-label">Color (opcional)</span>
                    <div className="kitchen-color-grid">
                      <button
                        className={`kitchen-color-option ${categoryColor ? "" : "selected"}`}
                        type="button"
                        onClick={() => setCategoryColor(null)}
                      >
                        Automático
                      </button>
                      {PASTEL_PALETTE.map((palette) => (
                        <button
                          key={`${palette.colorBg}-${palette.colorText}`}
                          className={`kitchen-color-option swatch ${
                            categoryColor?.colorBg === palette.colorBg ? "selected" : ""
                          }`}
                          type="button"
                          onClick={() => setCategoryColor(palette)}
                          aria-label={`Color ${palette.colorBg}`}
                          style={{
                            background: palette.colorBg,
                            color: palette.colorText
                          }}
                        >
                          Aa
                        </button>
                      ))}
                    </div>
                  </div>
                  {createError ? <div className="kitchen-inline-error">{createError}</div> : null}
                </div>
                <div className="kitchen-context-modal-actions">
                  <button
                    className="kitchen-button"
                    type="button"
                    onClick={handleCreateCategory}
                    disabled={creatingCategory}
                  >
                    {creatingCategory ? "Guardando..." : "Guardar categoría"}
                  </button>
                  <button
                    className="kitchen-button secondary"
                    type="button"
                    onClick={() => setShowCategoryModal(false)}
                  >
                    Cancelar
                  </button>
                </div>
              </div>
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
