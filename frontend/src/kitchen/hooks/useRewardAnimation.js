/**
 * useRewardAnimation.js
 *
 * Reward micro-animation utilities for Lunchfy.
 *
 * Exports:
 *   burstParticles(element, opts)   — imperative particle burst; fire-and-forget
 *   triggerMilestone(opts)          — fires a 'lunchfy:milestone' custom event
 *   useRewardAnimation()            — React hook exposing both functions
 *
 * Design goals:
 *   - Runs outside React render cycle (safe to call in event handlers)
 *   - Respects prefers-reduced-motion
 *   - Works in light and dark mode (reads data-theme attribute)
 *   - No layout-triggering properties; uses transform + opacity only
 *   - Self-cleaning: DOM nodes removed after animation completes
 */

import { useCallback } from "react";
import { animate, stagger } from "animejs";

// ── Colour palettes ───────────────────────────────────────────────────────────

/** Pastel-indigo palette that fits the Lunchfy neo-soft UI */
const PARTICLE_COLORS_LIGHT = [
  "#6366f1", // indigo-500
  "#8b5cf6", // violet-500
  "#22c55e", // green-500  (matches existing checkBurst green)
  "#fbbf24", // amber-400
  "#60a5fa", // blue-400
  "#f472b6"  // pink-400
];

const PARTICLE_COLORS_DARK = [
  "#818cf8", // indigo-400
  "#a78bfa", // violet-400
  "#4ade80", // green-400
  "#fcd34d", // amber-300
  "#93c5fd", // blue-300
  "#f9a8d4"  // pink-300
];

// ── Helpers ───────────────────────────────────────────────────────────────────

function prefersReducedMotion() {
  if (typeof window === "undefined") return false;
  return window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;
}

function isDarkMode() {
  if (typeof document === "undefined") return false;
  return document.documentElement.getAttribute("data-theme") === "dark";
}

function getColors() {
  return isDarkMode() ? PARTICLE_COLORS_DARK : PARTICLE_COLORS_LIGHT;
}

// ── burstParticles ────────────────────────────────────────────────────────────

/**
 * Spawns 4-6 small particle dots around a DOM element and animates them
 * outward, then removes them.  Fire-and-forget — never throws.
 *
 * @param {Element|null} element  – anchor element (e.g. the check button)
 * @param {object} [opts]
 * @param {number} [opts.count=5]       – number of particles
 * @param {number} [opts.radius=40]     – max spread radius in px
 * @param {number} [opts.duration=560]  – animation duration in ms
 */
export function burstParticles(element, opts = {}) {
  if (prefersReducedMotion()) return;
  if (!element || typeof document === "undefined") return;

  const {
    count    = 5,
    radius   = 40,
    duration = 560
  } = opts;

  let rect;
  try {
    rect = element.getBoundingClientRect();
  } catch {
    return;
  }

  // Centre of the anchor element in viewport coordinates
  const cx = rect.left + rect.width / 2;
  const cy = rect.top  + rect.height / 2;

  const colors = getColors();

  // Build particle elements
  const particles = Array.from({ length: count }, (_, i) => {
    const el = document.createElement("div");
    const color = colors[i % colors.length];
    const size  = 4 + Math.random() * 4; // 4–8 px

    // All positioning through CSS; animation is transform-only → compositor thread
    Object.assign(el.style, {
      position       : "fixed",
      top            : `${cy}px`,
      left           : `${cx}px`,
      width          : `${size}px`,
      height         : `${size}px`,
      borderRadius   : "50%",
      background     : color,
      pointerEvents  : "none",
      zIndex         : "9998",
      transform      : "translate(-50%, -50%)",
      willChange     : "transform, opacity",
      // Prevent these nodes from being picked up by screen readers
      ariaHidden     : "true"
    });

    document.body.appendChild(el);
    return el;
  });

  // Animate each particle outward in a fan spread
  particles.forEach((el, i) => {
    // Spread particles evenly around the circle with a small jitter
    const baseAngle = (i / count) * Math.PI * 2;
    const jitter    = (Math.random() - 0.5) * (Math.PI / count);
    const angle     = baseAngle + jitter - Math.PI / 2; // start from top
    const dist      = radius * (0.7 + Math.random() * 0.6);

    const tx = Math.cos(angle) * dist;
    const ty = Math.sin(angle) * dist;
    const dur = duration * (0.85 + Math.random() * 0.3);

    animate(el, {
      translateX : [0, tx],
      translateY : [0, ty],
      opacity    : [1, 0],
      scale      : [1, 0.25],
      duration   : dur,
      ease       : "outCubic",
      onComplete : () => {
        try { el.remove(); } catch { /* already removed */ }
      }
    });
  });
}

// ── triggerMilestone ──────────────────────────────────────────────────────────

/**
 * Dispatches a 'lunchfy:milestone' custom event on window.
 * <MilestoneToast /> in Layout.jsx listens for this and renders the toast.
 *
 * @param {object} opts
 * @param {string} [opts.title="¡Completado!"]   – main toast text
 * @param {string} [opts.subtitle]               – smaller secondary text
 * @param {string} [opts.icon="✓"]               – emoji or short symbol
 * @param {'check'|'trophy'|'bites'|'flame'|'spark'} [opts.variant='check']
 */
export function triggerMilestone({
  title    = "¡Completado!",
  subtitle = "",
  icon     = "✓",
  variant  = "check"
} = {}) {
  if (typeof window === "undefined") return;
  window.dispatchEvent(
    new CustomEvent("lunchfy:milestone", {
      detail: { title, subtitle, icon, variant }
    })
  );
}

// ── React hook ────────────────────────────────────────────────────────────────

/**
 * React hook that exposes both utilities as stable callbacks.
 * Safe to call during event handlers — never triggers a re-render.
 */
export function useRewardAnimation() {
  const triggerBurst = useCallback((element, opts) => {
    burstParticles(element, opts);
  }, []);

  const triggerReward = useCallback(({ type, label, title, subtitle, icon, variant, anchorRef } = {}) => {
    if (type === "shopping-item") {
      const el = anchorRef?.current ?? null;
      burstParticles(el, { count: 5 });
    } else {
      triggerMilestone({ title: title || label, subtitle, icon, variant });
    }
  }, []);

  return { burstParticles: triggerBurst, triggerMilestone, triggerReward };
}
