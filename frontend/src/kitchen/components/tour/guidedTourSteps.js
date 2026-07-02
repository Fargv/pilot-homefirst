/**
 * guidedTourSteps.js
 *
 * Declarative config for the interactive guided onboarding. The user learns
 * BY DOING: action steps advance only when the app emits the step's
 * completionEvent (see guidedOnboardingEvents.js) — never by pressing
 * "Siguiente". Rewards ride the completion, and only for real actions.
 *
 * Step model:
 *   id              – stable id (resume/analytics)
 *   kind            – "welcome" | "finish" | undefined (coach bubble step)
 *   route           – auto-navigate here before showing (null = stay put)
 *   target          – data-tour-id string, or (ctx) => selector for dynamic
 *                     targets (ctx = { demoRecipe }); null → floating panel
 *   title/body      – short Spanish copy
 *   hint            – the action line ("Ahora pulsa…") shown emphasized
 *   why             – optional "por qué importa" expandable line
 *   completionEvent – event(s) that complete the step; absence = info step
 *                     (info steps are the only ones with a "Siguiente" button)
 *   rewardStep      – backend TOUR_STEP_REWARDS key sent on completion
 *   fallbackBody    – copy when the target can't be found (empty data, gates)
 *   skipIf          – (ctx) => true to drop the step entirely (e.g. no recipe)
 *   placement       – preferred bubble side on wide screens
 *
 * Targets are stable [data-tour-id] anchors; the dynamic recipe step targets
 * [data-dish-id="…"] for the auto-picked demo recipe.
 */

import { ONBOARDING_EVENTS as EV } from "./guidedOnboardingEvents.js";

export const TOUR_VERSION = 2;

