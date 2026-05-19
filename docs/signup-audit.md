# Signup Flow — Technical Audit

**Date:** 2026-05-19  
**Branch:** dev  
**Auditor:** Claude Code (automated + manual read)  
**Status:** Findings documented. Two P1 fixes applied inline.

---

## 1. Files Involved

| File | Role |
|------|------|
| `frontend/src/main.jsx` | ClerkProvider mount, env var wiring |
| `frontend/src/App.jsx` | Router, route definitions, HomeRedirect |
| `frontend/src/kitchen/auth.jsx` | AuthProvider, ClerkEnabledAuthProvider, useAuth hook, /me bootstrap |
| `frontend/src/kitchen/RequireAuth.jsx` | Route guard |
| `frontend/src/kitchen/authRedirect.js` | Post-auth return-URL helpers |
| `frontend/src/kitchen/clerk-shared.js` | Clerk constants (paths, sessionStorage keys) |
| `frontend/src/kitchen/pages/ClerkAuthPage.jsx` | Sign-in / sign-up widgets, post-auth handoff |
| `frontend/src/kitchen/pages/ClerkOnboardingPage.jsx` | 3-step onboarding (household, profile, preferences) |
| `frontend/src/kitchen/pages/InviteLandingPage.jsx` | Invite acceptance for already-authenticated users |
| `frontend/src/kitchen/api.js` | apiRequest with Clerk bearer token injection |
| `backend/src/kitchen/routes/auth.js` | All backend auth endpoints including POST /clerk/onboarding |
| `backend/src/kitchen/routes/household.js` | Invitation validate + accept endpoints |
| `backend/src/kitchen/clerkAuth.js` | Clerk token verification, Clerk user resolution |
| `backend/src/kitchen/invitationService.js` | Token generation, atomic claim |
| `backend/src/kitchen/models/KitchenUser.js` | User schema |
| `backend/src/kitchen/models/Household.js` | Household schema |
| `backend/src/kitchen/models/Invitation.js` | Invitation schema |

---

## 2. Current Flow Map

### 2a. Generic signup (new user, no invite)

```
/signup  →  ClerkAuthPage (mode="sign-up")
             │  Clerk <SignUp> widget handles: email, password, verification
             │  On success → forceRedirectUrl = /onboarding/clerk
             ▼
/onboarding/clerk  →  ClerkOnboardingPage
             │
             ├─ Phase 1 (Household)
             │    Choose: create OR join
             │    create → shows hint "empezarás con Basic"
             │    join   → 6-digit code → validate → confirm household name
             │
             ├─ Phase 2 (Profile)
             │    Enter display name (auto-filled from Clerk fullName)
             │
             └─ Phase 3 (Preferences)
                  Household prefs (if create): name, dinners, avoid-repeats
                  Personal prefs: active, canCook, dinnerActive, dinnerCanCook
                  Submit → POST /api/kitchen/auth/clerk/onboarding
                  On success → setUser + navigate /kitchen/semana
```

**Plan during signup:** hardcoded to `"basic"` (frontend constant + backend validation). No Pro/Premium option exists at this stage. Upgrade happens post-signup via `/kitchen/upgrade`.

### 2b. Invite signup (new user with token link)

```
/auth/clerk/sign-up?inviteToken={token}
             │  ClerkAuthPage reads inviteToken from URL
             │  Stores token in sessionStorage
             │  Fetches invite details → shows "Te han invitado a {name}"
             │  Clerk <SignUp> widget → email/password/verify
             │  On success → /onboarding/clerk (with token in sessionStorage)
             ▼
/onboarding/clerk
             │  Reads inviteToken from sessionStorage
             │  Fetches invite details again → shows household name
             │  householdMode auto-set to "join"
             │  Phase 1 shows invite banner, skip household choice
             │  Phase 2: display name
             │  Phase 3: personal preferences only (no household prefs)
             │  Submit → POST /api/kitchen/auth/clerk/onboarding { inviteToken }
             │  Backend: validates token, adds user to household
             └─ navigate /kitchen/semana
```

**Note:** Invited user still sees Phase 1 UI but the household is pre-resolved from the invite. The "Continuar" button becomes enabled as soon as invite details load (no manual selection needed).

### 2c. Invite for existing authenticated user

