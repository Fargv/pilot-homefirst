/**
 * guidedOnboardingEvents.js — tiny pub/sub for guided onboarding.
 *
 * App code emits semantic events at REAL action success points (dish assigned,
 * item purchased, timer started…). The guided onboarding provider listens and
 * advances/rewards only when the current step's completionEvent arrives.
 *
 * Same window.CustomEvent pattern as 'lunchfy:milestone': no coupling — pages
 * emit unconditionally (cheap no-op when no tour is running), the provider is
 * the only listener.
 */

const CHANNEL = "lunchfy:onboarding-action";

export const ONBOARDING_EVENTS = {
  DISH_SELECTED: "planning:dish_selected",
  DAY_RANDOMIZED: "planning:day_randomized",
  ITEM_MARKED_BOUGHT: "shopping:item_marked_bought",
  CREATE_DISH_OPENED: "kitchen:create_dish_opened",
  RECIPE_OPENED: "recipe:opened",
  SERVINGS_CHANGED: "recipe:servings_changed",
  EXECUTOR_STARTED: "recipe:executor_started",
  STEP_NEXT: "recipe:step_next",
  TIMER_STARTED: "recipe:timer_started",
  EXECUTOR_MINIMIZED: "recipe:executor_minimized",
  CATALOG_OPENED: "catalog:opened",
  SETTINGS_OPENED: "settings:opened"
};

/** Fire-and-forget; safe to call from any handler, never throws. */
export function emitOnboardingEvent(type, detail = {}) {
  if (typeof window === "undefined" || !type) return;
  try {
    window.dispatchEvent(new CustomEvent(CHANNEL, { detail: { type, ...detail } }));
  } catch { /* never break app flows */ }
}

/** Subscribe to all onboarding action events. Returns an unsubscribe fn. */
export function onOnboardingEvent(handler) {
  if (typeof window === "undefined") return () => {};
  const listener = (event) => {
    const detail = event?.detail;
    if (detail?.type) handler(detail.type, detail);
  };
  window.addEventListener(CHANNEL, listener);
  return () => window.removeEventListener(CHANNEL, listener);
}
