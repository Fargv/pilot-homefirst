import React, { useEffect, useMemo, useState } from "react";
import { apiRequest } from "../api.js";
import CategoryChip from "./CategoryChip.jsx";
import { emptyCategory, PASTEL_PALETTE, resolveCategoryColors } from "./categoryUtils.js";
import { normalizeIngredientName } from "../utils/normalize.js";

const EMPTY_FORM = { name: "", canonicalName: "", categoryId: "", active: true };

export default function IngredientModal({
  isOpen,
  onClose,
  onSaved,
  categories = [],
  onCategoryCreated,
  initialIngredient = null,
  scope = undefined
}) {
  const [form, setForm] = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [categoryQuery, setCategoryQuery] = useState("");
  const [showCategoryModal, setShowCategoryModal] = useState(false);
  const [categoryDraftName, setCategoryDraftName] = useState("");
  const [categoryColor, setCategoryColor] = useState(null);
  const [creatingCategory, setCreatingCategory] = useState(false);
  const [canonicalTouched, setCanonicalTouched] = useState(false);

  const editingId = initialIngredient?._id || null;

  useEffect(() => {
    if (!isOpen) return;
    setError("");
    setCategoryQuery("");
    setShowCategoryModal(false);
    setCategoryDraftName("");
    setCategoryColor(null);
    setCanonicalTouched(false);
    if (initialIngredient) {
      const initialCategoryId =
        initialIngredient.categoryId?._id || initialIngredient.categoryId || "";
      setForm({
        name: initialIngredient.name || "",
        canonicalName: initialIngredient.canonicalName || "",
        categoryId: initialCategoryId,
        active: typeof initialIngredient.active === "boolean" ? initialIngredient.active : true
      });
    } else {
      setForm(EMPTY_FORM);
    }
  }, [initialIngredient, isOpen]);

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

  const selectedCategory = useMemo(
    () => categories.find((category) => category._id === form.categoryId) || null,
    [categories, form.categoryId]
  );

  const onNameChange = (event) => {
    const nextName = event.target.value;
    setForm((prev) => ({
      ...prev,
      name: nextName,
      canonicalName: canonicalTouched ? prev.canonicalName : normalizeIngredientName(nextName)
    }));
  };

  const closeModal = () => {
    setForm(EMPTY_FORM);
    setError("");
    setCategoryQuery("");
    setShowCategoryModal(false);
    setCategoryDraftName("");
    setCategoryColor(null);
    setCanonicalTouched(false);
    onClose?.();
  };

  const handleCreateCategory = async () => {
    if (!onCategoryCreated) return;
    if (!categoryDraftName.trim()) return;
    setCreatingCategory(true);
    try {
      const category = await onCategoryCreated(categoryDraftName.trim(), categoryColor);
      setForm((prev) => ({ ...prev, categoryId: category._id }));
      setCategoryQuery("");
      setShowCategoryModal(false);
      setCategoryDraftName("");
      setCategoryColor(null);
    } catch (err) {
      setError(err.message || "No se pudo crear la categoría.");
    } finally {
      setCreatingCategory(false);
    }
  };

  const onSave = async (event) => {
    event.preventDefault();
    setError("");
    if (!form.name.trim()) {
      setError("El nombre del ingrediente es obligatorio.");
      return;
    }
    if (!form.categoryId) {
      setError("Selecciona una categoría para continuar.");
      return;
    }
    setSaving(true);
    try {
      const payload = {
        name: form.name.trim(),
        canonicalName: form.canonicalName.trim() || normalizeIngredientName(form.name),
        categoryId: form.categoryId,
        active: Boolean(form.active),
        ...(scope ? { scope } : {})
      };
      const data = editingId
        ? await apiRequest(`/api/kitchenIngredients/${editingId}`, {
            method: "PUT",
            body: JSON.stringify(payload)
          })
        : await apiRequest("/api/kitchenIngredients", {
            method: "POST",
            body: JSON.stringify(payload)
          });
      if (data?.ingredient) {
        await onSaved?.(data.ingredient);
      }
      closeModal();
    } catch (err) {
      setError(err.message || "No se pudo guardar el ingrediente.");
    } finally {
      setSaving(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="kitchen-modal-backdrop" role="presentation" onClick={closeModal}>
      <div
        className="kitchen-modal"
        role="dialog"
        aria-modal="true"
        aria-label={editingId ? "Editar ingrediente" : "Crear ingrediente"}
        onClick={(event) => event.stopPropagation()}
      >
        <div className="kitchen-modal-header">
          <div>
            <h3>{editingId ? "Editar ingrediente" : "Crear ingrediente"}</h3>
            <p className="kitchen-muted">
              Ajusta los datos del ingrediente y define su categoría en el catálogo.
            </p>
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
            <span className="kitchen-label">Nombre del ingrediente</span>
            <input
              className="kitchen-input"
              value={form.name}
              onChange={onNameChange}
              required
              placeholder="Ej. Tomate"
            />
          </label>
          <label className="kitchen-field">
            <span className="kitchen-label">Canonical name</span>
            <input
              className="kitchen-input"
              value={form.canonicalName}
              onChange={(event) => {
                setCanonicalTouched(true);
                setForm((prev) => ({ ...prev, canonicalName: event.target.value }));
              }}
              placeholder={normalizeIngredientName(form.name)}
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
                const isSelected = form.categoryId === category._id;
                return (
                  <button
                    key={category._id}
                    className={`kitchen-category-option ${isSelected ? "selected" : ""}`}
                    type="button"
                    onClick={() => setForm((prev) => ({ ...prev, categoryId: category._id }))}
                  >
                    <CategoryChip
                      label={category.name}
                      colorBg={colors.colorBg}
                      colorText={colors.colorText}
                    />
                    {isSelected ? <span className="kitchen-category-check" aria-hidden="true">✓</span> : null}
                  </button>
                );
              })}
              {!hasExactCategory && categoryQuery ? (
                <button
                  className="kitchen-button ghost"
                  type="button"
                  onClick={() => {
                    setCategoryDraftName(categoryQuery.trim());
                    setShowCategoryModal(true);
                  }}
                >
                  Crear categoría “{categoryQuery}”
                </button>
              ) : null}
            </div>
            {selectedCategory ? (
              <div className="kitchen-ingredient-selected-category">
                <span className="kitchen-muted">Seleccionada:</span>
                <CategoryChip
                  label={selectedCategory.name}
                  colorBg={selectedCategory.colorBg || emptyCategory.colorBg}
                  colorText={selectedCategory.colorText || emptyCategory.colorText}
                />
              </div>
            ) : null}
          </div>
          <div className="kitchen-field kitchen-toggle-field">
            <div className="kitchen-toggle-row">
              <span className="kitchen-label">Activo</span>
              <label className="kitchen-toggle" htmlFor="ingredient-active">
                <input
                  id="ingredient-active"
                  type="checkbox"
                  className="kitchen-toggle-input"
                  checked={form.active}
                  onChange={(event) =>
                    setForm((prev) => ({ ...prev, active: event.target.checked }))
                  }
                />
                <span className="kitchen-toggle-track" aria-hidden="true" />
              </label>
            </div>
          </div>
          {error ? <div className="kitchen-alert error">{error}</div> : null}
          <div className="kitchen-modal-actions">
            <button className="kitchen-button" type="submit" disabled={saving}>
              {saving ? "Guardando..." : "Guardar"}
            </button>
            <button className="kitchen-button ghost" type="button" onClick={closeModal}>
              Cancelar
            </button>
          </div>
        </form>
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
    </div>
  );
}