```
/invite/:token  →  InviteLandingPage (requires RequireAuth)
             │  If not authenticated → /login?next=/invite/{token}
             │  If authenticated:
             │    GET /api/kitchen/household/invitations/{token}/validate
             │    Shows household name, expiry, role
             │    Button "Unirme al hogar" → POST .../accept
             │    On success → "Acceso concedido" + "Ir a mi semana"
             └─ No onboarding needed (user already exists)
```

### 2d. Post-signin redirect (returning user)

```
/login  →  ClerkAuthPage (mode="sign-in")
             │  Clerk <SignIn> widget → forceRedirectUrl = /auth/clerk/complete
             ▼
/auth/clerk/complete  →  ClerkAuthPage (mode="complete")
             │  isLoaded && isSignedIn → calls auth.jsx refreshUser
             │  If onboardingRequired → /onboarding/clerk
             │  If user.id → /kitchen/semana
             └─ If error after 1200ms → show Reintentar / Cambiar cuenta
```

---

## 3. Clerk Calls Audit

| Call | File:Line | Context | Double-fire Risk |
|------|-----------|---------|-----------------|
| `useClerkAuth()` | auth.jsx:253 | Provider setup | None — read-only |
| `useClerk()` | auth.jsx:254 | Provider setup | None |
| `useClerk()` | ClerkAuthPage.jsx:81 | Component state | None — reads instance |
| `useUser()` | ClerkOnboardingPage.jsx:113 | Component state | None — read-only |
| `clerk.signOut()` | auth.jsx:209 | logout() fn | Low — no disabled guard; double signOut is harmless |
| `clerk.signOut()` | ClerkAuthPage.jsx:209 | signOut() fn | **FIXED** — button now disabled while running |
| `clerk.redirectToSignIn()` | ClerkOnboardingPage.jsx:176 | useEffect | Safe — deps: [clerkIsLoaded, isSignedIn, clerk] |
| `<SignUp>` component | ClerkAuthPage.jsx:317 | Render | None — Clerk handles internally |
| `<SignIn>` component | ClerkAuthPage.jsx:325 | Render | None — Clerk handles internally |

**Key finding:** No custom `signUp.create()`, `prepareEmailAddressVerification()`, or `attemptEmailAddressVerification()` calls anywhere. Email verification is fully delegated to Clerk's hosted `<SignUp>` widget — this is correct and eliminates the entire class of duplicate-verification bugs.

---

## 4. Duplicate-Call Risks

### Final onboarding submit (ClerkOnboardingPage.jsx:323–361)

**Protection:** triple-guarded:
1. `finalStartedRef.current` — ref flag, never reset to true after first submit
2. `loading` state — prevents re-entry while async in flight
3. `disabled={!canSubmitFinal || loading}` on submit button

Only resets `finalStartedRef.current = false` on error (line 357) to allow retry. **SAFE.**

### Household code validation (ClerkOnboardingPage.jsx:262–282)

Button disabled when `codeValidating || normalizedInviteCode.length !== 6`. **SAFE.**

### /me bootstrap (auth.jsx:163)

Uses `globalClerkBootstrapInFlight` promise dedup — concurrent calls share the same in-flight request. **SAFE.**

### InviteLandingPage accept (line 89–111)

Button has `disabled={submitting}`. Weak (state-only, no ref) but adequate because this is
a non-critical secondary flow for already-authenticated users. **ACCEPTABLE.**

### ClerkAuthPage Reintentar / Cambiar cuenta (lines 268–274)

Previously: no disabled state. **FIXED in this audit** — see Section 10.

---

## 5. Route Guard Audit

