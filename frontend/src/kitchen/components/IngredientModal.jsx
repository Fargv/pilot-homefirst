import React, { useEffect, useMemo, useRef, useState } from "react";
import { apiRequest } from "../api.js";
import SearchableSelect from "./ui/SearchableSelect.jsx";
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
  const [duplicateWarning, setDuplicateWarning] = useState(null);
  const [showCategoryModal, setShowCategoryModal] = useState(false);
  const [categoryDraftName, setCategoryDraftName] = useState("");
  const [categoryColor, setCategoryColor] = useState(null);
  const [creatingCategory, setCreatingCategory] = useState(false);
  const [canonicalTouched, setCanonicalTouched] = useState(false);
  const dupCheckTimer = useRef(null);

  const editingId = initialIngredient?._id || null;

  useEffect(() => {
    if (!isOpen) return;
    setError("");
    setDuplicateWarning(null);
    setShowCategoryModal(false);
    setCategoryDraftName("");
    setCategoryColor(null);
    setCanonicalTouched(false);
    if (initialIngredient) {
      setForm({
        name: initialIngredient.name || "",
        canonicalName: initialIngredient.canonicalName || "",
        categoryId: initialIngredient.categoryId?._id || initialIngredient.categoryId || "",
        active: typeof initialIngredient.active === "boolean" ? initialIngredient.active : true
      });
    } else {
      setForm(EMPTY_FORM);
    }
  }, [initialIngredient, isOpen]);

  const categoryOptions = useMemo(
    () => categories.map((c) => {
      const colors = resolveCategoryColors(c);
      return { value: c._id, label: c.name, dotColor: colors.colorText || "#344054" };
    }),
    [categories]
  );

  const onNameChange = (event) => {
    const nextName = event.target.value;
    const nextCanonical = canonicalTouched ? form.canonicalName : normalizeIngredientName(nextName);
    setForm((prev) => ({ ...prev, name: nextName, canonicalName: nextCanonical }));
    setDuplicateWarning(null);
    clearTimeout(dupCheckTimer.current);
    if (nextName.trim()) {
      const canonical = normalizeIngredientName(nextName);
      dupCheckTimer.current = setTimeout(() => {
        apiRequest(`/api/kitchenIngredients?q=${encodeURIComponent(canonical)}`)
          .then((data) => {
            const match = (data.ingredients || []).find((i) => i.canonicalName === canonical);
            if (match && (!editingId || String(match._id) !== String(editingId))) {
              setDuplicateWarning(match.name);
            }
          })
          .catch(() => {});
      }, 450);
    }
  };

  useEffect(() => () => clearTimeout(dupCheckTimer.current), []);

  const closeModal = () => {
    setForm(EMPTY_FORM);
    setError("");
    setDuplicateWarning(null);
    setShowCategoryModal(false);
    setCategoryDraftName("");
    setCategoryColor(null);
    setCanonicalTouched(false);
    onClose?.();
  };

  const handleCreateCategory = async () => {
    if (!onCategoryCreated || !categoryDraftName.trim()) return;
    setCreatingCategory(true);
    try {
      const category = await onCategoryCreated(categoryDraftName.trim(), categoryColor);
      setForm((prev) => ({ ...prev, categoryId: category._id }));
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
        ? await apiRequest(`/api/kitchenIngredients/${editingId}`, { method: "PUT", body: JSON.stringify(payload) })
        : await apiRequest("/api/kitchenIngredients", { method: "POST", body: JSON.stringify(payload) });
      if (data?.ingredient) await onSaved?.(data.ingredient);
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
        {/* Header */}
        <div className="kitchen-modal-header">
          <div>
            <h3>{editingId ? "Editar ingrediente" : "Nuevo ingrediente"}</h3>
            <p className="kitchen-muted">
              {editingId ? "Modifica los datos del ingrediente." : "Define el nombre y selecciona su sección de supermercado."}
            </p>
          </div>
          <button className="kitchen-icon-button" type="button" onClick={closeModal} aria-label="Cerrar">
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path d="M6 6l12 12M18 6l-12 12" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
            </svg>
          </button>
        </div>

        <form onSubmit={onSave} className="kitchen-form">

          {/* Name */}
          <label className="kitchen-field">
            <span className="kitchen-label">Nombre del ingrediente</span>
            <input
              className="kitchen-input"
              value={form.name}
              onChange={onNameChange}
              required
              placeholder="Ej. Tomate"
            />
            {duplicateWarning ? (
              <div className="ingredient-duplicate-warning">
                <svg viewBox="0 0 16 16" width="13" height="13" fill="none" aria-hidden="true">
                  <circle cx="8" cy="8" r="6.5" stroke="currentColor" strokeWidth="1.4" />
                  <path d="M8 5v3.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                  <circle cx="8" cy="11" r="0.8" fill="currentColor" />
                </svg>
                El ingrediente <strong>{duplicateWarning}</strong> ya existe en el catálogo.
              </div>
            ) : null}
          </label>

          {/* Category */}
          <div className="kitchen-field">
            <span className="kitchen-label">Sección del supermercado</span>
            <p className="ingredient-category-hint">
              Indica dónde encuentras normalmente este ingrediente en el supermercado.
            </p>
            <SearchableSelect
              options={categoryOptions}
              value={form.categoryId}
              onChange={(val) => setForm((prev) => ({ ...prev, categoryId: val }))}
              emptyLabel="Seleccionar sección..."
              placeholder="Buscar sección..."
              onCreate={onCategoryCreated ? (query) => { setCategoryDraftName(query); setShowCategoryModal(true); } : undefined}
            />
          </div>

          {/* Active toggle */}
          <div className="kitchen-field kitchen-toggle-field">
            <div className="kitchen-toggle-row">
              <span className="kitchen-label">Activo</span>
              <label className="kitchen-toggle" htmlFor="ingredient-active">
                <input
                  id="ingredient-active"
                  type="checkbox"
                  className="kitchen-toggle-input"
                  checked={form.active}
                  onChange={(event) => setForm((prev) => ({ ...prev, active: event.target.checked }))}
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
            <button className="kitchen-button ghost" type="button" onClick={closeModal}>Cancelar</button>
          </div>
        </form>

        {/* Category creation sub-modal */}
        {showCategoryModal ? (
          <div
            className="kitchen-context-modal-backdrop inner"
            role="presentation"
            onClick={(event) => { event.stopPropagation(); setShowCategoryModal(false); }}
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
                  <h4>Nueva sección</h4>
                  <p className="kitchen-muted">Define el nombre y elige un color si quieres.</p>
                </div>
                <button className="kitchen-icon-button" type="button" onClick={() => setShowCategoryModal(false)} aria-label="Cerrar">
                  <svg viewBox="0 0 24 24" aria-hidden="true">
                    <path d="M6 6l12 12M18 6l-12 12" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                  </svg>
                </button>
              </div>
              <div className="kitchen-context-modal-body">
                <label className="kitchen-field">
                  <span className="kitchen-label">Nombre de sección</span>
                  <input
                    className="kitchen-input"
                    value={categoryDraftName}
                    onChange={(event) => setCategoryDraftName(event.target.value)}
                  />
                </label>
                <div className="kitchen-field">
                  <span className="kitchen-label">Color (opcional)</span>
                  <div className="kitchen-color-grid">
                    <button className={`kitchen-color-option ${categoryColor ? "" : "selected"}`} type="button" onClick={() => setCategoryColor(null)}>
                      Automático
                    </button>
                    {PASTEL_PALETTE.map((palette) => (
                      <button
                        key={`${palette.colorBg}-${palette.colorText}`}
                        className={`kitchen-color-option swatch ${categoryColor?.colorBg === palette.colorBg ? "selected" : ""}`}
                        type="button"
                        onClick={() => setCategoryColor(palette)}
                        aria-label={`Color ${palette.colorBg}`}
                        style={{ background: palette.colorBg, color: palette.colorText }}
                      >
                        Aa
                      </button>
                    ))}
                  </div>
                </div>
              </div>
              <div className="kitchen-context-modal-actions">
                <button className="kitchen-button" type="button" onClick={handleCreateCategory} disabled={creatingCategory}>
                  {creatingCategory ? "Guardando..." : "Guardar sección"}
                </button>
                <button className="kitchen-button secondary" type="button" onClick={() => setShowCategoryModal(false)}>Cancelar</button>
              </div>
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}
