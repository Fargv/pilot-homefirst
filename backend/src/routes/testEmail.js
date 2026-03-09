import { Router } from "express";
import { sendEmail } from "../services/emailService.js";

const router = Router();

router.post("/test-email", async (req, res) => {
  const { to } = req.body ?? {};

  if (!to || !String(to).trim()) {
    console.warn("[testEmail] Missing 'to' in request body");
    return res.status(400).json({
      success: false,
      message: "Missing 'to' in request body."
    });
  }

  try {
    console.log("[testEmail] Sending Brevo test email", { to: String(to).trim() });

    await sendEmail({
      to: String(to).trim(),
      subject: "HomeFirst test email",
      html: `
        <div style="font-family: Arial, sans-serif; color: #1f2937; line-height: 1.6;">
          <h2 style="margin-bottom: 16px;">HomeFirst test email</h2>
          <p>This is a test email from HomeFirst.</p>
          <p>Brevo transactional email sending is configured and working correctly.</p>
        </div>
      `
    });

    console.log("[testEmail] Brevo test email sent", { to: String(to).trim() });

    return res.json({
      success: true,
      message: "Test email sent successfully."
    });
  } catch (error) {
    console.error("[testEmail] Failed to send Brevo test email", {
      to: String(to).trim(),
      message: error?.message,
      statusCode: error?.statusCode
    });

    return res.status(500).json({
      success: false,
      message: error?.message || "Failed to send test email."
    });
  }
});

export default router;
