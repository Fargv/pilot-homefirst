import crypto from "crypto";
import express from "express";
import bcrypt from "bcryptjs";
import { Invitation } from "../models/Invitation.js";
import { KitchenUser } from "../models/KitchenUser.js";
import { requireAuth, requireRole } from "../middleware.js";
import { buildScopedFilter, getEffectiveHouseholdId, handleHouseholdError } from "../householdScope.js";
import { buildDisplayName, isValidEmail, normalizeEmail } from "../../users/utils.js";
import { config } from "../../config.js";
import { Household } from "../models/Household.js";
import { ensureHouseholdInviteCode } from "../householdInviteCode.js";

const router = express.Router();

function hashToken(token) {
  return crypto.createHash("sha256").update(token).digest("hex");
}


router.get("/invite-code", requireAuth, requireRole("owner"), async (req, res) => {
  try {
    const effectiveHouseholdId = getEffectiveHouseholdId(req.user);
    const household = await Household.findById(effectiveHouseholdId).select("inviteCode");
    if (!household) {
      return res.status(404).json({ ok: false, error: "No encontramos el hogar." });
    }
    return res.json({ ok: true, inviteCode: household.inviteCode || null });
  } catch (error) {
    const handled = handleHouseholdError(res, error);
    if (handled) return handled;
    return res.status(500).json({ ok: false, error: "No se pudo cargar el código del hogar." });
  }
});

router.post("/invite-code", requireAuth, requireRole("owner"), async (req, res) => {
  try {
    const effectiveHouseholdId = getEffectiveHouseholdId(req.user);
    const household = await Household.findById(effectiveHouseholdId);
    if (!household) {
      return res.status(404).json({ ok: false, error: "No encontramos el hogar." });
    }

    const inviteCode = await ensureHouseholdInviteCode(household);
    return res.status(201).json({ ok: true, inviteCode });
  } catch (error) {
    const handled = handleHouseholdError(res, error);
    if (handled) return handled;
    return res.status(500).json({ ok: false, error: "No se pudo generar el código del hogar." });
  }
});

router.post("/invitations", requireAuth, requireRole("owner"), async (req, res) => {
  try {
    const effectiveHouseholdId = getEffectiveHouseholdId(req.user);
    const rawToken = crypto.randomBytes(32).toString("hex");
    const tokenHash = hashToken(rawToken);
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

    await Invitation.create({
      householdId: effectiveHouseholdId,
      tokenHash,
      role: "member",
      createdByUserId: req.kitchenUser._id,
      expiresAt
    });

    const frontendBaseUrl = String(config.frontendUrl || "").replace(/\/$/, "");
    const inviteLink = `${frontendBaseUrl}/invite/${rawToken}`;
    return res.status(201).json({ ok: true, inviteLink, token: rawToken, expiresAt });
  } catch (error) {
    const handled = handleHouseholdError(res, error);
    if (handled) return handled;
    return res.status(500).json({ ok: false, error: "No se pudo crear la invitación." });
  }
});

router.get("/invitations", requireAuth, requireRole("owner"), async (req, res) => {
  try {
    const effectiveHouseholdId = getEffectiveHouseholdId(req.user);
    const now = new Date();
    const invitations = await Invitation.find(
      buildScopedFilter(effectiveHouseholdId, {
        usedAt: null,
        expiresAt: { $gt: now }
      })
    )
      .sort({ createdAt: -1 })
      .lean();

    return res.json({
      ok: true,
      invitations: invitations.map((invitation) => ({
        id: invitation._id,
        role: invitation.role,
        expiresAt: invitation.expiresAt,
        createdAt: invitation.createdAt
      }))
    });
  } catch (error) {
    const handled = handleHouseholdError(res, error);
    if (handled) return handled;
    return res.status(500).json({ ok: false, error: "No se pudieron cargar las invitaciones." });
  }
});

router.post("/placeholders", requireAuth, requireRole("owner"), async (req, res) => {
  try {
    const { displayName } = req.body;
    const safeDisplayName = buildDisplayName({ displayName, name: displayName });
    if (!safeDisplayName) {
      return res.status(400).json({ ok: false, error: "El nombre del comensal es obligatorio." });
    }

    const effectiveHouseholdId = getEffectiveHouseholdId(req.user);
    const suffix = crypto.randomBytes(6).toString("hex");
    const placeholder = await KitchenUser.create({
      username: `placeholder-${suffix}`,
      displayName: safeDisplayName,
      isPlaceholder: true,
      role: "member",
      householdId: effectiveHouseholdId,
      passwordHash: null,
      email: null
    });

    return res.status(201).json({ ok: true, user: placeholder.toSafeJSON() });
  } catch (error) {
    const handled = handleHouseholdError(res, error);
    if (handled) return handled;
    return res.status(500).json({ ok: false, error: "No se pudo crear el comensal." });
  }
});

router.post("/placeholders/:id/convert", requireAuth, requireRole("owner"), async (req, res) => {
  try {
    const { email, password } = req.body;
    const normalizedEmail = normalizeEmail(email);
    if (!normalizedEmail || !isValidEmail(normalizedEmail)) {
      return res.status(400).json({ ok: false, error: "Debes indicar un email válido." });
    }
    if (String(password || "").length < 8) {
      return res.status(400).json({ ok: false, error: "La contraseña debe tener al menos 8 caracteres." });
    }

    const effectiveHouseholdId = getEffectiveHouseholdId(req.user);
    const placeholder = await KitchenUser.findOne(
      buildScopedFilter(effectiveHouseholdId, { _id: req.params.id, isPlaceholder: true })
    );

    if (!placeholder) {
      return res.status(404).json({ ok: false, error: "No encontramos ese usuario placeholder." });
    }

    const emailInUse = await KitchenUser.findOne({ email: normalizedEmail, _id: { $ne: placeholder._id } });
    if (emailInUse) {
      return res.status(409).json({ ok: false, error: "Ese email ya está en uso por otra cuenta." });
    }

    placeholder.email = normalizedEmail;
    placeholder.username = normalizedEmail;
    placeholder.passwordHash = await bcrypt.hash(password, 10);
    placeholder.isPlaceholder = false;
    placeholder.claimedAt = new Date();
    await placeholder.save();

    return res.json({ ok: true, user: placeholder.toSafeJSON() });
  } catch (error) {
    const handled = handleHouseholdError(res, error);
    if (handled) return handled;
    return res.status(500).json({ ok: false, error: "No se pudo convertir el comensal." });
  }
});

export default router;
