function escapeHtml(value) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export function buildHouseholdInvitationEmail({
  householdName,
  inviteLink,
  inviteCode,
  inviterName,
  recipientEmail
}) {
  const safeHouseholdName = escapeHtml(householdName || "your household");
  const safeInviteLink = escapeHtml(inviteLink || "");
  const safeInviteCode = escapeHtml(inviteCode || "");
  const safeInviterName = escapeHtml(inviterName || "Someone from HomeFirst");
  const safeRecipientEmail = escapeHtml(recipientEmail || "");

  return `
    <div style="margin:0;padding:32px 16px;background:#f4f7ff;font-family:Arial,sans-serif;color:#1f2937;">
      <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="border-collapse:collapse;">
        <tr>
          <td align="center">
            <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="width:100%;max-width:620px;border-collapse:collapse;">
              <tr>
                <td style="padding-bottom:18px;text-align:center;">
                  <div style="display:inline-block;padding:10px 18px;border-radius:999px;background:#e8eeff;color:#3147b8;font-size:12px;font-weight:700;letter-spacing:0.08em;text-transform:uppercase;">
                    HomeFirst
                  </div>
                </td>
              </tr>
              <tr>
                <td style="background:#ffffff;border:1px solid #dde5ff;border-radius:28px;padding:0;box-shadow:0 16px 40px rgba(45,67,150,0.12);overflow:hidden;">
                  <div style="padding:32px 32px 20px;background:linear-gradient(135deg,#f8fbff 0%,#eef2ff 100%);border-bottom:1px solid #e8ecfb;">
                    <p style="margin:0 0 12px;font-size:13px;line-height:1.6;color:#586474;">${safeInviterName} invited ${safeRecipientEmail || "you"} to join</p>
                    <h1 style="margin:0 0 12px;font-size:30px;line-height:1.15;color:#182230;">Welcome to ${safeHouseholdName}</h1>
                    <p style="margin:0;font-size:15px;line-height:1.7;color:#475467;">
                      Your seat at the table is ready. A tiny bit more organized, a tiny bit more delicious.
                    </p>
                  </div>
                  <div style="padding:28px 32px 10px;">
                    <h2 style="margin:0 0 10px;font-size:18px;line-height:1.4;color:#182230;">Option 1: join with one click</h2>
                    <p style="margin:0 0 18px;font-size:15px;line-height:1.7;color:#475467;">
                      Click the button below to open your HomeFirst invitation. If you do not have an account yet, we will guide you through signup and connect you to the right household automatically.
                    </p>
                    <table role="presentation" cellspacing="0" cellpadding="0" style="border-collapse:collapse;margin:0 0 16px;">
                      <tr>
                        <td style="border-radius:999px;background:#3f5bd8;text-align:center;">
                          <a href="${safeInviteLink}" style="display:inline-block;padding:14px 24px;color:#ffffff;text-decoration:none;font-size:15px;font-weight:700;">
                            Join this household
                          </a>
                        </td>
                      </tr>
                    </table>
                    <p style="margin:0 0 8px;font-size:13px;line-height:1.6;color:#667085;">
                      If the button does not open, use this link:
                    </p>
                    <p style="margin:0 0 26px;font-size:13px;line-height:1.6;word-break:break-word;">
                      <a href="${safeInviteLink}" style="color:#3f5bd8;text-decoration:underline;">${safeInviteLink}</a>
                    </p>
                    <div style="border-top:1px solid #edf1ff;padding-top:24px;">
                      <h2 style="margin:0 0 10px;font-size:18px;line-height:1.4;color:#182230;">Option 2: sign up manually with this household code</h2>
                      <p style="margin:0 0 16px;font-size:15px;line-height:1.7;color:#475467;">
                        Prefer the scenic route? Create your account in HomeFirst and enter this code during signup:
                      </p>
                      <div style="display:inline-block;padding:14px 18px;border-radius:18px;background:#f5f7ff;border:1px solid #d8e1ff;font-size:24px;letter-spacing:0.22em;font-weight:800;color:#22304a;">
                        ${safeInviteCode}
                      </div>
                    </div>
                    <p style="margin:24px 0 0;font-size:13px;line-height:1.6;color:#667085;">
                      Both options lead to the same household, so choose whichever feels easiest.
                    </p>
                  </div>
                  <div style="padding:18px 32px 28px;">
                    <p style="margin:0;font-size:12px;line-height:1.7;color:#98a2b3;">
                      Sent by HomeFirst. This mailbox is not monitored, but the household probably is.
                    </p>
                  </div>
                </td>
              </tr>
            </table>
          </td>
        </tr>
      </table>
    </div>
  `;
}