| Scenario | Result |
|----------|--------|
| Unauthenticated → /kitchen/* | RequireAuth → /login?next=... ✓ |
| Clerk signed in, no backend user, /me pending | RequireAuth shows loading screen ✓ |
| Clerk signed in, /me error | RequireAuth → /auth/clerk/complete ✓ |
| onboardingRequired → any RequireAuth page | → /onboarding/clerk ✓ |
| Fully onboarded → / | HomeRedirect → /kitchen/semana ✓ |
| onboardingRequired → / | HomeRedirect → /onboarding/clerk ✓ |
| Not authenticated → / | HomeRedirect → /login ✓ |
| Wrong role → /admin | RequireAuth → /kitchen/semana ✓ |

**No redirect loops found.** The `onboardingRequired` state in auth.jsx is set from `/me` response and cleared after `submitFinal` calls `setOnboardingRequired(false)`.

**One edge case:** `/onboarding/clerk` has no `RequireAuth` wrapper — it handles its own Clerk check and redirects to sign-in if not signed in. This is intentional (avoids RequireAuth creating a circular dependency during fresh sign-up).

---

## 6. Invite Flow Audit

### Token lifecycle
- Generated as 64-char hex (`crypto.randomBytes(32)`), stored as SHA-256 hash in DB
- TTL: 7 days default
- Two link types: `/invite/{token}` (auth users) and `/auth/clerk/sign-up?inviteToken={token}` (new users)

### New-user invite path
- Token stored in `sessionStorage` on ClerkAuthPage, read back by ClerkOnboardingPage
- `householdMode` auto-set to `"join"` when token present
- Phase 1 shows invite banner; `canContinueHousehold` resolves from `inviteDetails?.householdName`
- Backend validates token, checks email match if `recipientEmail` set, checks user limits

### Invalid / expired token handling
- Frontend: `fetchInviteDetails()` returns null → `inviteInvalid = true` → error shown in Phase 1
- Backend: 400 `INVITATION_INVALID` or 403 `INVITATION_EMAIL_MISMATCH`
- No loop — user can recover by choosing "Crear un hogar nuevo" or entering a code

### Does invited user bypass household selection?
**Partially yes:** `householdMode` is auto-set to `"join"` and the household name shown in Phase 1 banner. But user must still click "Continuar" to proceed. No plan selection shown. No household preferences shown (only in create mode). **Correct behavior.**

### Atomic claim
`atomicClaimInvitation` uses `findOneAndUpdate` with status+usedAt conditions — prevents double-acceptance. **SAFE.**

---

## 7. Payment / Plan Audit

### Current state
- All new households are created with `subscriptionPlan: "basic"` (hardcoded frontend + enforced backend)
- Backend rejects any non-basic plan with 400 `SUBSCRIPTION_PLAN_INVALID`
- No Stripe checkpoint during onboarding
- Upgrade flow exists post-signup at `/kitchen/upgrade` (UpgradeToProPage)

### Plan naming consistency
| Context | Names used |
|---------|-----------|
| DB enum | `"free"`, `"basic"`, `"pro"`, `"premium"` |
| Onboarding UI | "Basic" (displayed), `"basic"` (sent to backend) |
| Upgrade page | "Pro", "Premium" |
| Admin panel | "basic", "pro", "premium" |
| subscription.js | `"basic"`, `"pro"`, `"premium"` feature checks |

**Consistent.** No naming mismatch.

### Payment-before-household creation: not implemented
The architecture currently does not support selecting Pro/Premium during onboarding. The upgrade path is entirely post-signup. See Section 9 for the proposed implementation plan.

---

## 8. Backend Idempotency

| Endpoint | Guard |
|----------|-------|
| POST /clerk/onboarding | Finds user by email first; unique index on email catches duplicates; household creation wrapped in try/catch that rolls back user on error |
| POST /household/invitations/:token/accept | Checks `usedAt` + `status = "active"`; `findOneAndUpdate` prevents double-accept |
| GET /auth/resolve-household/:code | Read-only |
| POST /payments/checkout-session | Not in signup flow |
| POST /payments/webhook | `StripeWebhookEvent` dedup with unique index on eventId |

**One weakness:** if `user.save()` fails after `household.create()` succeeds (auth.js line 819), the household is orphaned. This is an edge case with no rollback. The probability is very low (network failure mid-request), and a re-submit would fail with 409 `DUPLICATE_USER` or similar because the user already exists in Clerk. Acceptable risk for now, noted for future hardening.

---

## 9. Plan/Payment Before Household Creation — Proposed Implementation

### Goal
Allow user to select Basic / Pro / Premium during onboarding. Pro/Premium require Stripe payment before household is created.

### Recommended approach (safe, phased)

**Phase A — Plan selection UI (no payment yet)**
- Add step between "Household" and "Profile" showing three plan cards
- Basic: immediate continue
- Pro / Premium: show "Próximamente" badge, disabled
- `selectedPlan` stored in form state, passed to backend
- Backend already accepts any plan from `normalizeSubscriptionPlan` — just remove the `basic`-only guard

**Phase B — Payment integration**
- After user picks Pro/Premium and completes Profile+Preferences, pause before final submit
- Create a Stripe Checkout session with metadata: `{ clerkId, selectedPlan, householdName, ... }`
- Redirect to Stripe Checkout
- On success: Stripe calls `/api/payments/webhook`; frontend polls or listens for confirmation; then re-submit onboarding with `selectedPlan` and a `stripeSessionId`
- Backend verifies payment success before creating household with paid plan
- On cancel: user returns to plan selection, no household created, no orphan data

**Key constraints:**
- Do NOT create household before payment confirmed
- Use Stripe `metadata` to carry onboarding state across the Checkout redirect
- Make the `/clerk/onboarding` endpoint accept `stripeSessionId` as optional verification
- Invitation flow never shows plan selection (always joins existing household)

**Current code readiness:** Stripe client, webhook handling, `StripeWebhookEvent` dedup, and plan fields on Household are all in place. The only missing pieces are: plan-card UI in onboarding, a "pause before submit" gate, and backend verification of `stripeSessionId` before household creation.

---

## 10. Issues by Priority

### P0 — Critical (blocking / data-loss risk)
*None found.*

---

### P1 — Important (bugs / UX broken)

#### P1-A: English error string in InviteLandingPage ✅ FIXED
**File:** `frontend/src/kitchen/pages/InviteLandingPage.jsx:104`  
**Was:** `"You have reached the user limit for your current license."`  
**Fixed to:** `"Has alcanzado el límite de usuarios de tu plan actual."`

#### P1-B: No disabled state on Reintentar / Cambiar cuenta buttons ✅ FIXED
**File:** `frontend/src/kitchen/pages/ClerkAuthPage.jsx:268–274`  
**Issue:** While `retryBootstrap()` or `signOut()` runs, both buttons were clickable — could fire multiple concurrent `/me` calls or signOut requests.  
**Fix:** Added `retryLoading` and `signingOut` states; buttons disabled while either is running.

---

### P2 — Polish

#### P2-A: Orphaned household edge case (backend)
`auth.js:819` — if `user.save()` fails after `Household.create()`, household is orphaned. Low probability, no immediate fix needed. Add compensating transaction in a future hardening pass.

#### P2-B: Onboarding Phase 1 shows household choice even for invite flow
Invited user sees the create/join cards briefly before the invite details load, then the form resolves to "join" mode. Consider rendering only the invite banner in Phase 1 when `isInviteFlow && !inviteLoaded` to avoid the flash of the choice UI.

#### P2-C: Stepper does not skip/grey out step 1 visually for invite flow
`skipHousehold` prop is passed to `StepIndicator` but hardcoded as `false` at line 398. Invite users could have step 1 shown as greyed/completed since they skip household selection.

#### P2-D: "Ya tengo cuenta" link in onboarding footer navigates to `/login` without return-to
`ClerkOnboardingPage.jsx:633` — `navigate(LOGIN_PATH)` drops the `next` param. User who navigated directly to `/onboarding/clerk` by mistake and already has a household will end up at `/login` with no redirect target. Minor inconvenience.

#### P2-E: ClerkProvider renders App without Clerk when key is missing
`main.jsx:26` — if `VITE_CLERK_PUBLISHABLE_KEY` is unset, `<App />` renders without `ClerkProvider`. All Clerk hooks will return empty/null. This is intentional for local dev without Clerk, but should be clearly documented in `.env.example`.

#### P2-F: TODO comment in main.jsx
`main.jsx:20–23` — `TODO: Configure Clerk application URLs...` — should be resolved before production deploy.

---

## 11. What Was NOT Found (Good)

- No `signUp.create()`, `prepareEmailAddressVerification()`, or `attemptEmailAddressVerification()` custom calls
- No React StrictMode wrapping ClerkProvider
- No infinite redirect loops in route guards
- No duplicate onboarding submit (ref + state + button disabled)
- No Stripe calls during onboarding (clean separation)
- No legacy auth mixed into Clerk flow unexpectedly
- No CAPTCHA or ticket/invite handling needed beyond current token flow
