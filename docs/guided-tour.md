# Guided Tour (tour de bienvenida)

Interactive spotlight walkthrough that teaches new users the core loop
(planificar → lista → cocinar → bites/catálogo) in ~2 minutes.

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

## Status model (`HouseholdOnboarding.guidedTour`)

`none | pending | active | completed | skipped` plus `version`,
`currentStepIndex`, `rewardedSteps[]`, `totalTourBites`, `lastSentAt`,
`startedAt`, `completedAt`, `skippedAt`, `testMode`.

User endpoints: `POST /api/kitchen/onboarding/guided-tour/{start,progress,complete,skip}`.

## Steps config

`frontend/src/kitchen/components/tour/guidedTourSteps.js` — declarative list
(route, `data-tour-id` target, Spanish copy, fallback copy, reward key).
Targets are `data-tour-id` attributes on stable anchors (BottomNav links,
user chip, `planning-week`, `planning-add-dish`, `planning-randomize`,
`shopping-list`, `shopping-item`, `kitchen-create`, `catalog-wallet`).
Missing targets: the provider polls ~4s, then shows a centered card with
`fallbackBody` — the tour never crashes or blocks on absent UI.

## Bites rewards (anti-farming)

- Step rewards are whitelisted server-side in
  `backend/src/kitchen/guidedTourService.js` (`TOUR_STEP_REWARDS`, +5 each:
  planning, shopping, kitchen, recipe, catalog, finish = 30 max).
- Grants go through the same path as challenge rewards
  (`grantOnboardingBites` → `BitesTransaction`, source `guided_tour`).
- `rewardedSteps` persists forever, **including across admin resends** — each
  key pays out once per household, so replaying the tour grants nothing.
- Admin "resend (test)" sets `testMode: true`: tour runs, no grants at all.
- Existing challenge onboarding keeps working: tour navigation fires the
  `visit_*` triggers, so `explore_app` usually completes during the tour. The
  challenge banner ("Guía de inicio") is hidden while the tour is active and
  returns afterwards as the follow-up learning path.

## DIOD admin

- **Global switch**: Admin → Onboarding section → "Tour guiado" card
  (`GET/PUT /api/kitchen/onboarding/admin/guided-tour/config`, model
  `GuidedTourConfig`, singleton key `default`). Disabled ⇒ no auto-launch for
  anyone, and new households are created without a pending tour.
- **Per household**: household control center → Onboarding card → "Tour
  guiado" block (status, last sent/completed, resend / resend-test), or the
  "Estado por hogar" table in the Onboarding section (Tour column + actions).
  Resend: `POST /api/kitchen/onboarding/admin/households/:id/guided-tour/resend`
  `{ testMode? }` → sets `pending`, updates `lastSentAt`; user sees it on next
  app load (state is fetched once per session).

## Tests

`cd backend && node --test src/kitchen/guidedTourService.test.js` — pins the
legacy-doc normalization, the reward whitelist contract between frontend steps
and backend rewards, and tour structure invariants. DB-backed transitions are
verified manually (no Mongo test harness in this repo); frontend quality gate
is `cd frontend && npm run build`.
