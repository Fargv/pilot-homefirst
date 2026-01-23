import React, { useEffect, useMemo, useState } from "react";
import { apiRequest } from "../api.js";
import CategoryChip from "./CategoryChip.jsx";
import { normalizeIngredientName } from "../utils/normalize.js";

const emptyCategory = { _id: "", name: "", colorBg: "#eef2ff", colorText: "#4338ca" };

export default function IngredientPicker({ value = [], onChange, categories = [], onCategoryCreated }) {
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
  const [replaceItem, setReplaceItem] = useState(null);

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
        const data = await apiRequest(`/api/kitchenIngredients?q=${encodeURIComponent(query)}`);
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
  }, [query]);

  const filteredCategories = useMemo(() => {
    if (!categoryQuery) return categories;
    const lower = categoryQuery.toLowerCase();
    return categories.filter((category) => category.name.toLowerCase().includes(lower));
  }, [categories, categoryQuery]);

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
    setReplaceItem(itemToReplace);
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
      setShowCreate(false);
      setCreateName("");
      setQuery("");
    } catch (err) {
      setCreateError(err.message || "No se pudo crear el ingrediente.");
    } finally {
      setSaving(false);
    }
  };

  const handleCreateCategory = async () => {
    if (!onCategoryCreated) return;
    if (!categoryQuery.trim()) return;
    setCreatingCategory(true);
    try {
      const category = await onCategoryCreated(categoryQuery.trim());
      setSelectedCategory(category);
      setCategoryQuery("");
    } catch (err) {
      setCreateError(err.message || "No se pudo crear la categoría.");
    } finally {
      setCreatingCategory(false);
    }
  };

  return (
    <div className="kitchen-ingredient-picker">
      <div className="kitchen-chip-list">
        {value.length === 0 ? (
          <span className="kitchen-muted">Sin ingredientes todavía.</span>
        ) : (
          value.map((item) => (
            <div className="kitchen-chip-row" key={`${item.ingredientId || item.canonicalName}`}>
              <CategoryChip
                label={item.displayName}
                colorBg={item.category?.colorBg}
                colorText={item.category?.colorText}
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
          ))
        )}
      </div>

      <div className="kitchen-field">
        <input
          className="kitchen-input"
          placeholder="Busca y añade ingredientes…"
          value={query}
          onChange={(event) => {
            setQuery(event.target.value);
            setShowCreate(false);
          }}
        />
        {searchError ? <span className="kitchen-inline-error">{searchError}</span> : null}
      </div>

      {query ? (
        <div className="kitchen-suggestion-list">
          {searching ? <div className="kitchen-muted">Buscando...</div> : null}
          {!searching && suggestions.length === 0 ? (
            <button className="kitchen-button ghost" type="button" onClick={() => openCreateFlow(query)}>
              Crear “{query}”
            </button>
          ) : (
            suggestions.map((item) => (
              <button
                className="kitchen-suggestion"
                key={item._id}
                type="button"
                onClick={() => handleSelectSuggestion(item)}
              >
                <span className="kitchen-suggestion-name">{item.name}</span>
                <span
                  className="kitchen-suggestion-meta"
                  style={{ color: item.categoryId?.colorText || "#475467" }}
                >
                  {item.categoryId?.name}
                </span>
              </button>
            ))
          )}
        </div>
      ) : null}

      {showCreate ? (
        <div className="kitchen-inline-panel">
          <div className="kitchen-inline-header">
            <strong>Crear ingrediente</strong>
            <span className="kitchen-muted">Añade categoría antes de guardar.</span>
          </div>
          <label className="kitchen-field">
            <span className="kitchen-label">Nombre del ingrediente</span>
            <input
              className="kitchen-input"
              value={createName}
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
              {filteredCategories.map((category) => (
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
                    colorBg={category.colorBg}
                    colorText={category.colorText}
                  />
                </button>
              ))}
              {!filteredCategories.length && categoryQuery ? (
                <button
                  className="kitchen-button ghost"
                  type="button"
                  onClick={handleCreateCategory}
                  disabled={creatingCategory}
                >
                  {creatingCategory ? "Creando..." : `Crear categoría “${categoryQuery}”`}
                </button>
              ) : null}
            </div>
          </div>
          {createError ? <div className="kitchen-inline-error">{createError}</div> : null}
          <div className="kitchen-inline-actions">
            <button className="kitchen-button" type="button" onClick={handleCreateIngredient} disabled={saving}>
              {saving ? "Guardando..." : "Añadir ingrediente"}
            </button>
            <button
              className="kitchen-button ghost"
              type="button"
              onClick={() => {
                setShowCreate(false);
                setCreateName("");
                setCreateError("");
                setReplaceItem(null);
              }}
            >
              Cancelar
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
