/**
 * BasicsPopup — "Básicos de compra" popup/modal
 *
 * Pro/Premium: checkbox list of household basics (all unchecked by default),
 *              inline search to add new basics from real ingredients,
 *              inline create for ingredients that don't exist yet.
 * Basic plan: locked teaser.
 */
import React, { useEffect, useRef, useState, useCallback } from "react";
import { createPortal } from "react-dom";
import { apiRequest } from "../api.js";
import { canUseBasicsFeature } from "../subscription.js";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../auth.jsx";

// ─── Icons ────────────────────────────────────────────────────────────────────

function CloseIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" width={18} height={18} aria-hidden="true">
      <path d="M6 6l12 12M18 6l-12 12" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

function LockIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" width={34} height={34} aria-hidden="true">
      <rect x="5" y="11" width="14" height="10" rx="2.5" stroke="currentColor" strokeWidth="1.7" />
      <path d="M8 11V8a4 4 0 0 1 8 0v3" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
    </svg>
  );
}

function CheckIcon({ size = 13 }) {
  return (
    <svg viewBox="0 0 20 20" fill="none" width={size} height={size} aria-hidden="true">
      <path d="M4 10.5l4.5 4.5 7.5-9" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function BasketIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" width={19} height={19} aria-hidden="true">
      <path d="M6 7l2-4M18 7l-2-4" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
      <path d="M3 7h18l-2 11a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2z" stroke="currentColor" strokeWidth="1.7" strokeLinejoin="round" />
      <path d="M9 12l1.5 2 4-4" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function PlusSmIcon() {
  return (
    <svg viewBox="0 0 20 20" fill="none" width={14} height={14} aria-hidden="true">
      <path d="M10 4v12M4 10h12" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

function SpinnerIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" width={16} height={16} aria-hidden="true" className="basics-spin">
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="2.5" strokeDasharray="40" strokeDashoffset="15" strokeLinecap="round" />
    </svg>
  );
}

// ─── Sub-components ───────────────────────────────────────────────────────────

/**
 * Inline ingredient search + optional create-new flow.
 * Used both in the popup and SettingsPage basics panel.
 */
export function IngredientSearchAdd({
  placeholder = "Buscar producto…",
  onAdded,        // called with the created/selected HouseholdBasic
  householdId,
  compact = false
}) {
  const [query, setQuery] = useState("");
  const [suggestions, setSuggestions] = useState([]);
  const [searching, setSearching] = useState(false);
  const [createMode, setCreateMode] = useState(false);
  const [createName, setCreateName] = useState("");
  const [createCategoryId, setCreateCategoryId] = useState("");
  const [categories, setCategories] = useState([]);
  const [saving, setSaving] = useState(false);
  const [localError, setLocalError] = useState("");
  const inputRef = useRef(null);
  const timer = useRef(null);

  // Load categories once for the create flow
  useEffect(() => {
    apiRequest("/api/categories")
      .then((d) => setCategories(d.categories || []))
      .catch(() => setCategories([]));
  }, []);

  useEffect(() => {
    const q = query.trim();
    if (!q) { setSuggestions([]); return; }
    clearTimeout(timer.current);
    setSearching(true);
    timer.current = setTimeout(async () => {
      try {
        const data = await apiRequest(`/api/kitchenIngredients?q=${encodeURIComponent(q)}&limit=12`);
        setSuggestions(data.ingredients || []);
      } catch {
        setSuggestions([]);
      } finally {
        setSearching(false);
      }
    }, 220);
    return () => clearTimeout(timer.current);
  }, [query]);

  const addBasicFromIngredient = async (ingredient) => {
    setSaving(true);
    setLocalError("");
    try {
      const data = await apiRequest("/api/kitchen/basics", {
        method: "POST",
        body: JSON.stringify({ ingredientId: ingredient._id })
      });
      if (!data.ok) throw new Error(data.error || "Error al añadir básico.");
      setQuery("");
      setSuggestions([]);
      onAdded?.(data.basic);
    } catch (err) {
      setLocalError(err?.message || "Error al añadir básico.");
    } finally {
      setSaving(false);
    }
  };

  const handleCreateIngredientAndBasic = async () => {
    const name = createName.trim();
    if (!name || !createCategoryId || saving) return;
    setSaving(true);
    setLocalError("");
    try {
      // 1. Create household ingredient
      const ingData = await apiRequest("/api/kitchenIngredients", {
        method: "POST",
        body: JSON.stringify({
          name,
          categoryId: createCategoryId,
          scope: "household",
          householdId: householdId || null
        })
      });
      if (!ingData.ingredient?._id) throw new Error("No se pudo crear el ingrediente.");

      // 2. Create basic from ingredient
      const basicData = await apiRequest("/api/kitchen/basics", {
        method: "POST",
        body: JSON.stringify({ ingredientId: ingData.ingredient._id })
      });
      if (!basicData.ok) throw new Error(basicData.error || "Error al crear básico.");

      setCreateMode(false);
      setCreateName("");
      setCreateCategoryId("");
      setQuery("");
      setSuggestions([]);
      onAdded?.(basicData.basic);
    } catch (err) {
      setLocalError(err?.message || "Error al crear el artículo.");
    } finally {
      setSaving(false);
    }
  };

  const hasExact = suggestions.some(
    (s) => String(s.name || "").trim().toLowerCase() === query.trim().toLowerCase()
  );

  if (createMode) {
    return (
      <div className={`basics-search-add${compact ? " is-compact" : ""}`}>
        <div className="basics-create-form">
          <input
            className="kitchen-input basics-create-name-input"
            type="text"
            placeholder="Nombre del artículo"
            value={createName}
            onChange={(e) => setCreateName(e.target.value)}
            autoFocus
            maxLength={120}
          />
          <select
            className="kitchen-input basics-create-cat-select"
            value={createCategoryId}
            onChange={(e) => setCreateCategoryId(e.target.value)}
          >
            <option value="">Categoría…</option>
            {categories.map((c) => (
              <option key={c._id} value={c._id}>{c.name}</option>
            ))}
          </select>
          <div className="basics-create-actions">
            <button
              type="button"
              className="basics-create-cancel"
              onClick={() => { setCreateMode(false); setCreateName(""); setCreateCategoryId(""); setLocalError(""); inputRef.current?.focus(); }}
              disabled={saving}
            >
              Cancelar
            </button>
            <button
              type="button"
              className="kitchen-button basics-create-confirm"
              onClick={handleCreateIngredientAndBasic}
              disabled={!createName.trim() || !createCategoryId || saving}
            >
              {saving ? <SpinnerIcon /> : "Crear y añadir"}
            </button>
          </div>
          {localError && <p className="basics-search-error">{localError}</p>}
        </div>
      </div>
    );
  }

  return (
    <div className={`basics-search-add${compact ? " is-compact" : ""}`}>
      <div className="basics-search-row">
        <span className="basics-search-icon" aria-hidden="true"><PlusSmIcon /></span>
        <input
          ref={inputRef}
          className="kitchen-input basics-search-input"
          type="text"
          placeholder={placeholder}
          value={query}
          onChange={(e) => { setQuery(e.target.value); setLocalError(""); }}
          autoComplete="off"
        />
        {searching && <span className="basics-search-spinner"><SpinnerIcon /></span>}
      </div>

      {localError && <p className="basics-search-error">{localError}</p>}

      {query.trim() && (
        <div className="basics-search-suggestions">
          {suggestions.slice(0, 8).map((ing) => (
            <button
              key={ing._id}
              type="button"
              className="basics-search-suggestion"
              onClick={() => addBasicFromIngredient(ing)}
              disabled={saving}
            >
              <span className="basics-search-suggestion-name">{ing.name}</span>
            </button>
          ))}
          {!searching && !hasExact && query.trim() && (
            <button
              type="button"
              className="basics-search-create-btn"
              onClick={() => {
                setCreateMode(true);
                setCreateName(query.trim());
              }}
              disabled={saving}
            >
              <PlusSmIcon />
              Crear &ldquo;{query.trim()}&rdquo;
            </button>
          )}
          {!searching && suggestions.length === 0 && hasExact === false && !query.trim() && (
            <div className="basics-search-no-results">Sin resultados</div>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Main popup component ─────────────────────────────────────────────────────

export default function BasicsPopup({
  weekStart,
  onClose,
  onApplied,
  currentPendingCanonicals = new Set(),
  currentPendingIngredientIds = new Set(),
  plan
}) {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [basics, setBasics] = useState([]);
  const [loading, setLoading] = useState(true);
  const [applying, setApplying] = useState(false);
  const [error, setError] = useState("");
  // All unchecked by default — user picks what to add
  const [selected, setSelected] = useState(new Set());
  const backdropRef = useRef(null);

  const basicsEnabled = canUseBasicsFeature(plan);
  const householdId = user?.activeHouseholdId || user?.householdId || "";

  const loadBasics = useCallback(async () => {
    try {
      const data = await apiRequest("/api/kitchen/basics");
      const activeBasics = (data.basics || []).filter((b) => b.active !== false);
      setBasics(activeBasics);
    } catch (err) {
      setError(err?.message || "No se pudieron cargar los básicos.");
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError("");
    setSelected(new Set()); // always start unchecked
    apiRequest("/api/kitchen/basics")
      .then((data) => {
        if (cancelled) return;
        const activeBasics = (data.basics || []).filter((b) => b.active !== false);
        setBasics(activeBasics);
        // Starts unchecked — user decides what to add
        setSelected(new Set());
      })
      .catch((err) => {
        if (!cancelled) setError(err?.message || "No se pudieron cargar los básicos.");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => { cancelled = true; };
  }, [weekStart]);

  // When a new basic is added via search, reload list and auto-check the new item
  const handleNewBasicAdded = async (newBasic) => {
    await loadBasics();
    if (newBasic?.id) {
      setSelected((prev) => new Set([...prev, newBasic.id]));
    }
  };

  const toggleItem = (id) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleApply = async () => {
    const selectedIds = [...selected];
    if (selectedIds.length === 0) {
      onClose?.();
      return;
    }
    setApplying(true);
    setError("");
    try {
      const data = await apiRequest("/api/kitchen/basics/apply", {
        method: "POST",
        body: JSON.stringify({ weekStart, selectedIds })
      });
      if (!data.ok) throw new Error(data.error || "Error aplicando básicos.");
      onApplied?.({ addedCount: data.addedCount, skippedCount: data.skippedCount });
    } catch (err) {
      setError(err?.message || "No se pudieron añadir los básicos.");
    } finally {
      setApplying(false);
    }
  };

  const handleBackdropClick = (e) => {
    if (e.target === backdropRef.current) onClose?.();
  };

  // Split into "can add" vs "already in list"
  const isInList = (basic) => {
    if (basic.ingredientId && currentPendingIngredientIds.has(String(basic.ingredientId))) return true;
    return currentPendingCanonicals.has(String(basic.canonicalName || "").toLowerCase());
  };
  const availableBasics = basics.filter((b) => !isInList(b));
  const alreadyInList  = basics.filter((b) => isInList(b));

  const content = (
    <div
      ref={backdropRef}
      className="basics-popup-backdrop"
      onClick={handleBackdropClick}
      role="dialog"
      aria-modal="true"
      aria-label="Básicos de compra"
    >
      <div className="basics-popup">

        {/* ── Header ── */}
        <div className="basics-popup-header">
          <div className="basics-popup-title-row">
            <BasketIcon />
            <span className="basics-popup-title">Básicos de compra</span>
          </div>
          <button type="button" className="basics-popup-close" onClick={onClose} aria-label="Cerrar">
            <CloseIcon />
          </button>
        </div>

        {/* ── Body ── */}
        {!basicsEnabled ? (
          /* Locked teaser */
          <div className="basics-popup-locked">
            <div className="basics-popup-lock-icon"><LockIcon /></div>
            <p className="basics-popup-locked-title">Básicos de compra</p>
            <p className="basics-popup-locked-desc">
              Guarda los artículos que compras cada semana y añádelos a tu lista con un solo toque.{" "}
              Disponible en <strong>Pro</strong> y <strong>Premium</strong>.
            </p>
            <button
              type="button"
              className="basics-popup-upgrade-btn"
              onClick={() => { onClose?.(); navigate("/kitchen/upgrade"); }}
            >
              Ver planes
            </button>
          </div>

        ) : loading ? (
          <div className="basics-popup-loading">Cargando básicos…</div>

        ) : error && basics.length === 0 ? (
          <div className="basics-popup-error">{error}</div>

        ) : (
          <>
            {/* ── Search / add new basic inline ── */}
            <div className="basics-popup-search-section">
              <IngredientSearchAdd
                placeholder="Añadir nuevo básico…"
                onAdded={handleNewBasicAdded}
                householdId={householdId}
                compact
              />
            </div>

            {/* ── Items list ── */}
            <div className="basics-popup-list">

              {basics.length === 0 ? (
                <div className="basics-popup-empty">
                  <p>Aún no tienes básicos.</p>
                  <p className="basics-popup-empty-hint">Usa el buscador de arriba para añadir artículos que sueles comprar cada semana.</p>
                </div>
              ) : null}

              {availableBasics.map((basic) => {
                const isChecked = selected.has(basic.id);
                return (
                  <button
                    key={basic.id}
                    type="button"
                    className={`basics-popup-item${isChecked ? " is-selected" : ""}`}
                    onClick={() => toggleItem(basic.id)}
                  >
                    <span className="basics-popup-item-check">
                      {isChecked && <CheckIcon />}
                    </span>
                    {basic.emoji && <span className="basics-popup-item-emoji">{basic.emoji}</span>}
                    <span className="basics-popup-item-name">{basic.name}</span>
                  </button>
                );
              })}

              {alreadyInList.length > 0 && (
                <div className="basics-popup-already-section">
                  <span className="basics-popup-already-label">Ya en la lista esta semana</span>
                  {alreadyInList.map((basic) => (
                    <div key={basic.id} className="basics-popup-item is-already">
                      <span className="basics-popup-item-check is-done">
                        <CheckIcon />
                      </span>
                      {basic.emoji && <span className="basics-popup-item-emoji">{basic.emoji}</span>}
                      <span className="basics-popup-item-name">{basic.name}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* ── Footer ── */}
            <div className="basics-popup-footer">
              {error && <p className="basics-popup-footer-error">{error}</p>}
              <button
                type="button"
                className="basics-popup-apply-btn"
                onClick={handleApply}
                disabled={applying}
              >
                {applying
                  ? "Añadiendo…"
                  : selected.size === 0
                    ? "Cerrar"
                    : `Añadir ${selected.size} a la lista`}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );

  return createPortal(content, document.body);
}
