# Guided Onboarding (tour interactivo)

Interactive coach that teaches the core loop (planificar → lista → cocinar →
bites/catálogo) by making the user PERFORM the real actions — not a modal
slideshow. Spotlight + compact anchored speech bubble ("coach bubble") that
points at the exact UI element.

## How it triggers

- `initOnboarding()` (backend/src/kitchen/onboardingEngine.js) runs when a new
  household is created (routes/auth.js). If the global switch is ON it stores
  `guidedTour: { status: "pending" }` on the `HouseholdOnboarding` record.
- Tour state travels inside `GET /api/kitchen/onboarding/state` as
  `guidedTour` + `guidedTourEnabled`.
- `GuidedTourProvider` (frontend/src/kitchen/components/tour/) auto-launches
  when: user authenticated + on a `/kitchen/*` route + `guidedTourEnabled` +
  status `pending`. Status `active` resumes at the persisted
  `currentStepIndex` (refresh mid-tour is safe).
- Households that predate the feature have no `guidedTour` subdoc → normalized
  to status `none` → never auto-launch.

## Interactive step model

Steps live in `frontend/src/kitchen/components/tour/guidedTourSteps.js`:
`{ id, route, target, title, body, hint, why, completionEvent, rewardStep,
fallbackBody, skipIf, placement }`.

- **Action steps** declare `completionEvent` (one or more). They have NO
  "Siguiente" button — the only way forward is performing the action in the
  real UI ("Omitir paso" is the unrewarded escape hatch). The provider listens
  to the event bus and advances (with a ✓ success flash) when the event fires.
- **Info steps** (welcome, finish, recipe explanation fallback) have
  "Siguiente" and never carry rewards (pinned by tests).
- **Navigation-as-action** steps (catalog, settings) have `route: null` and
  highlight the nav item / user menu — the user must tap it; arrival on the
  page emits the completion event.
- `skipIf(ctx)` drops steps at runtime: the whole recipe block skips when no
  suitable recipe exists (`recipe-open` stays as a short explanation); the
  timer step also skips when the chosen recipe has no timers.
- Demo recipe: auto-picked from `/api/kitchen/dishes` — prefers steps + timer
  + ingredients, falls back to steps + ingredients (guidedTourService.js
  `findDemoRecipeApi`). Its dish card is targeted via `[data-dish-id="…"]`.

## Event bus

`guidedOnboardingEvents.js` — window CustomEvent channel
(`lunchfy:onboarding-action`). App code emits at REAL success points:

| Event | Emitted from |
|---|---|
| planning:dish_selected / planning:day_randomized | WeekPage `updateDay` success (`options.source === "random"` distinguishes) + week randomize |
| shopping:item_marked_bought | ShoppingPage `setItemStatus` purchased success |
| kitchen:create_dish_opened | DishesPage `startCreate` / `startIngredientCreate` |
| recipe:opened / servings_changed / executor_started | RecipeModal |
| recipe:step_next / executor_minimized | CookingSessionStepper |
| recipe:timer_started | RecipeTimer `handleStart` |
| catalog:opened / settings:opened | page mount effects |

Emissions are unconditional (cheap no-op when no tour runs); the provider is
the only listener.

## Coach bubble placement

`bubblePosition.js` (pure, unit-tested): picks top/bottom/left/right from the
step's preferred side, flips when there is no room, clamps fully inside the
viewport (never cut off on desktop, never bottom-pinned, no horizontal
overflow on mobile — sides disabled under 640px), and returns the arrow
position so it keeps pointing at the target after clamping. Targets are
scrolled to center before showing. No valid target → small floating mini-panel
(top third) with `fallbackBody` + "Omitir paso".

## Bites rewards (actions only, anti-farming)

- Whitelist in `backend/src/kitchen/guidedTourService.js`
  (`TOUR_STEP_REWARDS`): `plan_dish`, `randomize_day`, `mark_bought`,
  `create_dish_opened`, `recipe_servings`, `recipe_execution`, `recipe_timer`
  (+5 each) and `finish` (+10). Opening modals, reading explanations and
  pressing "Siguiente" grant NOTHING — the client only sends a `stepId` when
  the completion event fired, and tests pin that rewards exist only on steps
  with `completionEvent`.
- The `finish` bonus pays only when ≥3 real actions were rewarded
  (`FINISH_REWARD_MIN_ACTIONS`) — skipping every step earns nothing.
- Grants go through the same path as challenge rewards
  (`grantOnboardingBites` → `BitesTransaction`, source `guided_tour`).
- `rewardedSteps` persists forever, **including across admin resends** — each
  key pays once per household. "Reenviar (test)" sets `testMode`: no grants.
- Floating bites pill stays visible during the whole tour: wallet total +
  "+X en el tour" + count-up/burst only on real awards.

## Merge with challenge onboarding

One coherent flow, two layers: the tour is the interactive delivery, the
existing challenge system stays the server-verified reward ledger. Guided
actions fire the SAME app handlers, so `plan_meal`, `mark_purchased`,
`visit_*` etc. progress challenges simultaneously (separate reward sources,
each with its own dedupe — nothing double-grants). The "Guía de inicio"
banner hides while the tour is active and takes over afterwards as the
follow-up task list. Weekly challenges untouched.

## DIOD admin

- **Global switch**: Admin → Onboarding section → "Tour guiado" card
  (`GET/PUT /api/kitchen/onboarding/admin/guided-tour/config`, model
  `GuidedTourConfig`). Disabled ⇒ no auto-launch for anyone; new households
  are created without a pending tour.
- **Per household**: control center → Onboarding card (status, sent/completed
  dates, "Reenviar tour" / "Reenviar (test)") or the Onboarding section table
  (Tour column + actions). Resend sets `pending` + `lastSentAt`; the user sees
  it on next app load. Default replay = no duplicate rewards (rewardedSteps
  persists); test mode = no rewards at all.

## Tests

`cd backend && node --test src/kitchen/guidedTourService.test.js` — 18 tests:
normalization, action-only reward contract (frontend steps ↔ backend
whitelist), step structure (user-navigated steps, skipIf behavior, hints +
fallbacks), and bubble placement (flip near bottom, full viewport clamping,
mobile no-overflow, arrow bounds). Frontend quality gate:
`cd frontend && npm run build`.
