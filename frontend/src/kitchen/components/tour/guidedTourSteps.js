/**
 * guidedTourSteps.js
 *
 * Declarative state machine for the guided TUTORIAL. It teaches the app by
 * making the user perform every real action — it NEVER grants bites (the
 * challenge onboarding is the reward system; the finish screen hands off to
 * it). Copy is coach-mark style: one short title + one direct command.
 *
 * Step model:
 *   id              – stable id (resume/analytics/stall tracking)
 *   kind            – "welcome" | "finish" | undefined (coach bubble step)
 *   route           – auto-navigate here before showing (null = stay put;
 *                     navigation steps stay null — the USER taps the nav)
 *   completeIfRoute – navigation step is silently satisfied when the user is
 *                     already on this route when the step starts
 *   prepare         – TOUR_PREPARE action asking the page to expose the target
 *                     (e.g. move the planning carousel to an empty day)
 *   target          – data-tour-id string, or (ctx) => selector | selector[]
 *                     (fallback chain, tried in order); null → floating panel
 *   title           – 2–4 words
 *   command         – ONE direct instruction ("Pulsa Lista.") — the only body
 *   completionEvent – event(s) that complete the step; absence = info step
 *   matchesDetail   – optional (ctx, detail) => bool; scopes completion to an
 *                     entity (e.g. dish_selected for "pollo al horno")
 *   fallbackBody    – ONE short line when the target can't be found
 *   skipIf          – (ctx) => true to drop the step entirely
 *   placement       – preferred bubble side on wide screens
 *   blockOutside    – default true on single-tap action steps; false when the
 *                     user needs follow-up UI (pickers, menus, typing)
 */

import { ONBOARDING_EVENTS as EV, TOUR_PREPARE } from "./guidedOnboardingEvents.js";
import { normalizeDishName, ONBOARDING_RECIPE_NAME } from "./onboardingRecipe.js";

export const TOUR_VERSION = 3;

// Matches the onboarding dish by id when known, else by normalized name.
function matchesOnboardingDish(ctx, detail) {
  if (ctx?.demoRecipe && detail?.dishId === String(ctx.demoRecipe._id)) return true;
  if (detail?.dishName) {
    return normalizeDishName(detail.dishName).includes(normalizeDishName(ONBOARDING_RECIPE_NAME));
  }
  return false;
}

