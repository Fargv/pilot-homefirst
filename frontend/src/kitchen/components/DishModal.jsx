import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { apiRequest } from "../api.js";
import IngredientPicker from "./IngredientPicker.jsx";
import { normalizeIngredientName } from "../utils/normalize.js";

const EMPTY_FORM = { name: "", ingredients: [], sidedish: false };

export default function DishModal({
  isOpen,
  onClose,
  onSaved,
  categories = [],
  onCategoryCreated,
  initialDish = null,
  initialName = "",
  initialSidedish = false
}) {
  const [form, setForm] = useState(EMPTY_FORM);
  const [editingId, setEditingId] = useState(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [isCreatingIngredient, setIsCreatingIngredient] = useState(false);
  const ingredientCache = useRef(new Map());

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
          const canonicalName = String(
            item?.canonicalName || normalizeIngredientName(displayName)
          ).trim();
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
    const setup = async () => {
      if (initialDish?._id) {
        const ingredients = await resolveIngredients(initialDish.ingredients || []);
        if (!active) return;
        setForm({
          name: initialDish.name || "",
          ingredients,
          sidedish: Boolean(initialDish.sidedish)
        });
        setEditingId(initialDish._id);
      } else {
        setForm({
          name: initialName || "",
          ingredients: [],
          sidedish: Boolean(initialSidedish)
        });
        setEditingId(null);
      }
    };
    setup();
    return () => {
      active = false;
    };
  }, [initialDish, initialName, initialSidedish, isOpen, resolveIngredients]);

  const pendingCount = useMemo(
    () => (form.ingredients || []).filter((item) => item.status === "pending").length,
    [form.ingredients]
  );

  const resetAndClose = () => {
    setForm(EMPTY_FORM);
    setEditingId(null);
    setError("");
    setIsCreatingIngredient(false);
    onClose?.();
  };

  const onSave = async (event) => {
    event.preventDefault();
    setError("");
    setSaving(true);
    try {
      const payload = {
        name: form.name,
        sidedish: form.sidedish,
        ingredients: (form.ingredients || []).map((item) => ({
          ingredientId: item.ingredientId,
          displayName: item.displayName,
          canonicalName: item.canonicalName || normalizeIngredientName(item.displayName)
        }))
      };
      let dish = null;
      if (editingId) {
        const data = await apiRequest(`/api/kitchen/dishes/${editingId}`, {
          method: "PUT",
          body: JSON.stringify(payload)
        });
        dish = data.dish;
      } else {
        const data = await apiRequest("/api/kitchen/dishes", {
          method: "POST",
          body: JSON.stringify(payload)
        });
        dish = data.dish;
      }
      if (dish) {
        await onSaved?.(dish);
      }
      resetAndClose();
    } catch (err) {
      setError(err.message || "No se pudo guardar el plato.");
    } finally {
      setSaving(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="kitchen-modal-backdrop" role="presentation" onClick={resetAndClose}>
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
          <button className="kitchen-icon-button" type="button" onClick={resetAndClose} aria-label="Cerrar">
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
              onChange={(event) => setForm((prev) => ({ ...prev, name: event.target.value }))}
              required
              placeholder="Ej. Pollo al horno"
            />
          </label>
          <div className="kitchen-field kitchen-toggle-field">
            <div className="kitchen-toggle-row">
              <span className="kitchen-label">Guarnición</span>
              <label className="kitchen-toggle" htmlFor="dish-sideswitch">
                <input
                  id="dish-sideswitch"
                  type="checkbox"
                  className="kitchen-toggle-input"
                  checked={form.sidedish}
                  onChange={(event) =>
                    setForm((prev) => ({ ...prev, sidedish: event.target.checked }))
                  }
                />
                <span className="kitchen-toggle-track" aria-hidden="true" />
              </label>
            </div>
          </div>
          <div className="kitchen-field kitchen-dish-ingredients">
            <span className="kitchen-label">Ingredientes</span>
            <IngredientPicker
              value={form.ingredients}
              onChange={(ingredients) => setForm((prev) => ({ ...prev, ingredients }))}
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
            <button className="kitchen-button ghost" type="button" onClick={resetAndClose}>
              Cancelar
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
