# AUTH_MIGRATION_PLAN

## Current Auth Architecture

### Frontend

- The Vite frontend stores a legacy JWT in `localStorage` or `sessionStorage` under `kitchen_token` in [frontend/src/kitchen/api.js](/C:/APPS/pilot-homefirst/frontend/src/kitchen/api.js).
- [frontend/src/kitchen/auth.jsx](/C:/APPS/pilot-homefirst/frontend/src/kitchen/auth.jsx) restores the session by calling `GET /api/kitchen/auth/me` when a token exists, exposes `login()` and `logout()`, and keeps the authenticated user in React context.
- [frontend/src/kitchen/RequireAuth.jsx](/C:/APPS/pilot-homefirst/frontend/src/kitchen/RequireAuth.jsx) protects routes by checking whether the React auth context has a user. Optional route-role checks currently use `user.role` from the backend response.
- Route protection is applied in [frontend/src/App.jsx](/C:/APPS/pilot-homefirst/frontend/src/App.jsx). The current login, signup, forgot-password, and reset-password pages remain in place.

### Backend

- Login, registration, invitation acceptance, forgot-password, reset-password, and `me` are implemented in [backend/src/kitchen/routes/auth.js](/C:/APPS/pilot-homefirst/backend/src/kitchen/routes/auth.js).
- Legacy authentication uses a custom JWT created by `createToken()` in [backend/src/kitchen/middleware.js](/C:/APPS/pilot-homefirst/backend/src/kitchen/middleware.js).
- Protected backend routes call `requireAuth`, which loads the Mongo user into `req.kitchenUser` and derives `req.user`.
- Role enforcement uses Mongo data only:
  - `requireRole()` and `requireDiod()` read `req.kitchenUser.role` and `req.kitchenUser.globalRole`.
- Household and tenant isolation use Mongo data only:
  - [backend/src/kitchen/householdScope.js](/C:/APPS/pilot-homefirst/backend/src/kitchen/householdScope.js) derives the effective household from the authenticated Mongo user.
  - Route filters across kitchen routes use `buildScopedFilter()` / `getEffectiveHouseholdId()`.
- Plan enforcement uses Mongo `Household` data only:
  - [backend/src/kitchen/subscriptionService.js](/C:/APPS/pilot-homefirst/backend/src/kitchen/subscriptionService.js) contains the feature gates.
  - Routes such as [backend/src/kitchen/routes/household.js](/C:/APPS/pilot-homefirst/backend/src/kitchen/routes/household.js), [backend/src/kitchen/routes/shopping.js](/C:/APPS/pilot-homefirst/backend/src/kitchen/routes/shopping.js), and [backend/src/kitchen/routes/weeks.js](/C:/APPS/pilot-homefirst/backend/src/kitchen/routes/weeks.js) read the household plan from Mongo before allowing premium behavior.

## Current Password Hashing Method

- Passwords are hashed with `bcryptjs.hash(password, 10)` in:
  - [backend/src/kitchen/routes/auth.js](/C:/APPS/pilot-homefirst/backend/src/kitchen/routes/auth.js)
  - [backend/src/users/index.js](/C:/APPS/pilot-homefirst/backend/src/users/index.js)
- Password verification uses `bcrypt.compare(...)` from `bcryptjs`.
- Reset-password also writes a new bcrypt hash in [backend/src/kitchen/routes/auth.js](/C:/APPS/pilot-homefirst/backend/src/kitchen/routes/auth.js).

## Target Architecture With Clerk

- Clerk manages identity and session authentication only.
- MongoDB remains the source of truth for:
  - role
  - plan
  - household / tenant linkage
  - profile and business data
  - feature access
- Frontend:
  - The app is wrapped with `ClerkProvider` in [frontend/src/main.jsx](/C:/APPS/pilot-homefirst/frontend/src/main.jsx) when `VITE_CLERK_PUBLISHABLE_KEY` is configured.
  - The existing auth provider remains active and can still use the legacy JWT flow.
  - If a Clerk session exists, frontend API calls can now send the Clerk bearer token instead of the legacy JWT.
- Backend:
  - `requireAuth` first tries the legacy JWT.
  - If legacy JWT auth fails, it verifies the Clerk token using `CLERK_SECRET_KEY`.
  - Clerk-authenticated requests are mapped back to a Mongo `KitchenUser` by normalized email.
  - If the Mongo user exists and `clerkId` is empty, the backend stores the Clerk user ID.
  - If the Mongo user exists and `clerkId` is already set, the backend verifies it matches.
  - If there is no mapped Mongo user, the request is rejected. No privileged Mongo user is auto-created.

## Required Environment Variables

### Frontend

- `VITE_CLERK_PUBLISHABLE_KEY`
- `VITE_API_URL`

### Backend

- `CLERK_SECRET_KEY`
- `CLERK_JWT_KEY`
  - Optional in functionality, recommended for networkless verification and more predictable backend behavior.
- `CLERK_AUTHORIZED_PARTIES`
  - Comma-separated allowed frontend origins, for example `http://localhost:5173`.
- Existing variables still required:
  - `MONGODB_URI`
  - `JWT_SECRET`
  - existing app/mail/push variables

## User Mapping Strategy