export const TOUR_STEPS = [
  {
    id: "welcome",
    kind: "welcome",
    route: "/kitchen/semana",
    target: null,
    title: "Vamos al grano",
    command: "Te enseño lo básico en 2 minutos."
  },
  {
    id: "nav-planning",
    route: null,
    completeIfRoute: "/kitchen/semana",
    target: "nav-semana",
    placement: "top",
    title: "Planificación",
    command: "Pulsa Planificación.",
    completionEvent: EV.PLANNING_OPENED,
    fallbackBody: "Planificación está en la barra inferior."
  },
  {
    id: "plan-pollo",
    route: "/kitchen/semana",
    prepare: TOUR_PREPARE.REVEAL_EMPTY_PLANNING_DAY,
    target: "planning-add-dish",
    placement: "bottom",
    title: "Programa un plato",
    command: "Elige «Pollo al horno» para este día.",
    completionEvent: EV.DISH_SELECTED,
    // Prefer the onboarding dish; if it's unavailable, any dish teaches the flow.
    matchesDetail: (ctx, detail) => (ctx.demoRecipe ? matchesOnboardingDish(ctx, detail) : true),
    blockOutside: false, // needs the dish picker after the tap
    fallbackBody: "La semana ya está completa. Omite este paso."
  },
  {
    id: "plan-random",
    route: "/kitchen/semana",
    prepare: TOUR_PREPARE.REVEAL_EMPTY_PLANNING_DAY,
    target: "planning-randomize",
    placement: "bottom",
    title: "Randomiza un día",
    command: "Pulsa el dado.",
    completionEvent: EV.DAY_RANDOMIZED,
    fallbackBody: "Sin días vacíos no hay dado. Omite este paso."
  },
  {
    id: "nav-shopping",
    route: null,
    target: "nav-compra",
    placement: "top",
    title: "Tu lista",
    command: "Pulsa Lista.",
    completionEvent: EV.SHOPPING_OPENED,
    completeIfRoute: "/kitchen/compra",
    fallbackBody: "Lista está en la barra inferior."
  },
  {
    id: "shopping-check",
    route: "/kitchen/compra",
    target: "shopping-item",
    placement: "bottom",
    title: "Marca lo comprado",
    command: "Marca este producto.",
    completionEvent: EV.ITEM_MARKED_BOUGHT,
    fallbackBody: "Tu lista está vacía. Omite este paso."
  },
  {
    id: "nav-kitchen",
    route: null,
    target: "nav-platos",
    placement: "top",
    title: "Mi Cocina",
    command: "Pulsa Mi Cocina.",
    completionEvent: EV.KITCHEN_OPENED,
    completeIfRoute: "/kitchen/platos",
    fallbackBody: "Mi Cocina está en la barra inferior."
  },
  {
    id: "create-open",
    route: "/kitchen/platos",
    target: "kitchen-create",
    placement: "bottom",
    title: "Crea un plato",
    command: "Pulsa + para crear un plato de prueba.",
    completionEvent: EV.CREATE_DISH_OPENED,
    fallbackBody: "El botón + crea platos. Omite este paso."
  },
  {
    id: "create-name",
    target: "dish-name-input",
    placement: "bottom",
    title: "El nombre",
    command: "Escribe el nombre. Ej: «Plato de prueba».",
    completionEvent: EV.DISH_NAME_ENTERED,
    blockOutside: false, // typing
    fallbackBody: "Abre la creación con + y escribe un nombre."
  },
  {
    id: "create-ingredient",
    target: "dish-add-ingredient",
    placement: "top",
    title: "Un ingrediente",
    command: "Añade un ingrediente.",
    completionEvent: EV.DISH_INGREDIENT_ADDED,
    blockOutside: false, // search/picker interaction
    fallbackBody: "Busca el campo Ingredientes en el formulario."
  },
  {
    id: "create-save",
    target: "dish-save",
    placement: "top",
    title: "Guárdalo",
    command: "Guarda el plato.",
    completionEvent: EV.DISH_CREATED,
    blockOutside: false, // form may need scrolling
    fallbackBody: "Pulsa Guardar al final del formulario."
  },
  {
    id: "recipe-open",
    route: "/kitchen/platos",
    // Fallback chain: the "Cocinar ahora" action of the found dish, else its card.
    target: (ctx) => (ctx.demoRecipe
      ? [
        `[data-dish-id="${ctx.demoRecipe._id}"] [data-tour-id="dish-cook"]`,
        `[data-dish-id="${ctx.demoRecipe._id}"]`
      ]
      : null),
    placement: "bottom",
    title: (ctx) => (ctx.demoRecipe ? `Abre «${ctx.demoRecipe.name}»` : "Recetas"),
    command: "Pulsa «Cocinar ahora».",
    completionEvent: EV.RECIPE_OPENED,
    // Only the onboarding recipe counts — opening another dish doesn't advance.
    matchesDetail: (ctx, detail) => Boolean(
      ctx.demoRecipe && detail?.dishId === String(ctx.demoRecipe._id)
    ),
    fallbackBody: "Sin recetas completas aún. Las verás al instalar packs del catálogo."
  },
  {
    id: "recipe-servings",
    target: "recipe-servings",
    placement: "bottom",
    title: "Comensales",
    command: "Cambia los comensales.",
    completionEvent: EV.SERVINGS_CHANGED,
    skipIf: (ctx) => !ctx.demoRecipe,
    fallbackBody: "Dentro de una receta puedes ajustar comensales."
  },
  {
    id: "recipe-execute",
    target: "recipe-cook",
    placement: "top",
    title: "Modo cocina",
    command: "Pulsa Ejecutar receta.",
    completionEvent: EV.EXECUTOR_STARTED,
    skipIf: (ctx) => !ctx.demoRecipe,
    fallbackBody: "«Ejecutar receta» inicia el modo cocina."
  },
  {
    id: "recipe-step",
    target: "recipe-step-next",
    placement: "top",
    title: "Paso a paso",
    command: "Avanza un paso.",
    completionEvent: EV.STEP_NEXT,
    skipIf: (ctx) => !ctx.demoRecipe,
    fallbackBody: "«Siguiente» avanza de paso."
  },
  {
    id: "recipe-timer",
    target: "recipe-timer",
    placement: "top",
    title: "Temporizador",
    command: "Inicia el temporizador.",
    completionEvent: EV.TIMER_STARTED,
    skipIf: (ctx) => !ctx.demoRecipe || !ctx.demoRecipeHasTimer,
    fallbackBody: "Los pasos con tiempo traen temporizador."
  },
  {
    id: "recipe-minimize",
    target: "recipe-minimize",
    placement: "bottom",
    title: "En segundo plano",
    command: "Minimiza el modo cocina.",
    completionEvent: EV.EXECUTOR_MINIMIZED,
    skipIf: (ctx) => !ctx.demoRecipe,
    fallbackBody: "El botón de minimizar deja la receta en una barra."
  },
  {
    id: "nav-catalog",
    route: null,
    target: "nav-catalogo",
    placement: "top",
    title: "Catálogo",
    command: "Pulsa Catálogo.",
    completionEvent: EV.CATALOG_OPENED,
    completeIfRoute: "/kitchen/catalogo",
    fallbackBody: "Catálogo está en la barra inferior."
  },
  {
    id: "catalog-explore",
    route: "/kitchen/catalogo",
    target: "catalog-wallet",
    placement: "bottom",
    title: "Bites",
    command: "Con Bites desbloqueas packs de platos. Se ganan en los retos.",
    fallbackBody: "Aquí verás tus Bites y packs para instalar."
  },
  {
    id: "menu-open",
    route: null,
    target: "user-menu",
    placement: "bottom",
    title: "Tu menú",
    command: "Abre tu menú.",
    completionEvent: EV.MENU_OPENED,
    fallbackBody: "Tu avatar está arriba a la derecha."
  },
  {
    id: "settings-link",
    route: null,
    target: "settings-link",
    placement: "left",
    title: "Configuración",
    command: "Pulsa Configuración.",
    completionEvent: EV.SETTINGS_OPENED,
    blockOutside: false, // clicking elsewhere would close the menu
    fallbackBody: "Abre tu menú y pulsa Configuración."
  },
  {
    id: "finish",
    kind: "finish",
    route: null,
    target: null,
    title: "Listo",
    command: "Ahora abre el onboarding y completa los retos para ganar Bites."
  }
];

