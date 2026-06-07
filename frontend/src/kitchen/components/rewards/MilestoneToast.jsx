/**
 * MilestoneToast.jsx
 *
 * A polished floating toast that appears when a milestone, challenge, or
 * reward is earned.  Rendered via a React portal at document.body so it
 * overlays everything without clipping.
 *
 * Usage (imperative, from anywhere):
 *   import { triggerMilestone } from '../../hooks/useRewardAnimation.js';
 *   triggerMilestone({ title: 'Reto completado', subtitle: '+10 Bites', icon: '🏆' });
 *
 * Usage (component, from Layout):
 *   <MilestoneToast />   – mount once, it self-manages via event listener
 *
 * Respects prefers-reduced-motion: falls back to an instant opacity flash.
 */

import React, { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { animate } from "animejs";
import "./rewards.css";

// ── Variant icon map ──────────────────────────────────────────────────────────

const VARIANT_ICONS = {
  check  : "✓",
  trophy : "🏆",
  bites  : "🍪",
  flame  : "🔥",
  spark  : "✨"
};

function getIcon(variant, icon) {
  if (icon && icon !== "✓") return icon;
  return VARIANT_ICONS[variant] ?? "✓";
}

// ── Component ─────────────────────────────────────────────────────────────────

const AUTO_DISMISS_MS = 2800;

export default function MilestoneToast() {
  const [toast, setToast]       = useState(null); // { title, subtitle, icon, variant }
  const [visible, setVisible]   = useState(false);
  const cardRef  = useRef(null);
  const timerRef = useRef(null);

  // ── Dismiss (animate out then hide) ───────────────────────────────────────

  const dismiss = useCallback(() => {
    clearTimeout(timerRef.current);
    const card = cardRef.current;
    if (!card) { setVisible(false); setToast(null); return; }

    const reduced = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    if (reduced) {
      setVisible(false);
      setToast(null);
      return;
    }

    animate(card, {
      translateY : [0, 10],
      opacity    : [1, 0],
      scale      : [1, 0.95],
      duration   : 260,
      ease       : "inQuad",
      onComplete : () => {
        setVisible(false);
        setToast(null);
      }
    });
  }, []);

  // ── Show toast (animate in) ───────────────────────────────────────────────

  const showToast = useCallback((detail) => {
    // Clear any previous auto-dismiss timer
    clearTimeout(timerRef.current);

    setToast(detail);
    setVisible(true);

    // Entrance animation runs after React renders the card (via next tick)
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        const card = cardRef.current;
        if (!card) return;

        const reduced = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
        if (reduced) {
          // Just fade in
          animate(card, { opacity: [0, 1], duration: 180, ease: "linear" });
        } else {
          animate(card, {
            translateY : [28, 0],
            opacity    : [0, 1],
            scale      : [0.94, 1],
            duration   : 400,
            ease       : "outBack"
          });
        }

        // Auto-dismiss
        timerRef.current = window.setTimeout(dismiss, AUTO_DISMISS_MS);
      });
    });
  }, [dismiss]);

  // ── Listen for milestone events ───────────────────────────────────────────

  useEffect(() => {
    const handler = (event) => {
      const detail = event?.detail ?? {};
      showToast({
        title    : detail.title    ?? "¡Completado!",
        subtitle : detail.subtitle ?? "",
        icon     : detail.icon     ?? "✓",
        variant  : detail.variant  ?? "check"
      });
    };

    window.addEventListener("lunchfy:milestone", handler);
    return () => {
      window.removeEventListener("lunchfy:milestone", handler);
      clearTimeout(timerRef.current);
    };
  }, [showToast]);

  // ── Nothing to render ─────────────────────────────────────────────────────

  if (!visible || !toast) return null;

  const displayIcon = getIcon(toast.variant, toast.icon);

  // ── Portal ────────────────────────────────────────────────────────────────

  return createPortal(
    <div
      className="lf-milestone-overlay"
      role="status"
      aria-live="polite"
      aria-atomic="true"
    >
      <div
        ref={cardRef}
        className={`lf-milestone-card lf-milestone-card--${toast.variant ?? "check"}`}
        style={{ opacity: 0 }} // start invisible; anime.js takes over
      >
        <div className="lf-milestone-icon-wrap" aria-hidden="true">
          <span className="lf-milestone-icon">{displayIcon}</span>
        </div>
        <div className="lf-milestone-body">
          <p className="lf-milestone-title">{toast.title}</p>
          {toast.subtitle ? (
            <p className="lf-milestone-subtitle">{toast.subtitle}</p>
          ) : null}
        </div>
        <button
          type="button"
          className="lf-milestone-close"
          onClick={dismiss}
          aria-label="Cerrar notificación"
        >
          ×
        </button>
      </div>
    </div>,
    document.body
  );
}
