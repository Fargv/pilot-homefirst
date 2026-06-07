import dotenv from "dotenv";

dotenv.config();

function parseOriginList(...values) {
  return Array.from(
    new Set(
      values
        .flatMap((value) => String(value || "").split(","))
        .map((value) => value.trim().replace(/\/$/, ""))
        .filter(Boolean)
    )
  );
}

function extractDbName(uri) {
  if (!uri) return null;
  const match = String(uri).match(/\/([^/?]+)(\?|$)/);
  return match ? match[1] : null;
}

export const config = {
  nodeEnv: process.env.NODE_ENV || "development",
  port: Number(process.env.PORT || 3000),

  mongodbUri: process.env.MONGODB_URI,
  frontendUrl:
    process.env.APP_URL ||
    process.env.FRONTEND_URL ||
    process.env.CORS_ORIGIN ||
    "http://localhost:5173",
  appUrl:
    process.env.APP_URL ||
    process.env.FRONTEND_URL ||
    process.env.CORS_ORIGIN ||
    "http://localhost:5173",

  jwtSecret: process.env.JWT_SECRET || "dev-kitchen-secret",
  clerkSecretKey: process.env.CLERK_SECRET_KEY || "",
  clerkJwtKey: process.env.CLERK_JWT_KEY || "",
  clerkAuthorizedParties: String(process.env.CLERK_AUTHORIZED_PARTIES || "")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean),
  resetPasswordTokenSecret:
    process.env.RESET_PASSWORD_TOKEN_SECRET || "dev-reset-password-token-secret",
  cronSecret: process.env.CRON_SECRET || "",

  brevo: {
    apiKey: process.env.BREVO_API_KEY
  },

  mailFrom: process.env.EMAIL_FROM || process.env.MAIL_FROM || "Pilot <no-reply@example.com>",

  webPush: {
    publicKey: process.env.WEB_PUSH_PUBLIC_KEY || "",
    privateKey: process.env.WEB_PUSH_PRIVATE_KEY || "",
    contactEmail: process.env.WEB_PUSH_CONTACT_EMAIL || ""
  },

  stripe: {
    secretKey: process.env.STRIPE_SECRET_KEY || "",
    webhookSecret: process.env.STRIPE_WEBHOOK_SECRET || "",
    mode: process.env.STRIPE_MODE || "test",
    paymentsEnabled: process.env.PAYMENTS_ENABLED === "true",
    // Only grant entitlements automatically in DEV test mode when this flag is explicitly set.
    // Production must never have this true — it is an additional guard beyond PAYMENTS_ENABLED.
    allowTestEntitlements: process.env.ALLOW_TEST_PAYMENT_ENTITLEMENTS === "true",
    proPriceId: process.env.STRIPE_PRO_PRICE_ID || "",
    premiumPriceId: process.env.STRIPE_PREMIUM_PRICE_ID || "",
    portalEnabled: process.env.STRIPE_PORTAL_ENABLED === "true"
  }
};

// ── Detect environment ────────────────────────────────────────────────────────
// Both NODE_ENV and APP_ENV can signal production. NODE_ENV is the Node.js
// convention; APP_ENV is an explicit override used by Render.
const _isProduction = config.nodeEnv === "production" || process.env.APP_ENV === "production";
config.isProduction = _isProduction;

// ── CORS origins ──────────────────────────────────────────────────────────────
// localhost is only added in non-production to avoid widening the attack surface.
config.corsOrigins = parseOriginList(
  process.env.CORS_ORIGIN,
  process.env.APP_URL,
  process.env.FRONTEND_URL,
  _isProduction ? null : "http://localhost:5173"
);
config.corsOrigin = config.corsOrigins[0] || (_isProduction ? "" : "http://localhost:5173");

// ── DB name (for assertions and startup log) ──────────────────────────────────
const _dbName = extractDbName(config.mongodbUri);
const _stripeKey = process.env.STRIPE_SECRET_KEY || "";

// ── Startup assertions ────────────────────────────────────────────────────────

