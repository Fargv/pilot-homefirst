import React, { useCallback, useEffect, useRef, useState } from "react";
import { useEditor, EditorContent } from "@tiptap/react";
import { apiRequest } from "../api.js";
import StarterKit from "@tiptap/starter-kit";
import Underline from "@tiptap/extension-underline";
import Link from "@tiptap/extension-link";
import Image from "@tiptap/extension-image";
import Placeholder from "@tiptap/extension-placeholder";
import TextStyle from "@tiptap/extension-text-style";
import Color from "@tiptap/extension-color";
import {
  RECIPE_UNITS,
  isUnitScalable,
  getStructuredQty,
  getRecipeBaseServings
} from "../utils/recipeScaling.js";
import { parseRecipeSteps } from "../utils/recipeStepParser.js";
import RecipeServingsControl from "./RecipeServingsControl.jsx";
import RecipeIngredientsList from "./RecipeIngredientsList.jsx";

// Stable module-level extensions — never recreated, so Tiptap never remounts on mobile
const TIPTAP_EXTENSIONS = [
  StarterKit.configure({ heading: { levels: [2, 3] } }),
  Underline,
  Link.configure({ openOnClick: false }),
  Image.configure({ inline: false }),
  Placeholder.configure({ placeholder: "Describe los pasos de elaboración..." }),
  TextStyle,
  Color
];

const APP_COLORS = [
  { label: "Índigo", value: "#4338ca" },
  { label: "Rojo", value: "#ef4444" },
  { label: "Naranja", value: "#f97316" },
  { label: "Amarillo", value: "#eab308" },
  { label: "Verde", value: "#22c55e" },
  { label: "Cyan", value: "#06b6d4" },
  { label: "Azul", value: "#3b82f6" },
  { label: "Morado", value: "#a855f7" },
  { label: "Oscuro", value: "#1e293b" },
  { label: "Gris", value: "#6b7280" }
];

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

// ─── Ingredient name autocomplete ─────────────────────────────────────────────

