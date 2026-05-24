/**
 * BasicsPopup — "Básicos de compra" popup/modal
 * - Pro/Premium: shows full checkbox list, apply action
 * - Basic: shows locked teaser with lock icon
 */
import React, { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { apiRequest } from "../api.js";
import { canUseBasicsFeature } from "../subscription.js";
import { useNavigate } from "react-router-dom";

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
    <svg viewBox="0 0 24 24" fill="none" width={32} height={32} aria-hidden="true">
      <rect x="5" y="11" width="14" height="10" rx="2.5" stroke="currentColor" strokeWidth="1.7" />
      <path d="M8 11V8a4 4 0 0 1 8 0v3" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
    </svg>
  );
}

function CheckIcon() {
  return (
    <svg viewBox="0 0 20 20" fill="none" width={14} height={14} aria-hidden="true">
      <path d="M4 10.5l4.5 4.5 7.5-9" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function BasketIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" width={20} height={20} aria-hidden="true">
      <path d="M6 7l2-4M18 7l-2-4" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
      <path d="M3 7h18l-2 11a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2z" stroke="currentColor" strokeWidth="1.7" strokeLinejoin="round" />
      <path d="M9 12l1.5 2 4-4" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function BasicsPopup({ weekStart, onClose, onApplied, currentPendingCanonicals = new Set(), plan }) {
  const navigate = useNavigate();
  const [basics, setBasics] = useState([]);
  const [loading, setLoading] = useState(true);
  const [applying, setApplying] = useState(false);
  const [error, setError] = useState("");
  const [selected, setSelected] = useState(new Set());
  const backdropRef = useRef(null);

  const basicsEnabled = canUseBasicsFeature(plan);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError("");
    apiRequest("/api/kitchen/basics")
      .then((data) => {
        if (cancelled) return;
        const activeBasics = (data.basics || []).filter((b) => b.active !== false);
        setBasics(activeBasics);
        // Pre-select all that aren't already in the list
        const initial = new Set(
          activeBasics
            .filter((b) => !currentPendingCanonicals.has(String(b.canonicalName || "").toLowerCase()))
            .map((b) => b.id)
        );
        setSelected(initial);
      })
      .catch((err) => {
        if (!cancelled) setError(err?.message || "No se pudieron cargar los básicos.");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [weekStart]);

  const toggleItem = (id) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleAll = () => {
    const availableIds = basics
      .filter((b) => !currentPendingCanonicals.has(String(b.canonicalName || "").toLowerCase()))
      .map((b) => b.id);
    const allSelected = availableIds.every((id) => selected.has(id));
    if (allSelected) {
      setSelected(new Set());
    } else {
      setSelected(new Set(availableIds));
    }
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

  const availableBasics = basics.filter(
    (b) => !currentPendingCanonicals.has(String(b.canonicalName || "").toLowerCase())
  );
  const alreadyInList = basics.filter(
    (b) => currentPendingCanonicals.has(String(b.canonicalName || "").toLowerCase())
  );

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
        {/* Header */}
        <div className="basics-popup-header">
          <div className="basics-popup-title-row">
            <BasketIcon />
            <span className="basics-popup-title">Básicos de compra</span>
          </div>
          <button
            type="button"
            className="basics-popup-close"
            onClick={onClose}
            aria-label="Cerrar"
          >
            <CloseIcon />
          </button>
        </div>

        {/* Body */}
        {!basicsEnabled ? (
          /* ── Locked teaser ── */
          <div className="basics-popup-locked">
            <div className="basics-popup-lock-icon">
              <LockIcon />
            </div>
            <p className="basics-popup-locked-title">Básicos de compra</p>
            <p className="basics-popup-locked-desc">
              Guarda los artículos que compras cada semana y añádelos a tu lista con un solo toque. Disponible en <strong>Pro</strong> y <strong>Premium</strong>.
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
            {/* Toggle-all row */}
            {availableBasics.length > 0 && (
              <div className="basics-popup-toggle-all">
                <button
                  type="button"
                  className="basics-popup-toggle-all-btn"
                  onClick={toggleAll}
                >
                  {availableBasics.every((b) => selected.has(b.id)) ? "Deseleccionar todo" : "Seleccionar todo"}
                </button>
                <span className="basics-popup-counter">
                  {selected.size} seleccionado{selected.size !== 1 ? "s" : ""}
                </span>
              </div>
            )}

            {/* Items list */}
            <div className="basics-popup-list">
              {basics.length === 0 && (
                <p className="basics-popup-empty">No tienes básicos configurados.<br />Ve a Configuración → Household → Básicos.</p>
              )}

              {availableBasics.map((basic) => {
                const isSelected = selected.has(basic.id);
                return (
                  <button
                    key={basic.id}
                    type="button"
                    className={`basics-popup-item${isSelected ? " is-selected" : ""}`}
                    onClick={() => toggleItem(basic.id)}
                  >
                    <span className="basics-popup-item-check">
                      {isSelected && <CheckIcon />}
                    </span>
                    {basic.emoji && <span className="basics-popup-item-emoji">{basic.emoji}</span>}
                    <span className="basics-popup-item-name">{basic.name}</span>
                  </button>
                );
              })}

              {alreadyInList.length > 0 && (
                <div className="basics-popup-already-section">
                  <span className="basics-popup-already-label">Ya en la lista</span>
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

            {/* Footer actions */}
            {basics.length > 0 && (
              <div className="basics-popup-footer">
                {error && basics.length > 0 && <p className="basics-popup-footer-error">{error}</p>}
                <button
                  type="button"
                  className="basics-popup-apply-btn"
                  onClick={handleApply}
                  disabled={applying || selected.size === 0}
                >
                  {applying
                    ? "Añadiendo…"
                    : selected.size === 0
                      ? "Cerrar"
                      : `Añadir ${selected.size} a la lista`}
                </button>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );

  return createPortal(content, document.body);
}
