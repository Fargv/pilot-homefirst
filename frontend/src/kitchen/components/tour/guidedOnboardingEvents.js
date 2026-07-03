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
const PREPARE_CHANNEL = "lunchfy:onboarding-prepare";

export const ONBOARDING_EVENTS = {
  PLANNING_OPENED: "planning:opened",
  DISH_SELECTED: "planning:dish_selected",
  DAY_RANDOMIZED: "planning:day_randomized",
  SHOPPING_OPENED: "shopping:opened",
  ITEM_MARKED_BOUGHT: "shopping:item_marked_bought",
  KITCHEN_OPENED: "kitchen:opened",
  CREATE_DISH_OPENED: "kitchen:create_dish_opened",
  DISH_NAME_ENTERED: "kitchen:dish_name_entered",
  DISH_INGREDIENT_ADDED: "kitchen:dish_ingredient_added",
  DISH_CREATED: "kitchen:dish_created",
  RECIPE_OPENED: "recipe:opened",
  SERVINGS_CHANGED: "recipe:servings_changed",
  EXECUTOR_STARTED: "recipe:executor_started",
  STEP_NEXT: "recipe:step_next",
  TIMER_STARTED: "recipe:timer_started",
  EXECUTOR_MINIMIZED: "recipe:executor_minimized",
  MENU_OPENED: "menu:opened",
  CATALOG_OPENED: "catalog:opened",
  SETTINGS_OPENED: "settings:opened"
};

// ── Prepare channel ──────────────────────────────────────────────────────────
// Steps can ask the CURRENT screen to expose their target (e.g. move the
// planning carousel to an empty day) without the tour reaching into page
// state. Pages subscribe; unknown actions are ignored.

export const TOUR_PREPARE = {
  REVEAL_EMPTY_PLANNING_DAY: "planning:reveal-empty-day"
};

export function emitTourPrepare(action) {
  if (typeof window === "undefined" || !action) return;
  try {
    window.dispatchEvent(new CustomEvent(PREPARE_CHANNEL, { detail: { action } }));
  } catch { /* never break app flows */ }
}

export function onTourPrepare(handler) {
  if (typeof window === "undefined") return () => {};
  const listener = (event) => {
    const action = event?.detail?.action;
    if (action) handler(action);
  };
  window.addEventListener(PREPARE_CHANNEL, listener);
  return () => window.removeEventListener(PREPARE_CHANNEL, listener);
}

// ── Handoff to the challenge onboarding ──────────────────────────────────────
// The tutorial teaches; the retos award bites. The finish screen asks the
// challenge banner to expand + open its panel via this channel.

const OPEN_ONBOARDING_CHANNEL = "lunchfy:open-onboarding-panel";

export function requestOpenOnboardingPanel() {
  if (typeof window === "undefined") return;
  try {
    window.dispatchEvent(new CustomEvent(OPEN_ONBOARDING_CHANNEL));
  } catch { /* non-fatal */ }
}

export function onOpenOnboardingPanelRequest(handler) {
  if (typeof window === "undefined") return () => {};
  window.addEventListener(OPEN_ONBOARDING_CHANNEL, handler);
  return () => window.removeEventListener(OPEN_ONBOARDING_CHANNEL, handler);
}

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
