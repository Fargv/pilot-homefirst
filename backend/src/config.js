import dotenv from "dotenv";
dotenv.config();

export const config = {
  nodeEnv: process.env.NODE_ENV || "development",
  port: Number(process.env.PORT || 3000),

  mongodbUri: process.env.MONGODB_URI,

  corsOrigin: process.env.CORS_ORIGIN || "http://localhost:5173",

  jwtSecret: process.env.JWT_SECRET || "dev-kitchen-secret",

  brevo: {
    host: process.env.BREVO_SMTP_HOST || "smtp-relay.brevo.com",
    port: Number(process.env.BREVO_SMTP_PORT || 587),
    user: process.env.BREVO_SMTP_USER,
    pass: process.env.BREVO_SMTP_PASS
  },

  mailFrom: process.env.MAIL_FROM || "Pilot <no-reply@example.com>"
};

if (!config.mongodbUri) {
  console.warn("⚠️ Falta MONGODB_URI (configuración pendiente).");
}
