import express from "express";
import { requireAuth, requireDiod } from "../middleware.js";
import { BetaInvite } from "../models/BetaInvite.js";
import { isBetaModeEnabled, checkBetaAccess, createBetaInvite, buildBetaInviteLink, getBetaInviteStatus } from "../betaService.js";
import { sendEmail } from "../../services/emailService.js";
import { config } from "../../config.js";
import { isValidEmail, normalizeEmail } from "../../users/utils.js";

const router = express.Router();

// ── Public endpoints ─────────────────────────────────────────────────────────

router.get("/status", (_req, res) => {
  res.json({ ok: true, betaEnabled: isBetaModeEnabled() });
});

router.get("/validate", async (req, res) => {
  try {
    const token = String(req.query.token || "").trim();
    if (!token) return res.json({ ok: true, valid: false, betaEnabled: isBetaModeEnabled() });

    const invite = await BetaInvite.findOne({ token }).select("email status expiresAt").lean();
    if (!invite) return res.json({ ok: true, valid: false, betaEnabled: isBetaModeEnabled() });

    const expired = invite.expiresAt && invite.expiresAt < new Date();
    const active = (invite.status === "pending" || invite.status === "sent") && !expired;

    res.json({
      ok: true,
      valid: active,
      betaEnabled: isBetaModeEnabled(),
      email: active ? invite.email : null,
      status: expired ? "expired" : invite.status,
    });
  } catch (err) {
    res.status(500).json({ ok: false, error: "Error al validar la invitación." });
  }
});

// ── Admin endpoints ───────────────────────────────────────────────────────────

router.use(requireAuth, requireDiod);

router.get("/admin/invites", async (req, res) => {
  try {
    const { status, page = 1, limit = 100 } = req.query;
    const query = {};
    if (status) query.status = status;

    const invites = await BetaInvite.find(query)
      .sort({ createdAt: -1 })
      .skip((Number(page) - 1) * Number(limit))
      .limit(Number(limit))
      .lean();

    const total = await BetaInvite.countDocuments(query);

    const invitesWithMeta = invites.map((inv) => ({
      ...inv,
      computedStatus: getBetaInviteStatus(inv),
      link: buildBetaInviteLink(inv.token),
    }));

    res.json({ ok: true, invites: invitesWithMeta, total, betaEnabled: isBetaModeEnabled() });
  } catch (err) {
    res.status(500).json({ ok: false, error: "Error al listar invitaciones." });
  }
});

router.post("/admin/invites", async (req, res) => {
  try {
    const { email, emails, expiresInDays = 30, note = "" } = req.body;
    const adminId = req.kitchenUser?.id || null;

    const emailList = emails
      ? (Array.isArray(emails) ? emails : String(emails).split(/[\n,;]+/))
          .map((e) => normalizeEmail(e))
          .filter((e) => e && isValidEmail(e))
      : email
        ? [normalizeEmail(email)].filter((e) => e && isValidEmail(e))
        : [];

    if (emailList.length === 0) {
      return res.status(400).json({ ok: false, error: "Se requiere al menos un email válido." });
    }

    const results = [];
    for (const em of emailList) {
      try {
        const { invite, link } = await createBetaInvite({
          email: em,
          expiresInDays: Number(expiresInDays) || 30,
          createdByAdminId: adminId,
          note,
        });

        let sent = false;
        try {
          await sendEmail({
            to: em,
            subject: "Tu invitación a la beta privada de Lunchfy",
            html: `
              <p>Has sido invitado a la beta privada de Lunchfy.</p>
              <p><a href="${link}" style="display:inline-block;padding:10px 20px;background:#4338ca;color:#fff;border-radius:6px;text-decoration:none">Acceder a la beta</a></p>
              <p style="color:#6b7280;font-size:13px">El enlace es de un solo uso y expira en ${expiresInDays} días.</p>
            `,
          });
          await BetaInvite.findByIdAndUpdate(invite._id, { status: "sent", sentAt: new Date() });
          sent = true;
        } catch (_emailErr) {
          // Email failed — invite stays "pending", admin can copy link manually
        }

        results.push({ email: em, link, inviteId: invite._id.toString(), sent });
      } catch (inviteErr) {
        results.push({ email: em, error: inviteErr.message });
      }
    }

    res.status(201).json({ ok: true, results });
  } catch (err) {
    res.status(500).json({ ok: false, error: "Error al crear invitación." });
  }
});

router.post("/admin/invites/:id/revoke", async (req, res) => {
  try {
    const invite = await BetaInvite.findById(req.params.id);
    if (!invite) return res.status(404).json({ ok: false, error: "Invitación no encontrada." });
    if (invite.status === "used") return res.status(409).json({ ok: false, error: "La invitación ya fue usada." });

    await BetaInvite.findByIdAndUpdate(invite._id, { status: "revoked" });
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ ok: false, error: "Error al revocar invitación." });
  }
});

router.post("/admin/invites/:id/resend", async (req, res) => {
  try {
    const invite = await BetaInvite.findById(req.params.id);
    if (!invite) return res.status(404).json({ ok: false, error: "Invitación no encontrada." });
    if (invite.status === "used") return res.status(409).json({ ok: false, error: "La invitación ya fue usada." });
    if (invite.status === "revoked") return res.status(409).json({ ok: false, error: "La invitación está revocada." });

    const link = buildBetaInviteLink(invite.token);
    const expiresInDays = Math.ceil((new Date(invite.expiresAt) - new Date()) / (24 * 60 * 60 * 1000));

    try {
      await sendEmail({
        to: invite.email,
        subject: "Tu invitación a la beta privada de Lunchfy",
        html: `
          <p>Has sido invitado a la beta privada de Lunchfy.</p>
          <p><a href="${link}" style="display:inline-block;padding:10px 20px;background:#4338ca;color:#fff;border-radius:6px;text-decoration:none">Acceder a la beta</a></p>
          <p style="color:#6b7280;font-size:13px">El enlace es de un solo uso y expira en ${expiresInDays > 0 ? expiresInDays : 0} días.</p>
        `,
      });
      await BetaInvite.findByIdAndUpdate(invite._id, { status: "sent", sentAt: new Date() });
      res.json({ ok: true, sent: true });
    } catch (_emailErr) {
      res.json({ ok: true, sent: false, message: "Email no configurado. Copia el enlace manualmente." });
    }
  } catch (err) {
    res.status(500).json({ ok: false, error: "Error al reenviar invitación." });
  }
});

export default router;
