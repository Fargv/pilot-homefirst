/**
 * guidedTourSteps.js
 *
 * Declarative config for the guided welcome tour. Each step:
 *   id          – stable id (analytics + resume)
 *   route       – route to be on before showing (null = stay where you are)
 *   target      – data-tour-id of the highlighted element (null = centered card)
 *   kind        – "welcome" | "finish" | undefined (normal tooltip step)
 *   title/body  – short Spanish copy (action-oriented)
 *   fallbackBody– copy used when the target can't be found (empty data, plan gates…)
 *   placement   – preferred tooltip side on desktop ("top" | "bottom")
 *   interactive – true → the highlighted control stays clickable (no click blocker)
 *   rewardStep  – server-side reward key granted when ADVANCING from this step.
 *                 Must exist in backend TOUR_STEP_REWARDS; anything else grants 0.
 *
 * Targets are matched via [data-tour-id="…"] attributes placed on stable UI
 * anchors (BottomNav, page containers, primary CTAs) — never fragile selectors.
 */

export const TOUR_VERSION = 1;

export const TOUR_STEPS = [
  {
    id: "welcome",
    kind: "welcome",
    route: "/kitchen/semana",
    target: null,
    title: "¡Bienvenido a Lunchfy!",
    body: "En 2 minutos aprenderás lo esencial:",
    bullets: [
      { icon: "📅", text: "Planifica tu semana de comidas" },
      { icon: "🛒", text: "Tu lista de la compra se crea sola" },
      { icon: "🍳", text: "Cocina recetas paso a paso" },
      { icon: "🍪", text: "Gana Bites usando la app" }
    ]
  },
  {
    id: "planning-overview",
    route: "/kitchen/semana",
    target: "planning-week",
    placement: "bottom",
    title: "Tu semana, de un vistazo",
    body: "Esta es tu planificación semanal. Cada día tiene su comida: asigna platos y Lunchfy se encarga del resto.",
    fallbackBody: "La pantalla Planificación muestra tu semana. Asigna un plato a cada día y Lunchfy se encarga del resto."
  },
  {
    id: "planning-choose",
    route: "/kitchen/semana",
    target: "planning-add-dish",
    placement: "bottom",
    interactive: true,
    title: "Elige un plato para un día",
    body: "Toca «+ Añadir plato» para asignar una comida a este día. Puedes probarlo ahora o seguir con el tour.",
    fallbackBody: "En cada día verás «+ Añadir plato» para asignar una comida. Los días ya completos muestran su plato."
  },
  {
    id: "planning-random",
    route: "/kitchen/semana",
    target: "planning-randomize",
    placement: "bottom",
    title: "¿Sin ideas? Randomiza",
    body: "El dado elige un plato por ti. Cada plato que planificas alimenta automáticamente tu lista de la compra.",
    fallbackBody: "Con el dado de cada día, Lunchfy elige un plato por ti. Todo lo planificado alimenta tu lista de la compra.",
    rewardStep: "planning",
    rewardCopy: "por aprender a planificar"
  },
  {
    id: "shopping-list",
    route: "/kitchen/compra",
    target: "shopping-list",
    placement: "top",
    title: "Tu lista se crea sola",
    body: "Aquí aparecen los ingredientes de los platos que planificas. Sin escribir nada a mano.",
    fallbackBody: "La Lista de la compra se genera con los ingredientes de tus platos planificados. Sin escribir nada a mano."
  },
  {
    id: "shopping-check",
    route: "/kitchen/compra",
    target: "shopping-item",
    placement: "bottom",
    interactive: true,
    title: "Marca lo comprado",
    body: "Toca el círculo cuando compres algo: pasará a la sección de comprados. Así sabes siempre qué te falta.",
    fallbackBody: "Cuando la lista tenga productos, toca el círculo de cada uno al comprarlo: pasará a la sección de comprados.",
    rewardStep: "shopping",
    rewardCopy: "por aprender a usar la lista"
  },
  {
    id: "kitchen",
    route: "/kitchen/platos",
    target: "kitchen-create",
    placement: "bottom",
    title: "Mi Cocina: tus platos y productos",
    body: "Con el botón + creas tus propios platos y productos. Un plato con ingredientes genera su compra automáticamente.",
    fallbackBody: "En Mi Cocina creas tus propios platos y productos. Un plato con ingredientes genera su compra automáticamente.",
    rewardStep: "kitchen",
    rewardCopy: "por descubrir Mi Cocina"
  },
  {
    id: "recipe",
    route: "/kitchen/platos",
    target: null,
    dynamicRecipe: true,
    title: "Cocina paso a paso",
    body: "Los platos con receta tienen modo cocina guiada: pasos, ingredientes por paso y temporizadores (¡varios a la vez!). Ajusta las raciones y pulsa «Cocinar».",
    rewardStep: "recipe",
    rewardCopy: "por aprender el modo cocina"
  },
  {
    id: "catalog",
    route: "/kitchen/catalogo",
    target: "catalog-wallet",
    placement: "bottom",
    title: "Bites: tu recompensa por usar Lunchfy",
    body: "Ganas Bites con acciones útiles (planificar, comprar, crear platos…) y los gastas aquí: packs de platos listos para instalar.",
    fallbackBody: "En el Catálogo hay packs de platos listos para instalar. Se desbloquean con Bites, que ganas usando la app.",
    rewardStep: "catalog",
    rewardCopy: "por descubrir el catálogo"
  },
  {
    id: "settings",
    route: null,
    target: "user-menu",
    placement: "bottom",
    title: "Tu perfil y ajustes",
    body: "Desde aquí configuras tu hogar, tema, miembros y preferencias que afectan a la planificación y la compra.",
    fallbackBody: "En el menú de tu avatar (arriba a la derecha) configuras tu hogar, tema, miembros y preferencias."
  },
  {
    id: "finish",
    kind: "finish",
    route: null,
    target: null,
    title: "¡Listo para empezar!",
    body: "Ya conoces lo esencial. Tu primer paso recomendado:"
  }
];

// Steps shown in the "3/8" progress indicator (welcome + finish excluded).
export const PROGRESS_STEPS = TOUR_STEPS.filter((s) => !s.kind);

export function progressLabelFor(index) {
  const step = TOUR_STEPS[index];
  if (!step || step.kind) return null;
  return `${PROGRESS_STEPS.indexOf(step) + 1}/${PROGRESS_STEPS.length}`;
}
