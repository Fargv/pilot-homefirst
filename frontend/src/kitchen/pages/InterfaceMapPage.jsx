import React, { useEffect, useMemo, useRef, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import {
  AlertTriangle,
  ArrowLeft,
  Bot,
  Check,
  Copy,
  Database,
  ExternalLink,
  Home,
  Layers,
  Lock,
  Map,
  Route,
  Search,
  Shield,
  Workflow,
} from "lucide-react";
import { hasLegacyToken } from "../api.js";
import { useAuth } from "../auth.jsx";
import "./InterfaceMapPage.css";

const REVIEWED_AT = "2026-07-02";
const GRAPHIFY_COMMIT = "ab163946";
const CURRENT_COMMIT = "484dfa1";

const navSections = [
  { id: "overview", label: "Overview", icon: Map },
  { id: "routes", label: "Routes", icon: Route },
  { id: "modules", label: "Modules", icon: Layers },
  { id: "flows", label: "User flows", icon: Workflow },
  { id: "entities", label: "Data/entities", icon: Database },
  { id: "actions", label: "Actions", icon: Check },
  { id: "modals", label: "Modals", icon: ExternalLink },
  { id: "fragile", label: "Known fragile areas", icon: AlertTriangle },
  { id: "ai-notes", label: "AI instruction notes", icon: Bot },
];

const mentalModel = [
  {
    title: "Public entry",
    tone: "blue",
    items: ["Landing", "Clerk sign in/sign up", "Invite landing", "Legal pages"],
    connects: ["Onboarding", "App shell"],
  },
  {
    title: "Onboarding",
    tone: "green",
    items: ["Household creation or invite", "Beta token validation", "Consent gate", "First planning prompt"],
    connects: ["Planificacion", "Weekly challenges"],
  },
  {
    title: "App shell",
    tone: "purple",
    items: ["Header", "BottomNav", "Theme sync", "Onboarding and challenge banners"],
    connects: ["Planificacion", "Lista", "Mi Cocina", "Catalogo", "Configuracion"],
  },
  {
    title: "Planificacion",
    tone: "orange",
    items: ["Week plan", "Day/meal slots", "Randomizer", "Attendees/cook", "Leftovers"],
    connects: ["Shopping rebuild", "Recipe runner", "Challenges"],
  },
  {
    title: "Mi Cocina and Catalogo",
    tone: "pink",
    items: ["Household dishes", "Master catalog packs", "Overrides", "Ingredients"],
    connects: ["Planning picker", "Recipe execution", "Randomization pool"],
  },
  {
    title: "Execution layer",
    tone: "teal",
    items: ["Recipe modal", "Cooking session", "Timers", "Minimized banner"],
    connects: ["Local storage", "Notifications"],
  },
];

const routes = [
  {
    path: "/",
    access: "Public until authenticated",
    page: "HomeRoute -> LandingPage or redirects",
    purpose: "Routes signed-out users to the landing/login flow and signed-in users to onboarding or the current week.",
    backend: ["/api/users/bootstrap-needed", "/api/kitchen/auth/me"],
    notes: "Auth redirects store the intended return path before navigating to login.",
  },
  {
    path: "/bootstrap",
    access: "Public setup route",
    page: "BootstrapPage",
    purpose: "Initial local/dev bootstrap path for creating the first admin-capable user when the backend reports setup is needed.",
    backend: ["/api/users/bootstrap-needed", "/api/users/bootstrap"],
    notes: "BootstrapRedirect sends users away from this page once bootstrap is no longer needed.",
  },
  {
    path: "/login, /signup, /auth/clerk/*",
    access: "Public",
    page: "ClerkAuthPage",
    purpose: "Clerk sign-in, sign-up, reset-password, choice and completion states.",
    backend: ["/api/kitchen/beta/validate", "/api/kitchen/auth/me"],
    notes: "Supports Clerk and legacy-token migration behavior.",
  },
  {
    path: "/invite/:token",
    access: "Public entry, authenticated accept path",
    page: "InviteLandingPage",
    purpose: "Validates household invite links, carries invite context into auth, and accepts invitations for signed-in users.",
    backend: ["/api/kitchen/household/invitations/:token/validate", "/api/kitchen/household/invitations/:token/accept"],
    notes: "Invite token/code context is preserved through sessionStorage during Clerk signup/login.",
  },
  {
    path: "/onboarding/clerk",
    access: "RequireAuth allowOnboarding",
    page: "ClerkOnboardingPage",
    purpose: "Collects household, profile, invite, beta and consent information before the app shell opens.",
    backend: ["/api/kitchen/auth/clerk/onboarding", "/api/kitchen/auth/resolve-household/:inviteCode"],
    notes: "Only shown while onboardingRequired is true.",
  },
  {
    path: "/kitchen/semana",
    access: "RequireAuth",
    page: "WeekPage",
    purpose: "Primary weekly planning surface for lunch/dinner slots, randomization, assignment, leftovers and cooking.",
    backend: ["/api/kitchen/weeks/:weekStart", "/api/kitchen/dishes", "/api/kitchen/users/members"],
    notes: "Main query key: planning/weekStart. Writes invalidate planning, shopping and challenge state indirectly.",
  },
  {
    path: "/kitchen/compra",
    access: "RequireAuth",
    page: "ShoppingPage",
    purpose: "Generated and manual shopping list, purchased transitions, stores and purchase-session prompts.",
    backend: ["/api/kitchen/shopping/:weekStart", "/api/kitchen/shopping/purchase-sessions/pending"],
    notes: "Optimistic purchased/unpurchased state has dedicated tests.",
  },
  {
    path: "/kitchen/compra/presupuesto",
    access: "RequireAuth",
    page: "ShoppingBudgetPage",
    purpose: "Weekly budget setup and return path from shopping or settings.",
    backend: ["/api/kitchen/shopping/:weekStart/budget"],
    notes: "Gated by subscription-related UX in calling pages.",
  },
  {
    path: "/kitchen/platos",
    access: "RequireAuth",
    page: "DishesPage",
    purpose: "Mi Cocina: dishes, ingredients, filters, creation, edits, delete/archive, restore and direct assignment.",
    backend: ["/api/kitchen/dishes", "/api/kitchenIngredients", "/api/categories", "/api/kitchen/dish-categories"],
    notes: "Catalog-origin dishes can become household overrides when edited.",
  },
  {
    path: "/kitchen/cambios",
    access: "RequireAuth",
    page: "SwapsPage",
    purpose: "Meal swap/request surface for proposing, accepting, rejecting, or force-applying changes between household members.",
    backend: ["/api/kitchen/swaps", "/api/kitchen/swaps/:id/accept", "/api/kitchen/swaps/:id/reject", "/api/kitchen/swaps/:id/force"],
    notes: "Force actions are role-gated server-side; normal users use request/accept/reject flows.",
  },
  {
    path: "/kitchen/catalogo",
    access: "RequireAuth",
    page: "CatalogPage",
    purpose: "Browse catalog packs, unlock/claim/install/uninstall packs and configure diet randomization defaults.",
    backend: ["/api/kitchen/catalog/packs", "/api/kitchen/catalog/packs/:packId/install", "/api/kitchen/bites/wallet"],
    notes: "Catalog install invalidates catalog, dishes and user cache keys.",
  },
  {
    path: "/kitchen/configuracion",
    access: "RequireAuth",
    page: "SettingsPage",
    purpose: "Profile, household members, sharing, preferences, themes, subscription and account settings.",
    backend: ["/api/kitchen/household/summary", "/api/kitchen/users/me", "/api/kitchen/household/invitations"],
    notes: "Owner-only operations are enforced server-side with requireRole('owner').",
  },
  {
    path: "/kitchen/upgrade",
    access: "RequireAuth",
    page: "UpgradeToProPage",
    purpose: "Subscription upgrade path and plan request/checkout entry point from gated product surfaces.",
    backend: ["/api/kitchen/household/summary", "/api/subscription/request", "/api/payments/checkout-session"],
    notes: "Payment behavior differs in dev/test entitlement paths; production Stripe flows need runtime verification.",
  },
  {
    path: "/payments/success, /payments/cancelled",
    access: "RequireAuth",
    page: "PaymentSuccessPage / PaymentCancelledPage",
    purpose: "Stripe checkout return routes that reconcile session activation or show cancellation recovery.",
    backend: ["/api/payments/session-activate", "/api/payments/my-attempts"],
    notes: "Success depends on Stripe session id and webhook/customer state; keep return UX resilient to delayed webhooks.",
  },
  {
    path: "/terminos, /terms, /privacidad, /privacy",
    access: "Public",
    page: "LegalPage",
    purpose: "Terms and privacy content shown to public users and referenced by consent/onboarding flows.",
    backend: ["No runtime API calls"],
    notes: "Consent enforcement happens in ConsentGate and /api/kitchen/auth/accept-consent, not on the legal pages.",
  },
  {
    path: "/admin",
    access: "Authenticated + globalRole diod inside page",
    page: "AdminPanelPage",
    purpose: "DIOD admin console for households, users, subscriptions, catalog master data, challenges and account security.",
    backend: ["/api/admin/*", "/api/kitchen/*/admin/*"],
    notes: "Legacy admin login route still exists at /admin/login.",
  },
  {
    path: "/admin/login, /admin/forgot-password, /admin/reset-password",
    access: "Public admin auth recovery",
    page: "AdminLoginPage / AdminForgotPasswordPage / AdminResetPasswordPage",
    purpose: "Legacy admin sign-in and password recovery flow used when DIOD/admin access cannot be established from the current session.",
    backend: ["/api/auth/login", "/api/auth/admin/forgot-password", "/api/auth/admin/reset-password"],
    notes: "AdminPanelPage can retry a legacy token before showing unauthorized state.",
  },
  {
    path: "/admin/usuarios",
    access: "RequireAuth roles=['admin']",
    page: "AdminUsersPage",
    purpose: "Older admin user-management page for listing and creating users alongside household summary data.",
    backend: ["/api/users", "/api/kitchen/household/summary"],
    notes: "This route checks household role admin via RequireAuth; DIOD global admin is handled separately in AdminPanelPage.",
  },
  {
    path: "/admin/interface-map",
    access: "Page-level admin auth + globalRole diod",
    page: "InterfaceMapPage",
    purpose: "This fullscreen interface map for AI-agent context and product architecture review.",
    backend: ["No runtime API calls"],
    notes: "Uses admin-login redirect and legacy-token retry instead of the generic app RequireAuth guard.",
  },
];

const modules = [
  {
    id: "auth",
    title: "Onboarding / Landing / Auth",
    route: "/, /login, /signup, /onboarding/clerk, /invite/:token",
    risk: "high",
    purpose: "Gets users from public entry into a scoped household and a ready app session.",
    components: ["HomeRoute", "LandingPage", "ClerkAuthPage", "ClerkOnboardingPage", "InviteLandingPage", "ConsentGate", "RequireAuth"],
    ui: ["Landing CTA", "Clerk auth widgets", "Invite code resolution", "Beta token validation", "Consent acceptance", "Loading/redirect screens"],
    actions: ["Sign in", "Sign up", "Reset password", "Accept invite", "Create or join household", "Accept consent"],
    modals: ["Clerk flows", "Consent gate", "Invite acceptance status panels"],
    state: ["kitchen_token in local/session storage", "Clerk token getter", "onboardingRequired", "post-auth redirect storage", "consentAcceptedAt"],
    api: ["/api/kitchen/auth/clerk/onboarding", "/api/kitchen/auth/resolve-household/:inviteCode", "/api/kitchen/household/invitations/:token/accept", "/api/kitchen/auth/accept-consent"],
    entities: ["KitchenUser", "Household", "Invitation", "ConsentRecord", "BetaInvite"],
    edges: ["Clerk API outage fallback", "Onboarding-only route guard", "Legacy token migration", "Invite tokens and beta tokens need verification"],
    related: ["Settings", "Household permissions", "Admin"],
    ai: "When changing auth, inspect AppRoutes, RequireAuth, auth.jsx, authRedirect.js, ClerkAuthPage and ClerkOnboardingPage. Do not remove post-auth redirect storage or onboardingRequired redirects. Test signed-out, signed-in, onboarding-required and Clerk outage states.",
  },
  {
    id: "planning",
    title: "Planificacion",
    route: "/kitchen/semana",
    risk: "high",
    purpose: "Plans a week of meals, assigns dishes and cooks, randomizes slots/week, handles dinners, leftovers and extra ingredients.",
    components: ["WeekPage", "WeekNavigator", "WeekDayTabs", "SearchableSelect", "DishModal", "IngredientPicker", "RecipeModal"],
    ui: ["Week navigator", "Meal tabs", "Day cards", "Dish picker", "Randomize menu", "Attendee/cook menus", "Weekend toggles", "Shopping CTA"],
    actions: ["Create week", "Assign dish", "Randomize day", "Randomize week", "Move assignment", "Request/force swap", "Edit attendees", "Add extra ingredients", "Open recipe"],
    modals: ["Dish create/edit", "Attendees", "Move/swap", "Delete assignment", "Weekend setup", "Dinner upgrade", "Catalog randomizer"],
    state: ["planning query cache", "activeWeek context", "dayStatus/dayErrors", "assignment feedback", "mealTab local storage", "installed catalog packs"],
    api: ["/api/kitchen/weeks/:weekStart", "/api/kitchen/weeks/:weekStart/day/:date", "/api/kitchen/weeks/:weekStart/randomize", "/api/kitchen/weeks/:weekStart/day/:date/random-main", "/api/kitchen/weeks/:weekStart/day/:date/move"],
    entities: ["KitchenWeekPlan", "KitchenDish", "KitchenIngredient", "KitchenUser", "HouseholdWeeklyProgress"],
    edges: ["Dinners are plan-gated", "Randomizer respects allowRandom and catalog filters", "Shopping list is downstream of plan changes", "Long day-card menus are mobile-sensitive"],
    related: ["Shopping list", "Mi Cocina", "Catalogo", "Weekly challenges", "Recipe runner"],
    ai: "When modifying planning, inspect WeekPage plus queryClient keys. Preserve lunch/dinner gating, attendees, leftovers, day randomization and cache invalidation. Test mobile day cards and no horizontal overflow.",
  },
  {
    id: "shopping",
    title: "Lista de la compra",
    route: "/kitchen/compra, /kitchen/compra/presupuesto",
    risk: "high",
    purpose: "Turns planned dishes and basics into a weekly checklist with manual items, purchased state, stores and budget follow-up.",
    components: ["ShoppingPage", "ShoppingBudgetPage", "BasicsPopup", "shoppingOptimisticState.js"],
    ui: ["Pending/purchased groups", "Check controls", "Manual item entry", "Category grouping", "Store assignment", "Budget panel", "Purchase-session prompts"],
    actions: ["Mark purchased", "Undo purchase", "Add manual item", "Create ingredient from search", "Delete item", "Assign store", "Set budget", "Finalize purchase session"],
    modals: ["Manual item/create item", "Basics popup", "Purchase-session prompt", "Store/budget panels"],
    state: ["shopping query cache", "optimistic purchased transitions", "pending purchase sessions", "active week", "monthly/weekly budget values"],
    api: ["/api/kitchen/shopping/:weekStart", "/api/kitchen/shopping/:weekStart/item", "/api/kitchen/shopping/:weekStart/items/status", "/api/kitchen/shopping/purchase-sessions/pending", "/api/kitchen/shopping/:weekStart/budget"],
    entities: ["KitchenShoppingList", "ShoppingItem", "PurchaseSession", "Store", "HouseholdBasic", "KitchenIngredient"],
    edges: ["Purchased/unpurchased dedupe affects weekly challenges", "Manual additions can create ingredients", "Store and amount finalize budget-related activity", "Generated list rebuilds from planning"],
    related: ["Planning", "Basics", "Settings budget", "Weekly challenges"],
    ai: "When modifying shopping, inspect ShoppingPage, shoppingService, shoppingOptimisticState tests and purchase-session routes. Preserve optimistic rollback, purchased grouping and challenge triggers.",
  },
  {
    id: "kitchen",
    title: "Mi Cocina",
    route: "/kitchen/platos",
    risk: "high",
    purpose: "Manages household dishes and ingredients, plus master/catalog-derived records and overrides.",
    components: ["DishesPage", "DishModal", "IngredientModal", "IngredientPicker", "RecipeEditor", "RecipeModal", "CategoryChip"],
    ui: ["Dish/ingredient tabs", "Search", "Category filters", "Origin filters", "Dinner/random toggles", "Sticky create action", "Action menus"],
    actions: ["Create dish", "Edit dish", "Delete/archive dish", "Restore/revert override", "Create ingredient", "Edit ingredient", "Assign dish to week", "Open recipe"],
    modals: ["Dish modal", "Ingredient modal", "Delete confirm", "Revert override confirm", "Assign dish", "Recipe modal", "Dinner gate"],
    state: ["dishes query cache", "ingredient list state", "catalog pack filter", "active origin filters", "recipe modal dish"],
    api: ["/api/kitchen/dishes", "/api/kitchen/dishes/:id", "/api/kitchen/dishes/:id/revert-override", "/api/kitchen/dishes/:id/recipe", "/api/kitchenIngredients"],
    entities: ["KitchenDish", "KitchenIngredient", "KitchenDishCategory", "Category", "CatalogPack"],
    edges: ["Master/household/override logic is easy to corrupt", "Recipe fields accept legacy and structured quantities", "Delete may archive instead of hard delete depending origin"],
    related: ["Planning", "Catalogo", "Recipe runner", "Admin master data"],
    ai: "When modifying dishes, inspect DishesPage, DishModal, IngredientModal, dishOrigin utils and backend dish routes. Do not collapse master, household and override scopes into one case.",
  },
  {
    id: "catalog",
    title: "Catalogo",
    route: "/kitchen/catalogo",
    risk: "medium",
    purpose: " lets users browse, claim, unlock, install and uninstall master catalog packs into their household dish pool.",
    components: ["CatalogPage", "PackCard", "PackDetailModal", "CatalogBitesWallet", "CatalogBitesStore", "DietPackInstallModal"],
    ui: ["Catalog cards", "Tabs/search/filters", "Price chips", "Wallet chip", "Pack detail drawer/modal", "Diet default prompt"],
    actions: ["Claim monthly pack", "Unlock with Bites", "Pay direct", "Install pack", "Uninstall pack", "Use diet pack as randomization default"],
    modals: ["Pack detail", "Insufficient Bites", "Bites store", "Diet pack install prompt"],
    state: ["catalog query cache", "wallet and bites config", "price filters", "dismissed diet prompt localStorage"],
    api: ["/api/kitchen/catalog/packs", "/api/kitchen/catalog/packs/:packId/claim", "/api/kitchen/catalog/packs/:packId/unlock", "/api/kitchen/catalog/packs/:packId/install", "/api/kitchen/household/preferences"],
    entities: ["CatalogPack", "HouseholdCatalogPack", "KitchenDish", "PackEntitlement", "BitesTransaction"],
    edges: ["Paid/free/subscription entitlements have separate states", "Install creates or syncs household dishes", "Diet packs can alter randomization defaults"],
    related: ["Mi Cocina", "Planning randomizer", "Admin catalog management", "Bites"],
    ai: "When modifying catalog, inspect CatalogPage, catalogService, catalog routes and pack entitlement/payment code. Test claim, install, uninstall and paid/Bites paths separately.",
  },
  {
    id: "recipe",
    title: "Recipe execution modal / recipe runner",
    route: "Opened from planning or Mi Cocina",
    risk: "high",
    purpose: "Displays recipe ingredients/steps, scales servings and starts guided cooking sessions.",
    components: ["RecipeModal", "RecipeIngredientsList", "RecipeServingsControl", "CookingSessionContext", "CookingSessionStepper", "RecipeStepCard", "RecipeTimer"],
    ui: ["Servings control", "Ingredients list", "Step list", "Execute recipe CTA", "Stepper controls", "Active timers panel"],
    actions: ["Change servings", "Start cooking", "Move steps", "Complete step", "Start/pause/resume/cancel timer", "Minimize", "Resume", "Cancel session"],
    modals: ["Recipe modal", "Fullscreen cooking stepper", "Cancel confirmation sheet", "Ingredients panel"],
    state: ["lunchfy:cooking-session localStorage", "lunchfy:cooking_stepper_open localStorage", "timerTick interval", "notification dedupe set"],
    api: ["No execution API; recipe data comes from KitchenDish.recipe"],
    entities: ["KitchenDish.recipe", "Recipe step", "Timer", "Local cooking session"],
    edges: ["Multiple timers can run at once", "Timers use timestamps for background accuracy", "Long ingredients/steps must wrap on mobile", "Recipe quantities may be mixed legacy/structured data"],
    related: ["Planning", "Mi Cocina", "Timers banner"],
    ai: "Recipe Runner AI Context: inspect RecipeModal, CookingSessionContext, CookingSessionStepper, RecipeStepCard, RecipeTimer, recipeScaling and recipeStepParser. Do not assume only one timer exists. Long text must wrap and mobile must not scroll horizontally.",
  },
  {
    id: "timers",
    title: "Timers and minimized active recipe banner",
    route: "Layout-level overlay in KitchenLayout",
    risk: "high",
    purpose: "Keeps active cooking sessions alive across routes and exposes resume/minimized state.",
    components: ["KitchenLayout", "CookingSessionProvider", "CookingSessionBanner", "CookingSessionStepper", "timerService.js", "notificationService.js"],
    ui: ["Minimized banner", "Active timer row", "Resume action", "Fullscreen stepper", "Timer complete notifications"],
    actions: ["Open stepper", "Minimize stepper", "Expire timer", "Notify completion", "End session"],
    modals: ["Cancel sheet", "Stepper overlay"],
    state: ["Local storage session", "visibilitychange timer checks", "500ms timer tick while timers run", "notifiedRef dedupe"],
    api: ["No backend writes"],
    entities: ["Timer", "Local cooking session"],
    edges: ["Route changes must not lose timers", "Device sleep requires timestamp-derived remaining time", "Notification permissions can fail silently"],
    related: ["Recipe runner", "KitchenLayout"],
    ai: "Timer changes should start in timerService and CookingSessionContext. Verify running, paused, finished and cancelled states, plus tab backgrounding and minimized resume behavior.",
  },
  {
    id: "settings",
    title: "Settings / Configuracion",
    route: "/kitchen/configuracion",
    risk: "medium",
    purpose: "Manages profile, household, sharing, preferences, themes, subscription and account lifecycle.",
    components: ["SettingsPage", "SettingsSharePanel", "PushNotificationsPanel", "DinnerUpgradeBanner", "ProBadge"],
    ui: ["Settings nav panels", "Profile form", "Household members", "Invite/share panel", "Theme picker", "Preference toggles", "Subscription CTAs"],
    actions: ["Update profile", "Rename household", "Invite member", "Create placeholder", "Change preferences", "Change theme", "Delete account", "Open upgrade"],
    modals: ["Share panel dialogs", "Delete account preview", "Upgrade prompts", "Push permission prompts"],
    state: ["user query cache", "active settings section query param", "theme context", "household summary"],
    api: ["/api/kitchen/household/summary", "/api/kitchen/users/me", "/api/kitchen/household/name", "/api/kitchen/household/preferences", "/api/kitchen/household/invitations"],
    entities: ["KitchenUser", "Household", "Invitation", "PushSubscription", "PlansConfig"],
    edges: ["Owner-only actions", "Theme access gated by plan", "Account deletion touches Clerk and local session state", "Invite code/email flows have permissions"],
    related: ["Auth", "Household permissions", "Shopping budget", "Upgrade"],
    ai: "For settings, inspect SettingsPage plus household/users routes. Preserve owner-only checks, theme sync, invite permissions and account deletion warnings.",
  },
  {
    id: "admin",
    title: "Admin panel",
    route: "/admin, /admin/architecture, /admin/interface-map",
    risk: "high",
    purpose: "DIOD-only control center for households, users, subscriptions, catalog data, challenges, Bites and admin security.",
    components: ["AdminPanelPage", "AdminLoginPage", "AdminUsersPage", "AdminForgotPasswordPage", "AdminResetPasswordPage", "InterfaceMapPage"],
    ui: ["Admin tabs", "Household selector", "Control center", "Catalog pack editors", "Challenge editors", "Plan controls", "Security panels"],
    actions: ["Switch active household", "Grant/revoke plan", "Reset onboarding", "Reset weekly cycle", "Manage catalog packs", "Manage master ingredients/categories", "Grant Bites"],
    modals: ["Admin edit panels", "Reset confirmations", "Catalog ownership grants", "Security forms"],
    state: ["globalRole diod", "legacy token retry", "activeHouseholdId", "admin tab route sync"],
    api: ["/api/admin/households", "/api/admin/subscription/activate", "/api/kitchen/catalog/packs/admin-all", "/api/kitchen/onboarding/admin/*", "/api/kitchen/weekly/admin/*"],
    entities: ["Household", "KitchenUser", "CatalogPack", "PlansConfig", "WeeklyChallengeDef", "HouseholdOnboarding", "BitesConfig"],
    edges: ["DIOD permissions are distinct from household role", "Reset buttons mutate production-like state", "Catalog normalization affects master data", "Legacy admin auth still exists"],
    related: ["Catalog master data", "Gamification", "Household permissions"],
    ai: "Admin edits should be treated as high blast radius. Inspect AdminPanelPage and backend admin/catalog/onboarding/weekly/bites routes before changing forms or reset behavior.",
  },
  {
    id: "gamification",
    title: "Weekly challenges / gamification",
    route: "Layout banners + admin challenge tabs",
    risk: "high",
    purpose: "Tracks onboarding and weekly challenge progress, rewards Bites and can unlock Beta Pro.",
    components: ["OnboardingContext", "WeeklyChallengeContext", "OnboardingBanner", "WeeklyChallengeCard", "MilestoneToast", "GuidedTourProvider", "GuidedTourOverlay", "AdminPanelPage challenge tabs"],
    ui: ["Challenge cards", "Progress banners", "Milestone toast", "Beta Pro unlock modal", "Guided tour spotlight + bites indicator"],
    actions: ["Trigger activity", "Complete challenge", "Run/skip guided tour", "Resend guided tour (admin)", "Reset household onboarding", "Reset weekly progress", "Grant/revoke Beta Pro"],
    modals: ["Beta Pro unlocked modal", "Guided tour overlay", "Admin reset controls"],
    state: ["onboarding state context (includes guidedTour + guidedTourEnabled)", "weekly challenge context", "HouseholdWeeklyProgress counters", "Household.betaPro"],
    api: ["/api/kitchen/onboarding/state", "/api/kitchen/onboarding/trigger", "/api/kitchen/onboarding/guided-tour/*", "/api/kitchen/weekly/state", "/api/kitchen/weekly/trigger", "/api/kitchen/weekly/admin/*"],
    entities: ["HouseholdOnboarding", "OnboardingChallenge", "OnboardingSuggestion", "GuidedTourConfig", "HouseholdWeeklyProgress", "WeeklyChallengeDef", "BitesTransaction"],
    edges: ["Challenge triggers are spread across planning, shopping, catalog and settings", "Deduping counters matters", "Beta Pro grant/revoke changes subscription-like access", "Guided tour rewards are once-per-household (rewardedSteps persists across resends)"],
    related: ["Planning", "Shopping", "Catalogo", "Admin", "Bites"],
    ai: "Challenge work must inspect contexts plus backend weeklyEngine/onboardingEngine/guidedTourService. Verify trigger type, dedupe rules, reward grants and Beta Pro side effects. Guided tour docs: docs/guided-tour.md; steps config in components/tour/guidedTourSteps.js.",
  },
  {
    id: "master-data",
    title: "Catalog/master data management",
    route: "/admin tabs",
    risk: "high",
    purpose: "Maintains master ingredients, categories, dish categories, catalog pack contents, validation and publication state.",
    components: ["AdminPanelPage catalog sections", "RecipeEditor", "catalogNormalization.js", "dishCatalog.js"],
    ui: ["Pack editor", "Cover upload", "Normalization tools", "Master ingredient selectors", "Validation summary", "Publish/status buttons"],
    actions: ["Create/edit/delete pack", "Upload cover", "Normalize ingredients", "Map dish categories", "Publish pack", "Grant/revoke household ownership"],
    modals: ["Pack edit flows", "Ownership controls", "Ingredient normalization forms"],
    state: ["Admin pack filters", "validationSummary", "reviewIssues", "ownership state"],
    api: ["/api/kitchen/catalog/packs", "/api/kitchen/catalog/packs/:packId/revalidate", "/api/kitchen/catalog/packs/:packId/normalize/ingredient", "/api/kitchen/catalog/packs/:packId/publish"],
    entities: ["CatalogPack", "KitchenIngredient", "KitchenDishCategory", "Category", "HouseholdCatalogPack"],
    edges: ["Publishing bad mappings propagates to users", "Cover upload uses multipart fetch", "Ingredient category ids must stay valid", "Master data delete can orphan references"],
    related: ["Catalogo", "Mi Cocina", "Admin"],
    ai: "Before touching master data, inspect models and catalog routes. Preserve validation summary shape and never assume names are enough when ObjectIds exist.",
  },
  {
    id: "household",
    title: "Household / user / permissions concepts",
    route: "Cross-cutting",
    risk: "high",
    purpose: "Scopes almost all app data to a household while supporting owner/admin/member roles, placeholders and DIOD global access.",
    components: ["RequireAuth", "KitchenLayout", "SettingsSharePanel", "householdScope.js", "middleware.js", "clerkAuth.js"],
    ui: ["User menu", "Household switcher for DIOD", "Invite and placeholder controls", "Role-dependent settings actions"],
    actions: ["Switch household", "Invite user", "Convert placeholder", "Assign cook", "Update member access", "Owner-only household edits"],
    modals: ["Share/invite panels", "Member edit controls"],
    state: ["user.householdId", "user.activeHouseholdId", "localStorage kitchen_active_household_id", "role/globalRole"],
    api: ["/api/kitchen/household/*", "/api/kitchen/users/members", "/api/kitchen/admin/active-household"],
    entities: ["Household", "KitchenUser", "Invitation"],
    edges: ["DIOD globalRole is not the same as household role", "Placeholder users may have no login", "Dinner cook flags differ from lunch cook flags", "Active household overrides scope for DIOD"],
    related: ["Auth", "Settings", "Admin", "Planning"],
    ai: "Permission changes must inspect middleware, householdScope and SettingsSharePanel. Keep server-side requireRole checks; frontend gating is only UX.",
  },
];

const flows = [
  {
    title: "New user starts app",
    steps: ["Landing", "signup/login", "Clerk onboarding", "household create/join", "ConsentGate", "first planning week"],
    checks: ["Signed-in users with onboardingRequired must stay out of normal app routes.", "Invite and beta token states need explicit verification."],
  },
  {
    title: "Plan a week",
    steps: ["Open /kitchen/semana", "select week/day/meal", "choose or create dish", "assign dish", "view day card", "optionally randomize again"],
    checks: ["Dinners require plan access.", "Plan writes should refresh shopping and challenge state."],
  },
  {
    title: "Randomize meals",
    steps: ["Open randomize menu", "choose day/week and optional catalog filter", "POST randomize endpoint", "assigned dishes appear", "success feedback", "regenerate option remains available"],
    checks: ["Respect allowRandom, diet filters and avoid-repeat settings.", "Weekly challenge completion can fire from this path."],
  },
  {
    title: "Use shopping list",
    steps: ["Generated items load from week", "mark item purchased", "item moves to purchased section", "undo/unpurchase if needed", "add custom item", "create ingredient if not found"],
    checks: ["Optimistic update must roll back on API failure.", "Purchased dedupe affects challenge counters."],
  },
  {
    title: "Manage dishes",
    steps: ["Search dishes/products", "create if not found", "identify master/user/override origin", "edit recipe or ingredients", "restore original if override"],
    checks: ["Preserve scope/masterId/householdId rules.", "Recipe ingredient quantities may be mixed types."],
  },
  {
    title: "Execute a recipe",
    steps: ["Open recipe", "choose servings", "review ingredients", "start cooking", "move through steps", "start multiple timers", "minimize", "resume or cancel"],
    checks: ["Session is localStorage-backed.", "Multiple concurrent timers and long text are expected."],
  },
  {
    title: "Catalog flow",
    steps: ["Browse packs", "open pack detail", "claim/unlock/pay if required", "install pack", "dishes appear in Mi Cocina", "modified catalog dish becomes override"],
    checks: ["Ownership and installed state are separate.", "Diet packs can change randomizer defaults."],
  },
  {
    title: "Admin/gamification flow",
    steps: ["Admin opens /admin", "select household", "inspect control center", "reset onboarding/week/challenges", "grant/revoke license or Beta Pro", "verify progress state"],
    checks: ["DIOD-only routes mutate real household state.", "Reset operations should be deliberate and auditable."],
  },
];

const entities = [
  {
    name: "KitchenUser",
    represents: "A user or placeholder diner/cook in a household.",
    fields: ["username", "email", "displayName", "type/isPlaceholder", "role", "globalRole", "householdId", "activeHouseholdId", "themeId", "consentAcceptedAt"],
    used: ["Auth", "Planning attendees/cooks", "Settings members", "Admin household control"],
    relations: ["Belongs to Household", "May be DIOD global admin", "May be placeholder without login"],
    risks: "Do not confuse globalRole diod with household role admin.",
  },
  {
    name: "Household",
    represents: "The primary scope for plans, dishes, shopping, settings, subscription and gamification.",
    fields: ["name", "ownerUserId", "dinnersEnabled", "monthlyBudget", "subscriptionPlan/status", "planSource", "betaPro", "Bites balances", "weeklyChallengeCycleStartedAt"],
    used: ["Every protected kitchen route", "Admin", "Payments", "Gamification"],
    relations: ["Owns users, week plans, shopping lists, catalog ownership and preferences"],
    risks: "Plan and Beta Pro fields gate UI behavior across many screens.",
  },
  {
    name: "KitchenDish",
    represents: "Dish/plate record for master catalog, household-created or household override dishes.",
    fields: ["scope", "householdId", "masterId", "name", "dishCategoryId", "ingredients", "isDinner", "allowRandom", "sourcePackId", "userModified", "recipe"],
    used: ["Planning", "Mi Cocina", "Catalog install", "Recipe runner", "Shopping generation"],
    relations: ["Uses KitchenIngredient refs", "May originate from CatalogPack", "May be override of master dish"],
    risks: "Override uniqueness depends on householdId + masterId + scope.",
  },
  {
    name: "KitchenIngredient",
    represents: "Ingredient/product master, household or override record.",
    fields: ["scope", "householdId", "masterId", "name", "canonicalName", "categoryId", "active", "deletedAt"],
    used: ["Dish ingredients", "Recipe editor", "Shopping list", "Basics", "Admin master data"],
    relations: ["Belongs to Category", "May be referenced by dish recipe ingredients"],
    risks: "Canonical names power search/dedupe; categoryId is required.",
  },
  {
    name: "Category / KitchenDishCategory",
    represents: "Ingredient/product categories and dish categories.",
    fields: ["name", "slug/canonicalName", "active", "sortOrder"],
    used: ["Filters", "Shopping grouping", "Dish cards", "Catalog validation"],
    relations: ["Ingredients point to Category; dishes point to KitchenDishCategory"],
    risks: "Deleting categories can break filtering or mapping if references remain.",
  },
  {
    name: "KitchenWeekPlan",
    represents: "A household's plan for one week.",
    fields: ["weekStart", "householdId", "days", "date", "mealType", "cookUserId", "attendeeIds", "servings", "mainDishId", "sideDishId", "ingredientOverrides", "leftovers"],
    used: ["WeekPage", "Shopping generation", "Weekly challenge counters"],
    relations: ["References users and dishes", "One plan per household/week"],
    risks: "Lunch/dinner and leftovers fields interact with shopping inclusion.",
  },
  {
    name: "KitchenShoppingList",
    represents: "A generated/manual shopping list for one household week.",
    fields: ["weekStart", "householdId", "items", "itemId", "ingredientId", "displayName", "quantity", "unit", "status", "storeId", "purchaseSessionId"],
    used: ["ShoppingPage", "Budget", "Weekly challenges"],
    relations: ["Items can reference ingredients, dishes, stores and purchase sessions"],
    risks: "Status transitions must maintain purchasedBy/purchasedAt and challenge dedupe.",
  },
  {
    name: "CatalogPack / HouseholdCatalogPack",
    represents: "Master dish packs and household ownership/install state.",
    fields: ["slug", "title", "status", "dishes", "isPaid", "monthlyCreditCost", "validationSummary", "acquiredVia", "installedAt", "paymentStatus"],
    used: ["CatalogPage", "Admin catalog", "Mi Cocina", "Randomization"],
    relations: ["Installing creates/syncs KitchenDish records", "Ownership is per household"],
    risks: "Published pack mistakes propagate into user dish pools.",
  },
  {
    name: "Recipe step / Timer",
    represents: "Client-side execution state derived from KitchenDish.recipe.",
    fields: ["selectedServings", "steps", "completedSteps", "timers", "status", "startedAt", "elapsed", "finishedAt"],
    used: ["RecipeModal", "CookingSessionStepper", "CookingSessionBanner"],
    relations: ["Stored locally, not in Mongo", "Timers belong to a cooking execution id"],
    risks: "Multiple timers are supported; do not model as a single timer.",
  },
  {
    name: "Weekly challenge and license state",
    represents: "Onboarding and weekly gamification progress plus plan rewards.",
    fields: ["HouseholdOnboarding.status", "completedChallenges", "HouseholdWeeklyProgress counters", "WeeklyChallengeDef.triggerType", "Household.betaPro"],
    used: ["Banners", "MilestoneToast", "Admin challenge tabs", "Beta Pro modal"],
    relations: ["Triggered by app actions", "May grant Bites and Beta Pro"],
    risks: "Reward dedupe and reset logic must be preserved.",
  },
];

const actions = [
  ["Create dish", "Mi Cocina, Planning create flow", "Creates KitchenDish and can include recipe data", "POST /api/kitchen/dishes", "Success toast/list update", "Duplicate names, invalid ingredient refs, plan gates"],
  ["Edit dish", "Mi Cocina/Admin", "Updates KitchenDish or creates override for catalog-origin behavior", "PUT /api/kitchen/dishes/:id", "Card refresh/cache invalidation", "Scope/master override corruption"],
  ["Delete dish", "Mi Cocina/Admin", "Archives/deletes dish depending backend rules", "DELETE /api/kitchen/dishes/:id", "Confirm then remove from visible list", "Dish still referenced in plans"],
  ["Restore master dish from override", "Mi Cocina", "Reverts household override back to master data", "POST /api/kitchen/dishes/:id/revert-override", "Reverted card replaces override", "Loss of user modifications"],
  ["Add ingredient/product", "Mi Cocina, Shopping, Recipe editor", "Creates KitchenIngredient scoped to household or master in admin", "POST /api/kitchenIngredients", "Picker/list updates", "Canonical duplicate or missing category"],
  ["Search dish/product", "Planning, Mi Cocina, Shopping, Recipe editor", "Reads filtered lists for selection", "GET /api/kitchen/dishes, GET /api/kitchenIngredients", "Suggestions/results", "Search normalization mismatches"],
  ["Assign dish to planning", "Planning and Mi Cocina assign modal", "Updates day main/side dish and servings/cook data", "PUT /api/kitchen/weeks/:weekStart/day/:date", "Day card updates", "Meal type/dinner gating"],
  ["Randomize planning", "Planning", "Assigns day/week dishes and may trigger challenges", "POST /api/kitchen/weeks/:weekStart/randomize or /random-main", "Success feedback/animations", "Empty random pool, catalog filters, repeat avoidance"],
  ["Change servings", "Recipe modal/runner", "Client-side scaling only", "No API", "Ingredient quantities update", "Legacy quantity strings may not scale cleanly"],
  ["Start/pause/resume/cancel timer", "Cooking stepper", "Updates local timer state", "No API", "Timer buttons and banner update", "Background tab/device sleep"],
  ["Minimize recipe", "Cooking stepper", "Persists stepper closed while session remains active", "No API", "Minimized banner appears", "Session lost if localStorage unavailable"],
  ["Mark shopping item purchased", "Shopping list", "Changes item status and challenge counters", "PUT /api/kitchen/shopping/:weekStart/item or /items/status", "Moves to purchased group", "Optimistic rollback and dedupe"],
  ["Reset household/challenges/admin actions", "Admin", "Mutates onboarding/weekly/subscription/catalog state", "/api/admin/* and /api/kitchen/*/admin/*", "Admin result panels", "High blast radius; verify target household"],
];

const modals = [
  ["DishModal", "Create/edit dishes and recipe metadata", "DishesPage, WeekPage", "Writes KitchenDish and recipe data"],
  ["IngredientModal / IngredientPicker", "Create/select ingredients", "DishesPage, DishModal, RecipeEditor, Shopping", "Requires canonicalName and category"],
  ["RecipeModal", "Read recipe, adjust servings, start execution", "WeekPage, DishesPage", "Starts local cooking session"],
  ["CookingSessionStepper", "Fullscreen guided cooking", "KitchenLayout overlay", "Local storage and timers"],
  ["CookingSessionBanner", "Minimized active recipe", "KitchenLayout overlay", "Resume active session"],
  ["BasicsPopup", "Household basics for shopping", "Shopping and Settings", "Creates/applies HouseholdBasic items"],
  ["Catalog pack detail / Bites store / insufficient Bites", "Catalog actions", "CatalogPage", "Ownership, unlock and payment paths"],
  ["OnboardingBanner / WeeklyChallengeCard / MilestoneToast", "Gamification surfaces", "KitchenLayout", "Challenge state and rewards"],
  ["GuidedTourOverlay", "Interactive guided onboarding: spotlight + anchored coach bubble; action steps advance only via real app events (guidedOnboardingEvents), rewards only for completed actions", "App-level portal (GuidedTourProvider)", "guidedTour status on HouseholdOnboarding; auto-launch for pending users"],
  ["Admin panels", "Reset, grant, edit and normalize data", "AdminPanelPage", "DIOD-only backend mutations"],
  ["ConsentGate", "Legal consent acceptance", "AppRoutes wrapper", "Blocks app until accepted"],
];

const fragileAreas = [
  "Graphify snapshot is useful but stale: built from commit ab163946; current HEAD at inspection time is 484dfa1.",
  "Mobile overflow risk in recipe execution: long ingredient units, recipe HTML and timer labels must wrap.",
  "Multiple timers can run at once; never replace timer maps with a single timer state.",
  "Cooking sessions are persisted locally, while recipe source data is server-side KitchenDish.recipe.",
  "Shopping purchased/unpurchased transitions are optimistic and tied to weekly challenge dedupe.",
  "Master/household/override logic for dishes and ingredients depends on scope, householdId and masterId.",
  "Randomization completion, catalog-dish usage and challenge progress are cross-cutting backend triggers.",
  "Admin reset/license/challenge behavior changes household state and can grant/revoke Beta Pro access.",
  "Auth redirects combine Clerk, legacy token fallback, onboardingRequired and post-auth return paths.",
  "DIOD admin access uses globalRole; household role admin is a different concept.",
  "Catalog pack install/uninstall affects user dish pools, randomizer filters and catalog ownership state.",
  "Production/dev differences exist around payment/test entitlement endpoints and bootstrap/admin login behavior.",
];

const needsVerification = [
  "Needs verification: exact production behavior of Stripe checkout, paid pack purchase and customer portal flows.",
  "Needs verification: Clerk outage and legacy admin-token recovery paths should be tested with real auth provider states.",
  "Needs verification: catalog cover upload and multipart errors were identified from code but not exercised in-browser.",
  "Needs verification: push notification permission behavior depends on browser/device support.",
  "Needs verification: Graphify should be regenerated because the existing report predates the current HEAD.",
];

function flattenForSearch(value) {
  return JSON.stringify(value).toLowerCase();
}

function RiskBadge({ risk }) {
  return <span className={`imap-risk imap-risk-${risk}`}>{risk}</span>;
}

function Chip({ children, tone = "neutral" }) {
  return <span className={`imap-chip imap-chip-${tone}`}>{children}</span>;
}

function CopyButton({ id, text, copiedId, onCopy }) {
  const copied = copiedId === id;
  return (
    <button className="imap-icon-btn" type="button" onClick={() => onCopy(id, text)} title="Copy AI context">
      {copied ? <Check size={16} /> : <Copy size={16} />}
      <span>{copied ? "Copied" : "Copy"}</span>
    </button>
  );
}

function Section({ id, eyebrow, title, description, children }) {
  return (
    <section id={id} className="imap-section">
      <div className="imap-section-head">
        <span>{eyebrow}</span>
        <h2>{title}</h2>
        {description ? <p>{description}</p> : null}
      </div>
      {children}
    </section>
  );
}

function UnauthorizedAdminMap({ user }) {
  return (
    <main className="imap-auth-screen">
      <div className="imap-auth-panel">
        <Shield size={32} />
        <h1>Admin access required</h1>
        <p>
          This map is internal. Current session: {user?.email || user?.displayName || "authenticated user"}.
          It requires DIOD/global admin access, matching the main admin panel.
        </p>
        <div className="imap-auth-actions">
          <Link to="/admin/login" className="imap-primary-link">Admin login</Link>
          <Link to="/kitchen/semana" className="imap-secondary-link">Back to app</Link>
        </div>
      </div>
    </main>
  );
}

export default function InterfaceMapPage() {
  const { user, loading, refreshUser } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const adminLegacyRetryRef = useRef(false);
  const [query, setQuery] = useState("");
  const [copiedId, setCopiedId] = useState("");

  const normalizedQuery = query.trim().toLowerCase();
  const filterItems = (items) => (
    normalizedQuery ? items.filter((item) => flattenForSearch(item).includes(normalizedQuery)) : items
  );

  const filteredModules = useMemo(() => filterItems(modules), [normalizedQuery]);
  const filteredRoutes = useMemo(() => filterItems(routes), [normalizedQuery]);
  const filteredFlows = useMemo(() => filterItems(flows), [normalizedQuery]);
  const filteredEntities = useMemo(() => filterItems(entities), [normalizedQuery]);
  const filteredActions = useMemo(() => filterItems(actions), [normalizedQuery]);
  const filteredModals = useMemo(() => filterItems(modals), [normalizedQuery]);
  const filteredFragile = useMemo(() => (
    normalizedQuery ? fragileAreas.filter((item) => item.toLowerCase().includes(normalizedQuery)) : fragileAreas
  ), [normalizedQuery]);

  const handleCopy = async (id, text) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedId(id);
      window.setTimeout(() => setCopiedId(""), 1600);
    } catch {
      setCopiedId("");
    }
  };

  useEffect(() => {
    if (loading) return;
    if (!user) {
      const next = `${location.pathname}${location.search || ""}`;
      navigate(`/admin/login?next=${encodeURIComponent(next)}`, { replace: true });
      return;
    }
    if (user.globalRole !== "diod" && !adminLegacyRetryRef.current && hasLegacyToken()) {
      adminLegacyRetryRef.current = true;
      refreshUser({ authMode: "auto" });
    }
  }, [loading, location.pathname, location.search, navigate, refreshUser, user]);

  if (loading) {
    return (
      <main className="imap-auth-screen">
        <div className="imap-auth-panel">
          <Map size={32} />
          <h1>Loading interface map</h1>
          <p>Checking your session before opening the internal architecture dashboard.</p>
        </div>
      </main>
    );
  }

  if (!user) return null;

  if (user?.globalRole !== "diod") {
    return <UnauthorizedAdminMap user={user} />;
  }

  return (
    <main className="imap-page">
      <header className="imap-topbar">
        <div className="imap-brand">
          <button className="imap-back" type="button" onClick={() => navigate("/admin")} title="Back to admin">
            <ArrowLeft size={18} />
          </button>
          <div>
            <p>Internal admin</p>
            <h1>App Interface Map</h1>
          </div>
        </div>
        <label className="imap-search">
          <Search size={17} />
          <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search routes, modules, APIs, entities..." />
        </label>
        <div className="imap-top-actions">
          <Link to="/admin" className="imap-secondary-link"><Shield size={16} /> Admin</Link>
          <Link to="/kitchen/semana" className="imap-primary-link"><Home size={16} /> App</Link>
        </div>
      </header>

      <div className="imap-shell">
        <aside className="imap-sidebar">
          <div className="imap-sidebar-label">Jump to</div>
          {navSections.map(({ id, label, icon: Icon }) => (
            <a key={id} href={`#${id}`}>
              <Icon size={16} />
              <span>{label}</span>
            </a>
          ))}
        </aside>

        <div className="imap-content">
          <Section
            id="overview"
            eyebrow="Mental model"
            title="How Lunchfy is structured"
            description="A current-code map for screens, flows, state, APIs, data and AI-agent modification notes."
          >
            <div className="imap-hero-grid">
              <div className="imap-hero-copy">
                <div className="imap-badge-row">
                  <Chip tone="green"><Lock size={14} /> DIOD protected</Chip>
                  <Chip tone="blue">Last reviewed {REVIEWED_AT}</Chip>
                  <Chip tone="amber">Graphify stale</Chip>
                </div>
                <p>
                  Built from the existing Graphify output, then checked against React routes, kitchen components,
                  query helpers, backend routes and Mongo models. Items that need runtime verification are called out
                  instead of being treated as certain.
                </p>
                <div className="imap-review-box">
                  <strong>Graphify freshness</strong>
                  <span>Report commit: {GRAPHIFY_COMMIT}</span>
                  <span>Current HEAD inspected: {CURRENT_COMMIT}</span>
                  <span>Recommendation: run graphify update after this page lands.</span>
                </div>
                <div className="imap-needs-list">
                  {needsVerification.map((item) => (
                    <p key={item}>{item}</p>
                  ))}
                </div>
              </div>
              <div className="imap-stats">
                <div><strong>{routes.length}</strong><span>documented routes</span></div>
                <div><strong>{modules.length}</strong><span>modules</span></div>
                <div><strong>{entities.length}</strong><span>core entities</span></div>
                <div><strong>{actions.length}</strong><span>actions</span></div>
              </div>
            </div>

            <div className="imap-model-grid">
              {mentalModel.map((node) => (
                <article key={node.title} className={`imap-model-node imap-tone-${node.tone}`}>
                  <h3>{node.title}</h3>
                  <div className="imap-chip-cloud">
                    {node.items.map((item) => <Chip key={item}>{item}</Chip>)}
                  </div>
                  <p>Connects to: {node.connects.join(", ")}</p>
                </article>
              ))}
            </div>
          </Section>

          <Section id="routes" eyebrow="Navigation" title="Routes and entry points" description="Public, kitchen and admin route surfaces visible in App.jsx.">
            <div className="imap-route-list">
              {filteredRoutes.map((route) => (
                <article key={route.path} className="imap-route-row">
                  <div>
                    <code>{route.path}</code>
                    <span>{route.access}</span>
                  </div>
                  <h3>{route.page}</h3>
                  <p>{route.purpose}</p>
                  <div className="imap-chip-cloud">{route.backend.map((item) => <Chip key={item} tone="blue">{item}</Chip>)}</div>
                  <small>{route.notes}</small>
                </article>
              ))}
            </div>
          </Section>

          <Section id="modules" eyebrow="Product areas" title="Modules" description="Each module lists purpose, components, UI, actions, state, backend interactions, edge cases and AI-safe modification notes.">
            <div className="imap-module-grid">
              {filteredModules.map((module) => (
                <article key={module.id} className="imap-module-card">
                  <div className="imap-module-head">
                    <div>
                      <h3>{module.title}</h3>
                      <code>{module.route}</code>
                    </div>
                    <RiskBadge risk={module.risk} />
                  </div>
                  <p className="imap-purpose">{module.purpose}</p>
                  <details open>
                    <summary>Components and UI</summary>
                    <div className="imap-chip-cloud">{module.components.map((item) => <Chip key={item}>{item}</Chip>)}</div>
                    <ul>{module.ui.map((item) => <li key={item}>{item}</li>)}</ul>
                  </details>
                  <details>
                    <summary>Actions, modals and state</summary>
                    <div className="imap-mini-columns">
                      <div><strong>Actions</strong><ul>{module.actions.map((item) => <li key={item}>{item}</li>)}</ul></div>
                      <div><strong>Modals</strong><ul>{module.modals.map((item) => <li key={item}>{item}</li>)}</ul></div>
                      <div><strong>State</strong><ul>{module.state.map((item) => <li key={item}>{item}</li>)}</ul></div>
                    </div>
                  </details>
                  <details>
                    <summary>Backend, data and risks</summary>
                    <div className="imap-chip-cloud">{module.api.map((item) => <Chip key={item} tone="blue">{item}</Chip>)}</div>
                    <p><strong>Entities:</strong> {module.entities.join(", ")}</p>
                    <ul>{module.edges.map((item) => <li key={item}>{item}</li>)}</ul>
                    <p><strong>Related:</strong> {module.related.join(", ")}</p>
                  </details>
                  <div className="imap-ai-inline">
                    <strong>Context for AI</strong>
                    <p>{module.ai}</p>
                    <CopyButton id={`module-${module.id}`} text={module.ai} copiedId={copiedId} onCopy={handleCopy} />
                  </div>
                </article>
              ))}
            </div>
          </Section>

          <Section id="flows" eyebrow="Behavior" title="User flows" description="Step-by-step workflows the app should continue to support.">
            <div className="imap-flow-grid">
              {filteredFlows.map((flow) => (
                <article key={flow.title} className="imap-flow">
                  <h3>{flow.title}</h3>
                  <ol>{flow.steps.map((step) => <li key={step}>{step}</li>)}</ol>
                  <div className="imap-flow-checks">
                    {flow.checks.map((check) => <p key={check}>{check}</p>)}
                  </div>
                </article>
              ))}
            </div>
          </Section>

          <Section id="entities" eyebrow="Data model" title="Core entities" description="Mongo schemas and client-only state concepts found in the current code.">
            <div className="imap-entity-grid">
              {filteredEntities.map((entity) => (
                <article key={entity.name} className="imap-entity">
                  <h3>{entity.name}</h3>
                  <p>{entity.represents}</p>
                  <div className="imap-chip-cloud">{entity.fields.map((field) => <Chip key={field} tone="green">{field}</Chip>)}</div>
                  <p><strong>Used in:</strong> {entity.used.join(", ")}</p>
                  <p><strong>Relationships:</strong> {entity.relations.join("; ")}</p>
                  <p className="imap-risk-note"><AlertTriangle size={15} /> {entity.risks}</p>
                </article>
              ))}
            </div>
          </Section>

          <Section id="actions" eyebrow="Operations" title="Actions catalog" description="Important user and admin actions, what they change, and where failures usually happen.">
            <div className="imap-action-list">
              {filteredActions.map(([name, appears, changes, endpoint, feedback, failure]) => (
                <article key={name} className="imap-action">
                  <h3>{name}</h3>
                  <p><strong>Where:</strong> {appears}</p>
                  <p><strong>Changes:</strong> {changes}</p>
                  <p><strong>Endpoint/service:</strong> <code>{endpoint}</code></p>
                  <p><strong>Feedback:</strong> {feedback}</p>
                  <p><strong>Failure modes:</strong> {failure}</p>
                </article>
              ))}
            </div>
          </Section>

          <Section id="modals" eyebrow="Overlays" title="Modals, drawers and popovers" description="User-facing overlays and what state they affect.">
            <div className="imap-modal-grid">
              {filteredModals.map(([name, purpose, appears, state]) => (
                <article key={name} className="imap-modal">
                  <h3>{name}</h3>
                  <p>{purpose}</p>
                  <span>{appears}</span>
                  <small>{state}</small>
                </article>
              ))}
            </div>
          </Section>

          <Section id="fragile" eyebrow="Warnings" title="Known fragile areas" description="Practical warnings for AI agents and humans before touching high-risk surfaces.">
            <div className="imap-warning-list">
              {filteredFragile.map((item) => (
                <div key={item} className="imap-warning">
                  <AlertTriangle size={18} />
                  <p>{item}</p>
                </div>
              ))}
            </div>
          </Section>

          <Section id="ai-notes" eyebrow="Prompt helper" title="AI instruction notes" description="Copyable snippets for better agent prompts by module.">
            <div className="imap-ai-grid">
              {filteredModules.map((module) => (
                <article key={module.id} className="imap-ai-note">
                  <div>
                    <h3>{module.title}</h3>
                    <RiskBadge risk={module.risk} />
                  </div>
                  <p>{module.ai}</p>
                  <CopyButton id={`ai-${module.id}`} text={module.ai} copiedId={copiedId} onCopy={handleCopy} />
                </article>
              ))}
            </div>
          </Section>
        </div>
      </div>
    </main>
  );
}