// B-0: MongoDB URI — must be set in production and must never point to pilot_dev.
if (!config.mongodbUri) {
  if (_isProduction) {
    console.error("[startup] FATAL: MONGODB_URI is not set in production. Exiting.");
    process.exit(1);
  } else {
    console.warn("[startup] WARNING: MONGODB_URI is missing.");
  }
}
if (_dbName === "pilot_dev" && _isProduction) {
  console.error("[startup] FATAL: MONGODB_URI points to 'pilot_dev' in production. Set MONGODB_URI to the production database. Exiting.");
  process.exit(1);
}
// Extra safety net: live Stripe key paired with dev DB is never acceptable,
// even if NODE_ENV/APP_ENV are misconfigured.
if (_stripeKey.startsWith("sk_live_") && _dbName === "pilot_dev") {
  console.error("[startup] FATAL: STRIPE_SECRET_KEY is a live key but MONGODB_URI points to 'pilot_dev'. Refusing to start.");
  process.exit(1);
}

// B-5: JWT_SECRET — fatal in production, warn with dev fallback otherwise.
if (!process.env.JWT_SECRET) {
  if (_isProduction) {
    console.error("[startup] FATAL: JWT_SECRET is not set. Exiting to prevent insecure token signing.");
    process.exit(1);
  } else {
    console.warn("[startup] WARNING: JWT_SECRET not set — using insecure dev fallback. Set JWT_SECRET before going to production.");
  }
}

// B-1: Stripe key/mode mismatch — always fatal regardless of environment.
if (_stripeKey.startsWith("sk_live_") && process.env.STRIPE_MODE !== "live") {
  console.error("[startup] FATAL: STRIPE_SECRET_KEY is a live key but STRIPE_MODE is not 'live'. Refusing to start.");
  process.exit(1);
}
if (process.env.STRIPE_MODE === "live" && _stripeKey && !_stripeKey.startsWith("sk_live_")) {
  console.error("[startup] FATAL: STRIPE_MODE=live but STRIPE_SECRET_KEY is not a live key. Refusing to start.");
  process.exit(1);
}

// B-2: Test entitlements flag must never be on in live mode.
if (process.env.STRIPE_MODE === "live" && process.env.ALLOW_TEST_PAYMENT_ENTITLEMENTS === "true") {
  console.error("[startup] FATAL: ALLOW_TEST_PAYMENT_ENTITLEMENTS=true is not allowed when STRIPE_MODE=live.");
  process.exit(1);
}

// ── Beta configuration sanity checks ─────────────────────────────────────────
// These are warnings only — neither prevents the server from starting.

// B-3: Contradictory beta settings.
if (process.env.PRIVATE_BETA_ENABLED === "true" && process.env.PUBLIC_REGISTRATION_ENABLED === "true") {
  console.warn(
    "[startup] WARNING: PRIVATE_BETA_ENABLED=true is overridden by PUBLIC_REGISTRATION_ENABLED=true. " +
    "Beta gate is effectively DISABLED. Set PUBLIC_REGISTRATION_ENABLED=false to enforce the beta gate."
  );
}

// B-4: Beta Pro without beta mode — not an error, but worth noting.
if (process.env.BETA_PRO_ENABLED === "true" && process.env.PRIVATE_BETA_ENABLED !== "true") {
  console.info(
    "[startup] INFO: BETA_PRO_ENABLED=true while PRIVATE_BETA_ENABLED is not 'true'. " +
    "Beta Pro auto-unlock is active for open registration. This is intentional if you want " +
    "to reward early adopters without restricting new sign-ups."
  );
}

// B-5 (log): Print effective beta mode on startup so it's easy to verify in logs.
{
  const betaGateActive = process.env.PRIVATE_BETA_ENABLED === "true"
    && process.env.PUBLIC_REGISTRATION_ENABLED !== "true";
  const betaProActive = process.env.BETA_PRO_ENABLED === "true";
  if (betaGateActive || betaProActive) {
    console.info(
      `[startup] Beta config — gate:${betaGateActive ? "ON" : "OFF"} ` +
      `pro:${betaProActive ? `ON (${process.env.BETA_PRO_DURATION_DAYS || 30}d, grace ${process.env.BETA_INACTIVITY_GRACE_DAYS || 14}d)` : "OFF"}`
    );
  }
}

// ── Startup summary (safe — no secrets) ──────────────────────────────────────
const _azpList = config.clerkAuthorizedParties.length
  ? config.clerkAuthorizedParties.join(", ")
  : "(any — CLERK_AUTHORIZED_PARTIES not set)";
console.info(
  `[startup] env=${config.nodeEnv}${process.env.APP_ENV ? `/${process.env.APP_ENV}` : ""} | db=${_dbName || "(none)"} | frontend=${config.frontendUrl}`
);
console.info(`[startup] clerk.azp=${_azpList}`);
console.info(`[startup] cors=${config.corsOrigins.join(", ") || "(none)"}`);