// Steps counted in the "3/12" progress indicator (welcome + finish excluded),
// after applying skipIf against the runtime context.
export function getActiveSteps(ctx = {}) {
  return TOUR_STEPS.filter((s) => !(typeof s.skipIf === "function" && s.skipIf(ctx)));
}

export function progressLabelFor(activeSteps, index) {
  const step = activeSteps[index];
  if (!step || step.kind) return null;
  const progressSteps = activeSteps.filter((s) => !s.kind);
  return `${progressSteps.indexOf(step) + 1}/${progressSteps.length}`;
}

/** Returns an ordered selector fallback chain (first match wins), or []. */
export function resolveStepTargets(step, ctx = {}) {
  if (!step?.target) return [];
  const raw = typeof step.target === "function" ? step.target(ctx) : `[data-tour-id="${step.target}"]`;
  if (!raw) return [];
  return Array.isArray(raw) ? raw.filter(Boolean) : [raw];
}

export function resolveStepTitle(step, ctx = {}) {
  return typeof step.title === "function" ? step.title(ctx) : step.title;
}

export function stepCompletionEvents(step) {
  if (!step?.completionEvent) return [];
  return Array.isArray(step.completionEvent) ? step.completionEvent : [step.completionEvent];
}

/** True when clicks outside the spotlight should be blocked for this step. */
export function stepBlocksOutside(step) {
  if (!step || step.kind) return true;
  if (stepCompletionEvents(step).length === 0) return true;
  return step.blockOutside !== false;
}
