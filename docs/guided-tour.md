# Guided Tutorial (tutorial guiado)

Coach-mark tutorial that teaches the core loop (planificar → lista → cocinar →
catálogo → configuración) by making the user perform every real action.

**PRODUCT RULE: the tutorial NEVER grants bites.** It only teaches where
things are. The challenge onboarding ("retos", onboardingEngine) is the single
reward system; the tutorial's finish screen hands the user off to it
("Abrir onboarding" → expands the challenge banner + opens its panel via
`requestOpenOnboardingPanel()`).

## How it triggers

- `initOnboarding()` (backend/src/kitchen/onboardingEngine.js) runs when a new
  household is created. If the global switch is ON it stores
  `guidedTour: { status: "pending" }` on the `HouseholdOnboarding` record.
- Tutorial state travels inside `GET /api/kitchen/onboarding/state` as
  `guidedTour` + `guidedTourEnabled`. `GuidedTourProvider`
  (frontend/src/kitchen/components/tour/) auto-launches on `pending`; `active`
  resumes at the persisted step index (refresh-safe).
- Households that predate the feature normalize to status `none` → never
  auto-launch. Global disable ⇒ no auto-launch for anyone.

## The flow (deterministic, Pollo al horno thread)

welcome → **nav-planning** (user taps Planificación; silently satisfied if
already there) → **plan-pollo** (user programs «Pollo al horno» via the dish
picker) → **plan-random** (user taps the dice) → **nav-shopping** (user taps
Lista) → **shopping-check** (user marks an item) → **nav-kitchen** (user taps
Mi Cocina) → **create-open / create-name / create-ingredient / create-save**
(user actually creates and SAVES a test dish — the flow cannot jump past
creation) → **recipe-open** (app scrolls to the Pollo al horno card and
highlights «Cocinar ahora»; user opens it) → **recipe-servings** →
**recipe-execute** → **recipe-step** → **recipe-timer** → **recipe-minimize**
→ **nav-catalog** → **catalog-explore** (info) → **menu-open** →
**settings-link** (highlights Configuración INSIDE the opened dropdown) →
finish.

Config: `frontend/src/kitchen/components/tour/guidedTourSteps.js`. Step model:
`{ id, kind, route, completeIfRoute, prepare, target, title, command,
completionEvent, matchesDetail, fallbackBody, skipIf, placement,
blockOutside }`.

- Copy discipline (pinned by tests): every step = 1 short title + ONE command
  ("Pulsa Lista."). No body paragraphs, no `why`, no bites mentions.
- Navigation steps have `route: null` — the USER taps the nav item; arrival on
  the page emits the completion event (`planning:opened`, `shopping:opened`,
  `kitchen:opened`, `catalog:opened`, `settings:opened`).
- `prepare` asks the current screen to expose the target: planning steps emit
  `TOUR_PREPARE.REVEAL_EMPTY_PLANNING_DAY` and WeekPage moves the mobile
  carousel to the first empty day.
- `matchesDetail` scopes entity steps: `plan-pollo` accepts the onboarding
  dish by id OR normalized name (degrades to any dish when unavailable);
  `recipe-open` only completes for the onboarding dish id.
- Creation gating: `kitchen:create_dish_opened` → `kitchen:dish_name_entered`
  → `kitchen:dish_ingredient_added` → `kitchen:dish_created` (emitted from
  DishModal on real input/save; create mode only).

## Onboarding recipe: "Pollo al horno"

- Backend `seedOnboardingRecipe()` (guidedTourService.js, runs at startup)
  upserts a MASTER-scope KitchenDish "Pollo al horno" (structured ingredients,
  4 steps, two timers) — visible in every household's Mi Cocina.
- Frontend lookup (`onboardingRecipe.js`, pure + unit-tested): normalized
  accent/case-insensitive contains-match, preferring timer variants; falls
  back to any timer recipe, then any complete recipe; missing preferred
  recipe is reported via telemetry (`lastMissingTarget`) as a data issue.

## Coach bubble & overlay

- `bubblePosition.js` (pure, unit-tested): picks top/bottom/left/right,
  REJECTS placements that overlap the target, honors keep-out insets (header
  74px, mobile bottom nav 84px), clamps inside the viewport, reports
  `covered` when overlap is unavoidable.
- Mobile: sides disabled (<640px); when `covered`, the overlay switches to a
  slim bottom **coach bar** above the bottom nav — the target stays fully
  visible and tappable. Recomputed on scroll/resize/orientation/route/modal.
- `blockOutside` (default true on single-tap action steps): four transparent
  strips around the spotlight swallow background clicks while the target and
  scrolling keep working. False on multi-stage steps (dish picker, typing,
  the user-menu dropdown — fixes the "can't click Configuración" bug).
- Missing target → small fallback panel (top third) with a one-line
  `fallbackBody` + "Omitir paso". Never crashes, always reports telemetry.

## Telemetry

`guidedTour` persists `currentStepId` + `stepStartedAt`, `completedStepIds`,
`skippedStepIds` (per-step "Omitir"), `stalledStepId` (set when the user
skips the whole tutorial) and `lastMissingTarget`. All visible in the DIOD
household control center.

## DIOD admin

- **Global switch**: Admin → Onboarding → "Tour guiado" card
  (`GET/PUT /api/kitchen/onboarding/admin/guided-tour/config`).
- **Per household**: control center → Onboarding card (status, current step,
  steps done/skipped, stall step, missing-target report, dates, "Reenviar
  tutorial") or the Onboarding section table. Resend sets `pending` + resets
  telemetry; it never touches bites, challenge state or rewards (the tutorial
  has none).

## Tests

`cd backend && node --test src/kitchen/guidedTourService.test.js` — 28 tests:
the no-bites rule (no step rewards, no reward whitelist), deterministic flow
order, user-driven navigation, creation gating, Pollo al horno matching +
lookup + FE/BE normalization parity, copy discipline (command length, no
essays), and bubble placement (never covers target, covered→coach-bar flag,
insets, clamping, mobile no-overflow). Frontend gate:
`cd frontend && npm run build`.
