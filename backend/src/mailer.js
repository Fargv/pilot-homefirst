import nodemailer from "nodemailer";
import { config } from "./config.js";

export function createTransport() {
  if (!config.brevo.user || !config.brevo.pass) {
    throw new Error("Faltan credenciales SMTP de Brevo (BREVO_SMTP_USER / BREVO_SMTP_PASS).");
  }

  return nodemailer.createTransport({
    host: config.brevo.host,
    port: config.brevo.port,
    secure: false,
    auth: {
      user: config.brevo.user,
      pass: config.brevo.pass
    }
  });
}

export async function sendTestEmail({ to }) {
  const transporter = createTransport();

  const info = await transporter.sendMail({
    from: config.mailFrom,
    to,
    subject: "Pilot test ✅",
    text: "Si lees esto, Brevo SMTP funciona.",
    html: "<p>Si lees esto, <b>Brevo SMTP</b> funciona ✅</p>"
  });

  return info.messageId;
}