function RecipeIngredientInput({ item, index, onUpdateFields }) {
  const [query, setQuery] = useState(item.name || "");
  const [suggestions, setSuggestions] = useState([]);
  const [showDropdown, setShowDropdown] = useState(false);
  const [isLinked, setIsLinked] = useState(Boolean(item.ingredientId));
  const containerRef = useRef(null);
  const timeoutRef = useRef(null);

  useEffect(() => {
    if (item.name !== query && !isLinked) setQuery(item.name || "");
  }, [item.name]);

  const search = (q) => {
    clearTimeout(timeoutRef.current);
    if (!q || q.length < 2) { setSuggestions([]); setShowDropdown(false); return; }
    timeoutRef.current = setTimeout(async () => {
      try {
        const data = await apiRequest(`/api/kitchenIngredients?q=${encodeURIComponent(q)}`);
        setSuggestions(data.ingredients || []);
        setShowDropdown(true);
      } catch { setSuggestions([]); }
    }, 250);
  };

  const handleChange = (e) => {
    const val = e.target.value;
    setQuery(val);
    setIsLinked(false);
    onUpdateFields(index, { name: val, ingredientId: null });
    search(val);
  };

  const handleSelect = (ingredient) => {
    const name = ingredient.displayName || ingredient.canonicalName;
    setQuery(name);
    setIsLinked(true);
    setShowDropdown(false);
    setSuggestions([]);
    onUpdateFields(index, { name, ingredientId: ingredient._id });
  };

  useEffect(() => {
    const handler = (e) => {
      if (containerRef.current && !containerRef.current.contains(e.target)) setShowDropdown(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  return (
    <div ref={containerRef} className="recipe-ingredient-name-wrap">
      <input
        className={`recipe-ingredient-input${isLinked ? " is-linked" : ""}`}
        value={query}
        onChange={handleChange}
        onFocus={() => query.length >= 2 && suggestions.length > 0 && setShowDropdown(true)}
        placeholder="Ingrediente"
      />
      {isLinked && <span className="recipe-ingredient-linked-dot" title="Vinculado al catálogo" />}
      {showDropdown && suggestions.length > 0 && (
        <div className="recipe-ingredient-dropdown">
          {suggestions.slice(0, 6).map((s) => (
            <button
              key={s._id}
              type="button"
              className="recipe-ingredient-dropdown-item"
              onMouseDown={() => handleSelect(s)}
            >
              {s.displayName || s.canonicalName}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Structured quantity editor ───────────────────────────────────────────────

function QuantityEditor({ qty, onChange }) {
  const s = qty && typeof qty === "object" ? qty : { amount: null, unit: "", scalable: true };
  const hideAmount = !isUnitScalable(s.unit) || !s.unit;

  const handleAmountChange = (e) => {
    const amount = e.target.value === "" ? null : +e.target.value;
    onChange({ ...s, amount: isNaN(amount) ? null : amount });
  };

  const handleUnitChange = (e) => {
    const unit = e.target.value;
    const scalable = isUnitScalable(unit);
    onChange({ ...s, unit, scalable, amount: scalable ? s.amount : null });
  };

  return (
    <div className="recipe-qty-group">
      {!hideAmount && (
        <input
          type="number"
          className="recipe-qty-amount"
          placeholder="—"
          value={s.amount ?? ""}
          min="0"
          step="0.1"
          onChange={handleAmountChange}
        />
      )}
      <select
        className="recipe-qty-unit"
        value={s.unit || ""}
        onChange={handleUnitChange}
      >
        <option value="">Cant.</option>
        {RECIPE_UNITS.map((u) => (
          <option key={u.value} value={u.value}>{u.label}</option>
        ))}
      </select>
    </div>
  );
}

// ─── Toolbar ──────────────────────────────────────────────────────────────────

function ToolbarButton({ onClick, isActive, title, children }) {
  return (
    <button
      type="button"
      className={`recipe-toolbar-btn${isActive ? " is-active" : ""}`}
      onMouseDown={(e) => { e.preventDefault(); onClick(); }}
      title={title}
      aria-label={title}
    >
      {children}
    </button>
  );
}

function Toolbar({ editor }) {
  const [linkDialog, setLinkDialog] = useState({ open: false, url: "", text: "", originalText: "", hasSelection: false });
  const [colorOpen, setColorOpen] = useState(false);
  const linkRef = useRef(null);
  const colorRef = useRef(null);

  useEffect(() => {
    const handler = (e) => {
      if (linkRef.current && !linkRef.current.contains(e.target)) {
        setLinkDialog((prev) => (prev.open ? { ...prev, open: false } : prev));
      }
      if (colorRef.current && !colorRef.current.contains(e.target)) {
        setColorOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const openLinkDialog = useCallback(() => {
    if (!editor) return;
    const prevUrl = editor.getAttributes("link").href || "";
    const { from, to } = editor.state.selection;
    const hasSelection = from !== to;
    const selectedText = hasSelection ? editor.state.doc.textBetween(from, to, "") : "";
    setLinkDialog({ open: true, url: prevUrl, text: selectedText, originalText: selectedText, hasSelection });
  }, [editor]);

  const applyLink = useCallback(() => {
    if (!editor) return;
    const { url, text, originalText, hasSelection } = linkDialog;
    if (!url) {
      editor.chain().focus().extendMarkRange("link").unsetLink().run();
    } else if (hasSelection && text !== originalText) {
      editor.chain().focus().deleteSelection()
        .insertContent(`<a href="${escapeHtml(url)}">${escapeHtml(text || url)}</a>`)
        .run();
    } else if (hasSelection) {
      editor.chain().focus().extendMarkRange("link").setLink({ href: url }).run();
    } else {
      const displayText = text.trim() || url;
      editor.chain().focus()
        .insertContent(`<a href="${escapeHtml(url)}">${escapeHtml(displayText)}</a>`)
        .run();
    }
    setLinkDialog({ open: false, url: "", text: "", originalText: "", hasSelection: false });
  }, [editor, linkDialog]);

  const removeLink = useCallback(() => {
    if (!editor) return;
    editor.chain().focus().extendMarkRange("link").unsetLink().run();
    setLinkDialog({ open: false, url: "", text: "", originalText: "", hasSelection: false });
  }, [editor]);

  const insertImage = useCallback(() => {
    if (!editor) return;
    const url = window.prompt("URL de la imagen:", "https://");
    if (!url) return;
    editor.chain().focus().setImage({ src: url }).run();
  }, [editor]);

  if (!editor) return null;

  const currentColor = editor.getAttributes("textStyle").color || null;

  return (
    <div className="recipe-toolbar">
      <ToolbarButton onClick={() => editor.chain().focus().toggleBold().run()} isActive={editor.isActive("bold")} title="Negrita">
        <strong>B</strong>
      </ToolbarButton>
      <ToolbarButton onClick={() => editor.chain().focus().toggleItalic().run()} isActive={editor.isActive("italic")} title="Cursiva">
        <em>I</em>
      </ToolbarButton>
      <ToolbarButton onClick={() => editor.chain().focus().toggleUnderline().run()} isActive={editor.isActive("underline")} title="Subrayado">
        <span style={{ textDecoration: "underline" }}>U</span>
      </ToolbarButton>
      <span className="recipe-toolbar-sep" aria-hidden="true" />
      <ToolbarButton onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()} isActive={editor.isActive("heading", { level: 2 })} title="Encabezado H2">
        H2
      </ToolbarButton>
      <ToolbarButton onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()} isActive={editor.isActive("heading", { level: 3 })} title="Encabezado H3">
        H3
      </ToolbarButton>
      <span className="recipe-toolbar-sep" aria-hidden="true" />
      <ToolbarButton onClick={() => editor.chain().focus().toggleBulletList().run()} isActive={editor.isActive("bulletList")} title="Lista con viñetas">
        <svg viewBox="0 0 18 18" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round">
          <circle cx="3" cy="5" r="1.2" fill="currentColor" stroke="none" />
          <line x1="7" y1="5" x2="16" y2="5" />
          <circle cx="3" cy="9" r="1.2" fill="currentColor" stroke="none" />
          <line x1="7" y1="9" x2="16" y2="9" />
          <circle cx="3" cy="13" r="1.2" fill="currentColor" stroke="none" />
          <line x1="7" y1="13" x2="16" y2="13" />
        </svg>
      </ToolbarButton>
      <ToolbarButton onClick={() => editor.chain().focus().toggleOrderedList().run()} isActive={editor.isActive("orderedList")} title="Lista numerada">
        <svg viewBox="0 0 18 18" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
          <text x="1" y="7" fontSize="6" fill="currentColor" stroke="none" fontWeight="700">1.</text>
          <line x1="7" y1="5" x2="16" y2="5" />
          <text x="1" y="11" fontSize="6" fill="currentColor" stroke="none" fontWeight="700">2.</text>
          <line x1="7" y1="9" x2="16" y2="9" />
          <text x="1" y="15" fontSize="6" fill="currentColor" stroke="none" fontWeight="700">3.</text>
          <line x1="7" y1="13" x2="16" y2="13" />
        </svg>
      </ToolbarButton>
      <span className="recipe-toolbar-sep" aria-hidden="true" />
      <div className="recipe-toolbar-popover-wrap" ref={linkRef}>
        <ToolbarButton onClick={openLinkDialog} isActive={editor.isActive("link")} title="Insertar enlace">
          <svg viewBox="0 0 18 18" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round">
            <path d="M7.5 10.5a3.5 3.5 0 0 0 5 0l2-2a3.5 3.5 0 0 0-5-5L8 5" />
            <path d="M10.5 7.5a3.5 3.5 0 0 0-5 0l-2 2a3.5 3.5 0 0 0 5 5L10 13" />
          </svg>
        </ToolbarButton>
        {linkDialog.open && (
          <div className="recipe-link-dialog" role="dialog" aria-label="Insertar enlace">
            <p className="recipe-link-dialog-title">Insertar enlace</p>
            {!linkDialog.hasSelection && (
              <label className="recipe-link-dialog-field">
                <span>Texto del enlace</span>
                <input
                  type="text"
                  className="recipe-link-dialog-input"
                  placeholder="Ej. Ver receta completa"
                  value={linkDialog.text}
                  onChange={(e) => setLinkDialog((prev) => ({ ...prev, text: e.target.value }))}
                  autoFocus
                />
              </label>
            )}
            {linkDialog.hasSelection && (
              <label className="recipe-link-dialog-field">
                <span>Texto</span>
                <input
                  type="text"
                  className="recipe-link-dialog-input"
                  value={linkDialog.text}
                  onChange={(e) => setLinkDialog((prev) => ({ ...prev, text: e.target.value }))}
                />
              </label>
            )}
            <label className="recipe-link-dialog-field">
              <span>URL</span>
              <input
                type="url"
                className="recipe-link-dialog-input"
                placeholder="https://"
                value={linkDialog.url}
                onChange={(e) => setLinkDialog((prev) => ({ ...prev, url: e.target.value }))}
                onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); applyLink(); } }}
                autoFocus={linkDialog.hasSelection}
              />
            </label>
            <div className="recipe-link-dialog-actions">
              <button type="button" className="recipe-link-dialog-btn primary" onClick={applyLink}>
                Aplicar
              </button>
              {editor.isActive("link") && (
                <button type="button" className="recipe-link-dialog-btn danger" onClick={removeLink}>
                  Quitar
                </button>
              )}
              <button
                type="button"
                className="recipe-link-dialog-btn"
                onClick={() => setLinkDialog({ open: false, url: "", text: "", originalText: "", hasSelection: false })}
              >
                Cancelar
              </button>
            </div>
          </div>
        )}
      </div>
      <ToolbarButton onClick={insertImage} isActive={false} title="Insertar imagen">
        <svg viewBox="0 0 18 18" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round">
          <rect x="2" y="3" width="14" height="12" rx="2" />
          <circle cx="6.5" cy="7" r="1.5" />
          <path d="M2 13l4-4 3 3 2-2 5 5" />
        </svg>
      </ToolbarButton>
      <span className="recipe-toolbar-sep" aria-hidden="true" />
      <div className="recipe-toolbar-popover-wrap" ref={colorRef}>
        <ToolbarButton
          onClick={() => setColorOpen((prev) => !prev)}
          isActive={Boolean(currentColor)}
          title="Color de texto"
        >
          <span className="recipe-color-btn-icon">
            <svg viewBox="0 0 18 18" width="13" height="13" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
              <path d="M4 14h10M9 3l3.5 8H5.5L9 3z" />
            </svg>
            <span
              className="recipe-color-btn-swatch"
              style={{ background: currentColor || "#1e293b" }}
            />
          </span>
        </ToolbarButton>
        {colorOpen && (
          <div className="recipe-color-picker" role="dialog" aria-label="Elige un color">
            <div className="recipe-color-picker-grid">
              {APP_COLORS.map((c) => (
                <button
                  key={c.value}
                  type="button"
                  className={`recipe-color-swatch${currentColor === c.value ? " is-active" : ""}`}
                  style={{ background: c.value }}
                  title={c.label}
                  onMouseDown={(e) => {
                    e.preventDefault();
                    editor.chain().focus().setColor(c.value).run();
                    setColorOpen(false);
                  }}
                />
              ))}
            </div>
            <button
              type="button"
              className="recipe-color-reset"
              onMouseDown={(e) => {
                e.preventDefault();
                editor.chain().focus().unsetColor().run();
                setColorOpen(false);
              }}
            >
              Sin color
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Guided steps editor ─────────────────────────────────────────────────────

const STEP_F = {
  width: "100%",
  boxSizing: "border-box",
  padding: "5px 8px",
  fontSize: 13,
  borderRadius: 5,
  border: "1px solid var(--input-border, #d1d5db)",
  background: "var(--input-bg, #fff)",
  color: "var(--input-text, #1e293b)",
  outline: "none",
};

function GuidedStepsEditor({ steps, onChangeSteps, dishIngredients = [] }) {
  const update = (i, updates) => {
    const next = steps.map((s, idx) => {
      if (idx !== i) return s;
      const merged = { ...s, ...updates };
      // Keep durationSeconds in sync whenever durationMinutes changes
      if ("durationMinutes" in updates) {
        const mins = parseFloat(updates.durationMinutes);
        merged.durationSeconds = Number.isFinite(mins) && mins > 0 ? Math.round(mins * 60) : 0;
      }
      return merged;
    });
    onChangeSteps(next);
  };

  const moveUp = (i) => {
    if (i === 0) return;
    const next = [...steps];
    [next[i - 1], next[i]] = [next[i], next[i - 1]];
    onChangeSteps(next);
  };

  const moveDown = (i) => {
    if (i === steps.length - 1) return;
    const next = [...steps];
    [next[i], next[i + 1]] = [next[i + 1], next[i]];
    onChangeSteps(next);
  };

  const removeStep = (i) => onChangeSteps(steps.filter((_, idx) => idx !== i));

  const addStep = () => onChangeSteps([
    ...steps,
    { text: "", title: "", hasTimer: false, durationMinutes: null, durationSeconds: 0, timerLabel: "", tips: "", stepIngredients: [] }
  ]);

  const getDurationMinutes = (step) => {
    if (step.durationMinutes != null) return step.durationMinutes;
    if (step.durationSeconds > 0) return +(step.durationSeconds / 60).toFixed(1);
    return "";
  };

  return (
    <div className="guided-steps-editor">
      {steps.map((step, i) => (
        <div key={i} className="guided-step-editor-card">
          <div className="guided-step-editor-header">
            <span className="guided-step-editor-label">Paso {i + 1}</span>
            <div className="guided-step-editor-actions">
              <button
                type="button"
                onClick={() => moveUp(i)}
                disabled={i === 0}
                title="Subir"
                className="guided-step-move-btn"
              >↑</button>
              <button
                type="button"
                onClick={() => moveDown(i)}
                disabled={i === steps.length - 1}
                title="Bajar"
                className="guided-step-move-btn"
              >↓</button>
              <button
                type="button"
                onClick={() => removeStep(i)}
                title="Eliminar paso"
                className="guided-step-delete-btn"
              >×</button>
            </div>
          </div>

          <div className="guided-step-editor-body">
            <label className="guided-step-field">
              <span className="guided-step-field-label">Instrucción *</span>
              <textarea
                className="guided-step-textarea"
                style={STEP_F}
                value={step.text || ""}
                rows={3}
                placeholder="Describe el paso de elaboración..."
                onChange={(e) => update(i, { text: e.target.value })}
              />
            </label>

            <div className="guided-step-optional-row">
              <label className="guided-step-field" style={{ flex: 1 }}>
                <span className="guided-step-field-label">Título (opcional)</span>
                <input
                  type="text"
                  style={STEP_F}
                  value={step.title || ""}
                  placeholder="Ej: Dorar la cebolla"
                  onChange={(e) => update(i, { title: e.target.value })}
                />
              </label>
              <label className="guided-step-field" style={{ flex: 1 }}>
                <span className="guided-step-field-label">Consejo (opcional)</span>
                <input
                  type="text"
                  style={STEP_F}
                  value={step.tips || ""}
                  placeholder="Ej: A fuego medio para no quemar"
                  onChange={(e) => update(i, { tips: e.target.value })}
                />
              </label>
            </div>

            {dishIngredients.length > 0 && (
              <div style={{ marginBottom: 8 }}>
                <span className="guided-step-field-label" style={{ display: "block", marginBottom: 4 }}>
                  Ingredientes del paso (opcional)
                </span>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
                  {dishIngredients.map((ing, ingIdx) => {
                    const stepIngs = step.stepIngredients || [];
                    const isSelected = stepIngs.some(
                      (si) => si.name.toLowerCase() === ing.name.toLowerCase()
                    );
                    return (
                      <button
                        key={ingIdx}
                        type="button"
                        style={{
                          padding: "3px 10px",
                          borderRadius: 999,
                          fontSize: 12,
                          fontWeight: isSelected ? 600 : 400,
                          border: `1px solid ${isSelected ? "#4f46e5" : "#d1d5db"}`,
                          background: isSelected ? "#eef2ff" : "transparent",
                          color: isSelected ? "#4338ca" : "#6b7280",
                          cursor: "pointer",
                          transition: "all 0.12s",
                        }}
                        onClick={() => {
                          const next = isSelected
                            ? stepIngs.filter((si) => si.name.toLowerCase() !== ing.name.toLowerCase())
                            : [...stepIngs, { name: ing.name, ingredientId: ing.ingredientId || null }];
                          update(i, { stepIngredients: next });
                        }}
                      >
                        {isSelected ? "✓ " : ""}{ing.name}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            <div className="guided-step-timer-row">
              <label className="guided-step-timer-check">
                <input
                  type="checkbox"
                  checked={Boolean(step.hasTimer)}
                  onChange={(e) => update(i, { hasTimer: e.target.checked })}
                />
                <span>Temporizador</span>
              </label>
              {step.hasTimer && (
                <div className="guided-step-timer-fields">
                  <input
                    type="number"
                    style={{ ...STEP_F, width: 70 }}
                    min="0.5"
                    step="0.5"
                    value={getDurationMinutes(step)}
                    placeholder="—"
                    onChange={(e) => update(i, { durationMinutes: e.target.value === "" ? null : +e.target.value })}
                  />
                  <span className="guided-step-timer-unit">min</span>
                  <input
                    type="text"
                    style={{ ...STEP_F, flex: 1 }}
                    value={step.timerLabel || ""}
                    placeholder="Etiqueta (ej: 10 minutos)"
                    onChange={(e) => update(i, { timerLabel: e.target.value })}
                  />
                </div>
              )}
            </div>
          </div>
        </div>
      ))}

      <button type="button" className="guided-step-add-btn" onClick={addStep}>
        + Añadir paso
      </button>
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export default function RecipeEditor({
  recipeIngredients = [],
  recipeSteps = null,
  recipeServings = null,
  recipeBaseServings = null,
  recipePrepMinutes = null,
  recipeCookMinutes = null,
  targetServings = null,
  onTargetServingsChange = null,
  actionAfterIngredients = null,
  dishIngredientNames = [],
  dishIngredients = [],
  onAddIngredientToDish,
  onChange,
  readOnly = false
}) {
  const isGuidedSteps = Array.isArray(recipeSteps);

  // Stable refs so the Tiptap onUpdate closure is never stale — critical for mobile
  const onChangeRef = useRef(onChange);
  const isGuidedStepsRef = useRef(isGuidedSteps);
  useEffect(() => { onChangeRef.current = onChange; }, [onChange]);
  useEffect(() => { isGuidedStepsRef.current = isGuidedSteps; }, [isGuidedSteps]);

  // deps=[] keeps the editor instance stable across every parent re-render
  const editor = useEditor({
    extensions: TIPTAP_EXTENSIONS,
    content: isGuidedSteps ? "" : (recipeSteps || ""),
    editable: !readOnly,
    onUpdate: ({ editor: ed }) => {
      if (!onChangeRef.current || isGuidedStepsRef.current) return;
      onChangeRef.current((prev) => ({ ...prev, steps: ed.getJSON() }));
    }
  }, []);

  // Local display state for minute inputs — avoids controlled-number-input bugs on mobile
  const [prepMin, setPrepMin] = useState(recipePrepMinutes != null ? String(recipePrepMinutes) : "");
  const [cookMin, setCookMin] = useState(recipeCookMinutes != null ? String(recipeCookMinutes) : "");
  useEffect(() => { setPrepMin(recipePrepMinutes != null ? String(recipePrepMinutes) : ""); }, [recipePrepMinutes]);
  useEffect(() => { setCookMin(recipeCookMinutes != null ? String(recipeCookMinutes) : ""); }, [recipeCookMinutes]);

  const addIngredient = () => {
    if (!onChange) return;
    onChange((prev) => ({
      ...prev,
      ingredients: [...(prev.ingredients || []), { name: "", quantity: { amount: null, unit: "", scalable: true } }]
    }));
  };

  const removeIngredient = (index) => {
    if (!onChange) return;
    onChange((prev) => ({
      ...prev,
      ingredients: (prev.ingredients || []).filter((_, i) => i !== index)
    }));
  };

  const updateIngredient = (index, fieldOrFields, value) => {
    if (!onChange) return;
    onChange((prev) => {
      const next = [...(prev.ingredients || [])];
      if (typeof fieldOrFields === "object") {
        next[index] = { ...next[index], ...fieldOrFields };
      } else {
        next[index] = { ...next[index], [fieldOrFields]: value };
      }
      return { ...prev, ingredients: next };
    });
  };

  const isLinkedToDish = (item) => {
    if (!item.ingredientId) return false;
    const name = (item.name || "").toLowerCase().trim();
    return name.length > 0 && dishIngredientNames.includes(name);
  };

  const isNewIngredient = (name) => {
    if (!name || !dishIngredientNames.length) return false;
    return !dishIngredientNames.includes(String(name).toLowerCase().trim());
  };

  // ── Read-only view ─────────────────────────────────────────────────────────

  const baseServings = getRecipeBaseServings({ baseServings: recipeBaseServings, servings: recipeServings });
  const defaultServings = (targetServings >= 1 ? targetServings : null) ?? baseServings;
  const [displayServings, setDisplayServings] = useState(defaultServings);

  useEffect(() => {
    setDisplayServings(defaultServings);
  }, [defaultServings]);

  const handleDisplayServingsChange = (nextServings) => {
    setDisplayServings(nextServings);
    onTargetServingsChange?.(nextServings);
  };

  if (readOnly) {
    return (
      <div className="recipe-editor-section">
        {baseServings ? (
          <RecipeServingsControl
            servings={displayServings}
            baseServings={baseServings}
            onChange={handleDisplayServingsChange}
          />
        ) : null}

        {recipeIngredients && recipeIngredients.length > 0 ? (
          <div>
            <p className="recipe-section-title">Ingredientes</p>
            <RecipeIngredientsList
              ingredients={recipeIngredients}
              baseServings={baseServings}
              targetServings={displayServings}
            />
          </div>
        ) : null}

        {actionAfterIngredients ? actionAfterIngredients : null}

        {Array.isArray(recipeSteps) && recipeSteps.length > 0 ? (
          <div>
            <p className="recipe-section-title">Elaboración</p>
            <ol className="recipe-structured-steps">
              {recipeSteps.map((step, idx) => (
                <li key={step.order ?? idx} className="recipe-structured-step">
                  {step.title && (
                    <p className="recipe-structured-step-title">{step.title}</p>
                  )}
                  <p className="recipe-structured-step-text">{step.text}</p>
                  {step.hasTimer && step.durationSeconds > 0 && (
                    <span className="recipe-structured-step-timer">
                      ⏱ {step.timerLabel ?? `${Math.round(step.durationSeconds / 60)} min`}
                    </span>
                  )}
                  {step.tips && (
                    <p className="recipe-structured-step-tips">💡 {step.tips}</p>
                  )}
                </li>
              ))}
            </ol>
          </div>
        ) : recipeSteps ? (
          <div>
            <p className="recipe-section-title">Elaboración</p>
            <div className="recipe-viewer-wrap">
              <EditorContent editor={editor} />
            </div>
          </div>
        ) : null}

        {(!recipeIngredients || recipeIngredients.length === 0) && !recipeSteps ? (
          <p className="kitchen-muted">Este plato aún no tiene elaboración.</p>
        ) : null}
      </div>
    );
  }

  // ── Edit view ──────────────────────────────────────────────────────────────

  const convertToGuidedSteps = () => {
    if (!onChange) return;
    if (!window.confirm("¿Convertir a pasos guiados? El texto libre del editor se convertirá en pasos. Esta acción no se puede deshacer fácilmente.")) return;
    const tiptapContent = editor ? editor.getJSON() : null;
    const parsed = tiptapContent ? parseRecipeSteps(tiptapContent) : null;
    const initialSteps = parsed?.length > 0
      ? parsed.map((s) => ({ text: s.text, title: "", hasTimer: false, durationMinutes: null, durationSeconds: 0, timerLabel: "", tips: "", stepIngredients: [] }))
      : [{ text: "", title: "", hasTimer: false, durationMinutes: null, durationSeconds: 0, timerLabel: "", tips: "", stepIngredients: [] }];
    onChange((prev) => ({ ...prev, steps: initialSteps }));
  };

  const convertToFreeText = () => {
    if (!onChange) return;
    if (!window.confirm("¿Volver a texto libre? Se perderán los pasos guiados estructurados.")) return;
    if (editor) editor.commands.setContent("");
    onChange((prev) => ({ ...prev, steps: null }));
  };

  return (
    <div className="recipe-editor-section">
      {/* Servings + timing row */}
      <div className="recipe-servings-row" style={{ gap: 12, flexWrap: "wrap", alignItems: "center" }}>
        <label className="recipe-section-title" htmlFor="recipe-servings">Para</label>
        <input
          id="recipe-servings"
          type="number"
          min="1"
          max="99"
          className="recipe-servings-input"
          placeholder="—"
          value={recipeServings ?? ""}
          onChange={(e) => {
            if (!onChange) return;
            const val = e.target.value === "" ? null : Number(e.target.value);
            onChange((prev) => ({ ...prev, servings: val }));
          }}
        />
        <span className="recipe-section-title">personas</span>
        <span className="recipe-section-title" style={{ marginLeft: 8 }}>Prep.</span>
        <input
          type="text"
          inputMode="numeric"
          pattern="[0-9]*"
          className="recipe-servings-input"
          placeholder="—"
          value={prepMin}
          onChange={(e) => { if (/^\d*$/.test(e.target.value)) setPrepMin(e.target.value); }}
          onBlur={() => {
            if (!onChange) return;
            const n = prepMin === "" ? null : parseInt(prepMin, 10);
            onChange((prev) => ({ ...prev, prepMinutes: Number.isFinite(n) ? n : null }));
          }}
          title="Minutos de preparación"
        />
        <span className="recipe-section-title">min</span>
        <span className="recipe-section-title" style={{ marginLeft: 4 }}>Cocción</span>
        <input
          type="text"
          inputMode="numeric"
          pattern="[0-9]*"
          className="recipe-servings-input"
          placeholder="—"
          value={cookMin}
          onChange={(e) => { if (/^\d*$/.test(e.target.value)) setCookMin(e.target.value); }}
          onBlur={() => {
            if (!onChange) return;
            const n = cookMin === "" ? null : parseInt(cookMin, 10);
            onChange((prev) => ({ ...prev, cookMinutes: Number.isFinite(n) ? n : null }));
          }}
          title="Minutos de cocción"
        />
        <span className="recipe-section-title">min</span>
      </div>

      <div>
        <p className="recipe-section-title">Ingredientes</p>
        <div className="recipe-ingredient-list">
          {(recipeIngredients || []).map((item, idx) => {
            const linked = isLinkedToDish(item);

            if (linked) {
              return (
                <div key={idx} className="recipe-ingredient-row recipe-ingredient-row--pill">
                  <span className="recipe-ingredient-pill">
                    <span className="recipe-ingredient-pill-dot" />
                    <span className="recipe-ingredient-pill-name">{item.name}</span>
                  </span>
                  <QuantityEditor
                    qty={getStructuredQty(item.quantity)}
                    onChange={(newQty) => updateIngredient(idx, "quantity", newQty)}
                  />
                  <button
                    type="button"
                    className="recipe-remove-btn"
                    onClick={() => removeIngredient(idx)}
                    aria-label="Eliminar ingrediente"
                    title="Eliminar"
                  >
                    ×
                  </button>
                </div>
              );
            }

            return (
              <div key={idx} className="recipe-ingredient-row">
                <RecipeIngredientInput
                  item={item}
                  index={idx}
                  onUpdateFields={updateIngredient}
                />
                <QuantityEditor
                  qty={getStructuredQty(item.quantity)}
                  onChange={(newQty) => updateIngredient(idx, "quantity", newQty)}
                />
                {item.ingredientId && isNewIngredient(item.name) && onAddIngredientToDish ? (
                  <button
                    type="button"
                    className="recipe-add-to-dish-btn"
                    title="Añadir este ingrediente al plato (lista de la compra)"
                    onClick={() => onAddIngredientToDish(item.name)}
                  >
                    + Al plato
                  </button>
                ) : null}
                <button
                  type="button"
                  className="recipe-remove-btn"
                  onClick={() => removeIngredient(idx)}
                  aria-label="Eliminar ingrediente"
                  title="Eliminar"
                >
                  ×
                </button>
              </div>
            );
          })}
        </div>
        <button type="button" className="recipe-add-ingredient-btn" onClick={addIngredient}>
          + Añadir ingrediente
        </button>
      </div>

      <div>
        <div className="recipe-steps-header">
          <p className="recipe-section-title" style={{ margin: 0 }}>Elaboración</p>
          <div className="recipe-steps-mode-toggle">
            {isGuidedSteps ? (
              <>
                <span className="recipe-steps-mode-badge">Pasos guiados</span>
                <button type="button" className="recipe-steps-mode-btn" onClick={convertToFreeText}>
                  Cambiar a texto libre
                </button>
              </>
            ) : (
              <button type="button" className="recipe-steps-mode-btn recipe-steps-mode-btn--guided" onClick={convertToGuidedSteps}>
                Convertir a pasos guiados
              </button>
            )}
          </div>
        </div>

        {isGuidedSteps ? (
          <GuidedStepsEditor
            steps={recipeSteps}
            dishIngredients={dishIngredients}
            onChangeSteps={(newSteps) => {
              if (!onChange) return;
              onChange((prev) => ({ ...prev, steps: newSteps }));
            }}
          />
        ) : (
          <>
            <Toolbar editor={editor} />
            <div className="recipe-editor-wrap">
              <EditorContent editor={editor} />
            </div>
          </>
        )}
      </div>
    </div>
  );
}
