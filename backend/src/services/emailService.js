import { BrevoClient } from "@getbrevo/brevo";
import { config } from "../config.js";

function parseSender(fromValue) {
  const trimmed = String(fromValue || "").trim();
  const match = trimmed.match(/^(.*)<([^>]+)>$/);

  if (match) {
    const name = match[1].trim().replace(/^"|"$/g, "");
    const email = match[2].trim();
    return name ? { name, email } : { email };
  }

  return { email: trimmed };
}

function normalizeRecipients(to) {
  const recipients = Array.isArray(to) ? to : [to];

  return recipients
    .filter(Boolean)
    .map((recipient) => {
      if (typeof recipient === "string") {
        return { email: recipient.trim() };
      }

      if (recipient && typeof recipient.email === "string") {
        return {
          email: recipient.email.trim(),
          ...(recipient.name ? { name: recipient.name } : {})
        };
      }

      return null;
    })
    .filter((recipient) => recipient?.email);
}

let brevoClient;

function getBrevoClient() {
  if (!config.brevo.apiKey) {
    throw new Error("Missing BREVO_API_KEY environment variable.");
  }

  if (!brevoClient) {
    brevoClient = new BrevoClient({
      apiKey: config.brevo.apiKey,
      timeoutInSeconds: 30,
      maxRetries: 2
    });
  }

  return brevoClient;
}

export async function sendEmail({ to, subject, html }) {
  const recipients = normalizeRecipients(to);
  const sender = parseSender(config.mailFrom);

  if (!sender.email) {
    throw new Error("Missing EMAIL_FROM environment variable.");
  }

  if (!recipients.length) {
    throw new Error("sendEmail requires at least one recipient in 'to'.");
  }

  if (!subject || !String(subject).trim()) {
    throw new Error("sendEmail requires a non-empty 'subject'.");
  }

  if (!html || !String(html).trim()) {
    throw new Error("sendEmail requires a non-empty 'html' body.");
  }

  try {
    console.log("[emailService] Sending transactional email", {
      to: recipients.map((recipient) => recipient.email),
      subject: String(subject)
    });

    const response = await getBrevoClient().transactionalEmails.sendTransacEmail({
      sender,
      to: recipients,
      subject: String(subject),
      htmlContent: String(html)
    });

    const messageId = response?.messageId || response?.messageIds?.[0] || null;

    console.log("[emailService] Transactional email sent", {
      to: recipients.map((recipient) => recipient.email),
      subject: String(subject),
      messageId
    });

    return response;
  } catch (error) {
    console.error("[emailService] Failed to send transactional email", {
      to: recipients.map((recipient) => recipient.email),
      subject: String(subject),
      message: error?.message,
      statusCode: error?.statusCode,
      body: error?.body
    });
    throw error;
  }
}
