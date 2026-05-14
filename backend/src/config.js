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
    allowTestEntitlements: process.env.ALLOW_TEST_PAYMENT_ENTITLEMENTS === "true"
  }
};

config.corsOrigins = parseOriginList(
  process.env.CORS_ORIGIN,
  process.env.APP_URL,
  process.env.FRONTEND_URL,
  "http://localhost:5173"
);
config.corsOrigin = config.corsOrigins[0] || "http://localhost:5173";

if (!config.mongodbUri) {
  console.warn("Warning: MONGODB_URI is missing.");
}
