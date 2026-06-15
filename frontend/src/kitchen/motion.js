/**
 * motion.js — central motion system for Lunchfy.
 *
 * Single source of truth for animation durations and easings, mirrored by
 * the CSS tokens (--motion-fast/normal/slow, --ease-out/in/spring) in
 * kitchen.css. Use these helpers for imperative micro-interactions; use the
 * .hf-anim-* CSS classes for simple mount animations.
 *
 * Rules:
 *   - Every helper is a no-op (jump to final state) under prefers-reduced-motion.
 *   - Transform/opacity only where possible — compositor-friendly.
 *   - Fire-and-forget: helpers never throw and clean up after themselves.
 */

import { animate, stagger } from "animejs";

// ── Tokens (keep in sync with kitchen.css :root) ─────────────────────────────

export const DURATION = {
  fast: 120,
  normal: 200,
  slow: 350,
};

export const EASE = {
  out: "cubicBezier(0.16, 1, 0.3, 1)",
  in: "cubicBezier(0.7, 0, 0.84, 0)",
  spring: "cubicBezier(0.34, 1.56, 0.64, 1)",
};

export function prefersReducedMotion() {
  if (typeof window === "undefined") return false;
  return window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;
}

// ── Entrances ────────────────────────────────────────────────────────────────

/**
 * Fade + rise entrance for one element or a list (staggered).
 * @param {Element|Element[]|NodeList} targets
 * @param {{distance?: number, staggerMs?: number, duration?: number}} [opts]
 */
export function riseIn(targets, opts = {}) {
  if (!targets) return;
  const { distance = 10, staggerMs = 40, duration = DURATION.slow } = opts;
  if (prefersReducedMotion()) return;
  try {
    animate(targets, {
      opacity: [0, 1],
      translateY: [distance, 0],
      duration,
      delay: stagger(staggerMs),
      ease: EASE.out,
    });
  } catch { /* never block UI on animation */ }
}

/**
 * Scale + fade pop-in (modals, popovers, newly added items).
 */
export function popIn(el, opts = {}) {
  if (!el || prefersReducedMotion()) return;
  const { duration = DURATION.normal } = opts;
  try {
    animate(el, {
      opacity: [0, 1],
      scale: [0.96, 1],
      duration,
      ease: EASE.out,
    });
  } catch { /* noop */ }
}

/**
 * Fade-out exit. Calls onComplete (always, even under reduced motion).
 */
export function fadeOut(el, onComplete, opts = {}) {
  const done = typeof onComplete === "function" ? onComplete : () => {};
  if (!el || prefersReducedMotion()) {
    done();
    return;
  }
  const { duration = DURATION.fast, translateY = 0 } = opts;
  try {
    animate(el, {
      opacity: [1, 0],
      translateY: [0, translateY],
      duration,
      ease: EASE.in,
      onComplete: done,
    });
  } catch {
    done();
  }
}

// ── Feedback ─────────────────────────────────────────────────────────────────

/**
 * Success bounce — quick scale pulse with spring overshoot.
 * Use on checkmarks, completed items, reward icons.
 */
export function checkBounce(el, opts = {}) {
  if (!el || prefersReducedMotion()) return;
  const { scale = 1.18, duration = DURATION.slow } = opts;
  try {
    animate(el, {
      scale: [1, scale, 1],
      duration,
      ease: EASE.spring,
    });
  } catch { /* noop */ }
}

/**
 * Animated number count-up for XP / Bites gains.
 * Writes formatted text into el; ends exactly on `to`.
 * @param {Element} el
 * @param {{from?: number, to: number, duration?: number, format?: (n:number)=>string}} opts
 */
export function countUp(el, opts = {}) {
  if (!el) return;
  const { from = 0, to = 0, duration = 700, format = (n) => String(Math.round(n)) } = opts;
  if (prefersReducedMotion()) {
    el.textContent = format(to);
    return;
  }
  const counter = { value: from };
  try {
    animate(counter, {
      value: to,
      duration,
      ease: EASE.out,
      onUpdate: () => {
        el.textContent = format(counter.value);
      },
      onComplete: () => {
        el.textContent = format(to);
      },
    });
  } catch {
    el.textContent = format(to);
  }
}

/**
 * Soft glow pulse (paired with count-up on XP/Bites chips).
 * Uses a CSS class so the glow color stays theme-aware.
 */
export function glowPulse(el) {
  if (!el || prefersReducedMotion()) return;
  el.classList.remove("hf-glow-pulse");
  // restart the CSS animation
  void el.offsetWidth;
  el.classList.add("hf-glow-pulse");
  el.addEventListener(
    "animationend",
    () => el.classList.remove("hf-glow-pulse"),
    { once: true }
  );
}

/**
 * Check-off exit for list items (shopping list): fade + slide right, then
 * collapse the row height so siblings close the gap smoothly.
 * Calls onComplete when the row can be removed from state.
 */
export function checkOut(el, onComplete, opts = {}) {
  const done = typeof onComplete === "function" ? onComplete : () => {};
  if (!el || prefersReducedMotion()) {
    done();
    return;
  }
  const { duration = DURATION.normal } = opts;
  try {
    const h = el.offsetHeight;
    el.style.height = `${h}px`;
    el.style.overflow = "hidden";
    animate(el, {
      opacity: [1, 0],
      translateX: [0, 24],
      duration,
      ease: EASE.in,
      onComplete: () => {
        animate(el, {
          height: [h, 0],
          marginTop: 0,
          marginBottom: 0,
          paddingTop: 0,
          paddingBottom: 0,
          duration: DURATION.fast,
          ease: EASE.out,
          onComplete: done,
        });
      },
    });
  } catch {
    done();
  }
}

// ── Layout ───────────────────────────────────────────────────────────────────

/**
 * Accordion expand/collapse: animates height + opacity of a content element
 * whose natural height is unknown. `expanded` is the target state.
 */
export function accordion(el, expanded, opts = {}) {
  if (!el) return;
  const { duration = DURATION.normal } = opts;
  if (prefersReducedMotion()) {
    el.style.height = expanded ? "auto" : "0px";
    el.style.opacity = expanded ? "1" : "0";
    return;
  }
  try {
    const target = expanded ? el.scrollHeight : 0;
    const current = el.offsetHeight;
    el.style.overflow = "hidden";
    animate(el, {
      height: [current, target],
      opacity: expanded ? [0.4, 1] : [1, 0.4],
      duration,
      ease: EASE.out,
      onComplete: () => {
        if (expanded) {
          el.style.height = "auto";
          el.style.overflow = "";
        }
      },
    });
  } catch { /* noop */ }
}
