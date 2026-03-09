import { sendEmail } from "./services/emailService.js";

export async function sendTestEmail({ to }) {
  const response = await sendEmail({
    to,
    subject: "Pilot test",
    html: "<p>If you can read this, <b>Brevo transactional email</b> is working.</p>"
  });

  return response?.messageId || response?.messageIds?.[0] || null;
}
