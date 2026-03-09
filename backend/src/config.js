import dotenv from "dotenv";

dotenv.config();

export const config = {
  nodeEnv: process.env.NODE_ENV || "development",
  port: Number(process.env.PORT || 3000),

  mongodbUri: process.env.MONGODB_URI,

  corsOrigin: process.env.CORS_ORIGIN || "http://localhost:5173",
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
  resetPasswordTokenSecret:
    process.env.RESET_PASSWORD_TOKEN_SECRET || "dev-reset-password-token-secret",

  brevo: {
    apiKey: process.env.BREVO_API_KEY
  },

  mailFrom: process.env.EMAIL_FROM || process.env.MAIL_FROM || "Pilot <no-reply@example.com>"
};

if (!config.mongodbUri) {
  console.warn("Warning: MONGODB_URI is missing.");
}