- Clerk identity is resolved from the verified Clerk session token.
- The backend fetches the Clerk user and reads the primary email address.
- The email is normalized to lowercase and matched against `KitchenUser.email`.
- `KitchenUser.clerkId` is the permanent link field.
- Mapping rules:
  - matched Mongo user + empty `clerkId`: attach `clerkId`
  - matched Mongo user + same `clerkId`: continue
  - matched Mongo user + different `clerkId`: reject
  - no matched Mongo user: reject unless an existing business flow explicitly creates a safe Mongo user

## Phased Rollout Plan

### Phase 0: Current Safe State

- Keep all legacy login, registration, invitations, JWT issuance, password reset, and protected routes unchanged.
- Deploy the optional Clerk-aware code with no Clerk keys set. This keeps runtime behavior on the old auth path.

### Phase 1: Development Wiring

- Create a Clerk application.
- Enable email/password in Clerk.
- Set:
  - `VITE_CLERK_PUBLISHABLE_KEY` in the frontend environment
  - `CLERK_SECRET_KEY` in the backend environment
  - `CLERK_JWT_KEY` in the backend environment
  - `CLERK_AUTHORIZED_PARTIES` to the frontend origin
- Verify that:
  - legacy login still works
  - Clerk-authenticated `GET /api/kitchen/auth/me` resolves the correct Mongo user
  - role, plan, and household isolation still come from Mongo

### Phase 2: Controlled Internal Migration

- Provision Clerk identities only for known internal or test users first.
- Let those users authenticate with Clerk while their Mongo records remain authoritative.
- Do not remove legacy login yet.
- Monitor:
  - missing email mappings
  - `clerkId` mismatches
  - any route returning a Mongo authorization error after a valid Clerk sign-in

### Phase 3: User Import / Trickle Migration

- Existing users can be migrated to Clerk by importing password digests because the app currently stores bcrypt hashes and Clerk supports imported password digests with `passwordHasher: "bcrypt"`.
- Even though direct hash migration is technically feasible, a staged rollout is still safer:
  - import a small cohort first
  - verify sign-in and Mongo mapping
  - then migrate the broader user base
- Keep password reset available as a fallback for any import anomalies.

### Phase 4: Production Cutover

- Add Clerk UI or a Clerk-backed sign-in path once internal validation is complete.
- Keep backend authorization unchanged.
- Only after stable operation:
  - deprecate legacy JWT issuance
  - deprecate old password-based login endpoints
  - eventually remove legacy auth code in a separate change

## Rollback Plan

- Remove or unset `VITE_CLERK_PUBLISHABLE_KEY` on the frontend to stop sending Clerk tokens.
- Remove or unset `CLERK_SECRET_KEY` on the backend to disable Clerk verification.
- Legacy JWT login remains available because it is still the first auth path in `requireAuth`.
- `clerkId` values can remain in Mongo without affecting legacy login.
- If a rollout issue appears, revert to legacy login only while keeping business data intact.

## Risks And Mitigations

- Risk: a valid Clerk identity maps to the wrong internal user by email.
  - Mitigation: normalized email lookup plus persisted `clerkId` consistency checks.
- Risk: auto-creating users could bypass household, role, or plan rules.
  - Mitigation: current implementation does not auto-create Mongo users for Clerk-authenticated requests.
- Risk: frontend authorization drift.
  - Mitigation: backend still loads the Mongo user and enforces authorization from Mongo data only.
- Risk: tenant leakage.
  - Mitigation: household scoping still uses `req.kitchenUser` and `householdScope.js`.
- Risk: deployment breakage from missing Clerk keys.
  - Mitigation: frontend Clerk wiring is conditional on `VITE_CLERK_PUBLISHABLE_KEY`; legacy auth remains intact without Clerk configuration.
- Risk: imported password hashes behave unexpectedly for some accounts.
  - Mitigation: test imports on a small sample first and keep password reset as fallback.

## Direct Migration Feasibility

- Direct migration of existing users into Clerk is technically possible based on the current codebase.
- Reason:
  - the application stores bcrypt password hashes using `bcryptjs.hash(password, 10)`
  - Clerk supports imported password digests with the `bcrypt` hasher
- This means a forced password reset is not inherently required for every user.
- Operationally, a gradual migration is still recommended before a broad production import.

## Manual Setup Still Required

- Clerk dashboard:
  - create the Clerk app
  - enable the desired sign-in methods
  - configure allowed origins / redirect URLs
  - obtain the publishable key, secret key, and JWT public key
- Frontend hosting:
  - set `VITE_CLERK_PUBLISHABLE_KEY`
- Backend hosting:
  - set `CLERK_SECRET_KEY`
  - set `CLERK_JWT_KEY`
  - set `CLERK_AUTHORIZED_PARTIES`
- Product decision still pending:
  - whether to keep the existing custom login pages during migration
  - or replace them later with Clerk UI/components after the backend mapping path is validated

## Tests

- No automated test infrastructure was present in this repository at inspection time.
- Because of that, no new automated tests were added in this change.
- Recommended first tests once test infrastructure exists:
  - Clerk-authenticated request resolves to the expected Mongo user
  - `requireRole` still enforces Mongo roles
  - paid-plan gates still read Mongo household plan
  - household-scoped routes still reject cross-household access