export const TOUR_STEPS = [
  {
    id: "welcome",
    kind: "welcome",
    route: "/kitchen/semana",
    target: null,
    title: "¡Bienvenido a Lunchfy!",
    body: "Aprende lo esencial haciendo, no leyendo:",
    bullets: [
      { icon: "📅", text: "Planifica tu semana" },
      { icon: "🛒", text: "Compra con lista automática" },
      { icon: "🍳", text: "Cocina paso a paso" },
      { icon: "🍪", text: "Gana Bites con cada acción" }
    ]
  },
  {
    id: "plan-choose",
    route: "/kitchen/semana",
    target: "planning-add-dish",
    placement: "bottom",
    title: "Planifica tu primera comida",
    body: "Cada día tiene su comida. Los platos que planificas alimentan tu lista de la compra.",
    hint: "Pulsa «+ Añadir plato» y elige un plato para este día.",
    why: "Planificar es el corazón de Lunchfy: de aquí sale tu lista de la compra automática.",
    completionEvent: [EV.DISH_SELECTED, EV.DAY_RANDOMIZED],
    rewardStep: "plan_dish",
    fallbackBody: "Parece que esta semana ya está completa. Puedes saltar este paso — asignar platos funciona igual en cualquier día vacío."
  },
  {
    id: "plan-random",
    route: "/kitchen/semana",
    target: "planning-randomize",
    placement: "bottom",
    title: "¿Sin ideas? Deja que Lunchfy elija",
    body: "El dado asigna un plato al azar entre tus platos disponibles.",
    hint: "Ahora pulsa el dado para randomizar un día.",
    why: "La randomización rellena tu semana en segundos cuando no quieres pensar.",
    completionEvent: EV.DAY_RANDOMIZED,
    rewardStep: "randomize_day",
    fallbackBody: "Cuando un día esté vacío verás un dado para randomizarlo. Puedes saltar este paso."
  },
  {
    id: "shopping-check",
    route: "/kitchen/compra",
    target: "shopping-item",
    placement: "bottom",
    title: "Tu lista se crea sola",
    body: "Estos productos vienen de los platos que acabas de planificar.",
    hint: "Marca este producto como comprado tocando el círculo.",
    why: "En el súper, marcar lo comprado te dice en tiempo real qué falta.",
    completionEvent: EV.ITEM_MARKED_BOUGHT,
    rewardStep: "mark_bought",
    fallbackBody: "Tu lista está vacía todavía — se llenará con los ingredientes de tus platos planificados. Puedes saltar este paso."
  },
  {
    id: "kitchen-create",
    route: "/kitchen/platos",
    target: "kitchen-create",
    placement: "bottom",
    title: "Mi Cocina: tus platos y productos",
    body: "Aquí creas tus propios platos. Un plato con ingredientes genera su compra automáticamente.",
    hint: "Pulsa + para abrir la creación. Después puedes cerrarla sin guardar.",
    why: "Tus platos de siempre, una vez creados, se planifican con un toque.",
    completionEvent: EV.CREATE_DISH_OPENED,
    rewardStep: "create_dish_opened",
    fallbackBody: "El botón + de Mi Cocina abre la creación de platos y productos. Puedes saltar este paso."
  },
  {
    id: "recipe-open",
    route: "/kitchen/platos",
    target: (ctx) => (ctx.demoRecipe ? `[data-dish-id="${ctx.demoRecipe._id}"]` : null),
    placement: "bottom",
    title: "Este plato tiene receta",
    body: (ctx) => (ctx.demoRecipe
      ? `«${ctx.demoRecipe.name}» tiene pasos y temporizadores.`
      : ""),
    hint: "Ábrelo y toca «Ver receta» para ver su elaboración.",
    completionEvent: EV.RECIPE_OPENED,
    fallbackBody: "Aún no tienes platos con receta completa. Cuando instales un pack del catálogo o crees una receta con pasos, podrás cocinar en modo guiado con temporizadores. Te lo enseñamos en otro momento."
  },
  {
    id: "recipe-servings",
    target: "recipe-servings",
    placement: "bottom",
    title: "Ajusta los comensales",
    body: "Las cantidades de todos los ingredientes se recalculan solas.",
    hint: "Cambia los comensales con + o −.",
    completionEvent: EV.SERVINGS_CHANGED,
    rewardStep: "recipe_servings",
    skipIf: (ctx) => !ctx.demoRecipe,
    fallbackBody: "Dentro de una receta puedes ajustar los comensales y las cantidades se recalculan. Puedes saltar este paso."
  },
  {
    id: "recipe-execute",
    target: "recipe-cook",
    placement: "top",
    title: "Cocina en modo guiado",
    body: "El modo cocina te lleva paso a paso, con los ingredientes de cada paso.",
    hint: "Pulsa «Ejecutar receta».",
    completionEvent: EV.EXECUTOR_STARTED,
    rewardStep: "recipe_execution",
    skipIf: (ctx) => !ctx.demoRecipe,
    fallbackBody: "El botón «Ejecutar receta» inicia el modo cocina paso a paso. Puedes saltar este paso."
  },
  {
    id: "recipe-step",
    target: "recipe-step-next",
    placement: "top",
    title: "Avanza por los pasos",
    body: "Cada paso muestra solo lo que necesitas en ese momento.",
    hint: "Pulsa «Siguiente» para avanzar un paso.",
    completionEvent: EV.STEP_NEXT,
    skipIf: (ctx) => !ctx.demoRecipe,
    fallbackBody: "En el modo cocina, «Siguiente» avanza de paso. Puedes saltar este paso."
  },
  {
    id: "recipe-timer",
    target: "recipe-timer",
    placement: "top",
    title: "Temporizadores integrados",
    body: "Puedes tener varios a la vez y siguen contando aunque salgas de la receta.",
    hint: "Inicia el temporizador de este paso.",
    completionEvent: EV.TIMER_STARTED,
    rewardStep: "recipe_timer",
    skipIf: (ctx) => !ctx.demoRecipe || !ctx.demoRecipeHasTimer,
    fallbackBody: "Los pasos con tiempo traen temporizador integrado. Busca uno más adelante — puedes saltar este paso."
  },
  {
    id: "recipe-minimize",
    target: "recipe-minimize",
    placement: "bottom",
    title: "La cocina sigue en segundo plano",
    body: "Minimiza el modo cocina: los temporizadores siguen y puedes volver cuando quieras.",
    hint: "Pulsa minimizar para continuar el tour.",
    completionEvent: EV.EXECUTOR_MINIMIZED,
    skipIf: (ctx) => !ctx.demoRecipe,
    fallbackBody: "Con el botón de minimizar, la receta queda en una barra inferior sin perder los temporizadores. Puedes saltar este paso."
  },
  {
    id: "catalog",
    route: null, // the user navigates: tapping Catálogo IS the action
    target: "nav-catalogo",
    placement: "top",
    title: "Bites y catálogo",
    body: "Los Bites que ganas con acciones útiles se gastan en packs de platos listos para usar.",
    hint: "Pulsa «Catálogo» para verlo.",
    why: "Cada pack instala platos con receta en tu cocina al instante.",
    completionEvent: EV.CATALOG_OPENED,
    fallbackBody: "Encontrarás el Catálogo en la barra de navegación: packs de platos que se desbloquean con Bites."
  },
  {
    id: "settings",
    route: null,
    target: "user-menu",
    placement: "bottom",
    title: "Tu perfil y ajustes",
    body: "Hogar, miembros, tema y preferencias que afectan a la planificación.",
    hint: "Abre tu menú y entra en «Configuración».",
    completionEvent: EV.SETTINGS_OPENED,
    fallbackBody: "En el menú de tu avatar (arriba a la derecha) está la Configuración de tu hogar."
  },
  {
    id: "finish",
    kind: "finish",
    route: null,
    target: null,
    title: "Listo. Ya sabes moverte por Lunchfy",
    body: "Tu siguiente paso recomendado:"
  }
];

// Steps counted in the "3/9" progress indicator (welcome + finish excluded),
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

export function resolveStepTarget(step, ctx = {}) {
  if (!step?.target) return null;
  if (typeof step.target === "function") return step.target(ctx);
  return `[data-tour-id="${step.target}"]`;
}

export function resolveStepBody(step, ctx = {}) {
  return typeof step.body === "function" ? step.body(ctx) : step.body;
}

export function stepCompletionEvents(step) {
  if (!step?.completionEvent) return [];
  return Array.isArray(step.completionEvent) ? step.completionEvent : [step.completionEvent];
}
