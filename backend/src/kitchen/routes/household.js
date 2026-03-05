import crypto from "crypto";
import express from "express";
import bcrypt from "bcryptjs";
import { Invitation } from "../models/Invitation.js";
import { KitchenUser } from "../models/KitchenUser.js";
import { requireAuth, requireRole } from "../middleware.js";
import { buildScopedFilter, getEffectiveHouseholdId, handleHouseholdError } from "../householdScope.js";
import {
  buildDisplayName,
  isValidEmail,
  normalizeEmail,
  normalizeInitials,
  normalizeColorId
} from "../../users/utils.js";
import { config } from "../../config.js";
import { Household } from "../models/Household.js";
import { ensureHouseholdInviteCode } from "../householdInviteCode.js";

const router = express.Router();

function hashToken(token) {
  return crypto.createHash("sha256").update(token).digest("hex");
}

router.get("/summary", requireAuth, async (req, res) => {
  try {
    const effectiveHouseholdId = getEffectiveHouseholdId(req.user);
    const household = await Household.findById(effectiveHouseholdId).select("_id name inviteCode ownerUserId").lean();
    if (!household) {
      return res.status(404).json({ ok: false, error: "No encontramos el hogar." });
    }
    return res.json({
      ok: true,
      household: {
        id: household._id,
        name: household.name || "Mi household",
        inviteCode: household.inviteCode || null,
        ownerUserId: household.ownerUserId || null
      }
    });
  } catch (error) {
    const handled = handleHouseholdError(res, error);
    if (handled) return handled;
    return res.status(500).json({ ok: false, error: "No se pudo cargar el household." });
  }
});

router.patch("/name", requireAuth, requireRole("owner"), async (req, res) => {
  try {
    const effectiveHouseholdId = getEffectiveHouseholdId(req.user);
    const nextName = String(req.body?.name || "").trim();
    if (!nextName) {
      return res.status(400).json({ ok: false, error: "El nombre del household es obligatorio." });
    }

    const household = await Household.findById(effectiveHouseholdId);
    if (!household) {
      return res.status(404).json({ ok: false, error: "No encontramos el hogar." });
    }

    household.name = nextName;
    await household.save();

    return res.json({
      ok: true,
      household: {
        id: household._id,
        name: household.name,
        inviteCode: household.inviteCode || null,
        ownerUserId: household.ownerUserId || null
      }
    });
  } catch (error) {
    const handled = handleHouseholdError(res, error);
    if (handled) return handled;
    return res.status(500).json({ ok: false, error: "No se pudo actualizar el nombre del household." });
  }
});

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
    const { displayName, initials, colorId } = req.body;
    const safeDisplayName = buildDisplayName({ displayName, name: displayName });
    if (!safeDisplayName) {
      return res.status(400).json({ ok: false, error: "El nombre del comensal es obligatorio." });
    }

    const effectiveHouseholdId = getEffectiveHouseholdId(req.user);
    const householdExists = await Household.exists({ _id: effectiveHouseholdId });
    if (!householdExists) {
      return res.status(404).json({ ok: false, error: "El household activo no existe." });
    }

    const suffix = crypto.randomBytes(6).toString("hex");
    const placeholder = await KitchenUser.create({
      username: `placeholder-${suffix}`,
      displayName: safeDisplayName,
      initials: normalizeInitials(initials, safeDisplayName),
      colorId: normalizeColorId(colorId),
      type: "placeholder",
      hasLogin: false,
      isPlaceholder: true,
      role: "member",
      householdId: effectiveHouseholdId,
      createdByUserId: req.kitchenUser?._id || null,
      passwordHash: null,
      email: undefined
    });

    return res.status(201).json({ ok: true, user: placeholder.toSafeJSON() });
  } catch (error) {
    console.error("[kitchen/household] create placeholder failed", {
      user: {
        id: req.user?.id || null,
        role: req.user?.role || null,
        globalRole: req.user?.globalRole || null,
        householdId: req.user?.householdId || null,
        activeHouseholdId: req.user?.activeHouseholdId || null
      },
      body: req.body,
      error: {
        name: error?.name,
        message: error?.message,
        code: error?.code,
        keyPattern: error?.keyPattern || null
      },
      stack: error?.stack
    });

    const handled = handleHouseholdError(res, error);
    if (handled) return handled;
    if (error?.name === "ValidationError" || error?.name === "CastError") {
      return res.status(400).json({ ok: false, error: "Datos de comensal no válidos." });
    }
    if (error?.code === 11000) {
      if (error?.keyPattern?.email) {
        return res.status(409).json({ ok: false, error: "No se pudo crear el comensal: email duplicado." });
      }
      return res.status(409).json({ ok: false, error: "No se pudo crear el comensal: conflicto de datos únicos." });
    }
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
    if (password && String(password).length < 8) {
      return res.status(400).json({ ok: false, error: "La contraseña debe tener al menos 8 caracteres." });
    }

    const effectiveHouseholdId = getEffectiveHouseholdId(req.user);
    const placeholder = await KitchenUser.findOne(
      buildScopedFilter(effectiveHouseholdId, { _id: req.params.id, isPlaceholder: true })
    );

    if (!placeholder) {
      return res.status(404).json({ ok: false, error: "No encontramos ese comensal." });
    }

    const emailInUse = await KitchenUser.findOne({ email: normalizedEmail, _id: { $ne: placeholder._id } });
    if (emailInUse) {
      return res.status(409).json({ ok: false, error: "Ese email ya está en uso por otra cuenta." });
    }

    placeholder.email = normalizedEmail;
    placeholder.username = normalizedEmail;
    if (password) {
      placeholder.passwordHash = await bcrypt.hash(password, 10);
    } else {
      const generatedPassword = crypto.randomBytes(24).toString("hex");
      placeholder.passwordHash = await bcrypt.hash(generatedPassword, 10);
    }
    placeholder.type = "user";
    placeholder.hasLogin = true;
    placeholder.isPlaceholder = false;
    placeholder.claimedAt = new Date();
    await placeholder.save();

    return res.json({ ok: true, user: placeholder.toSafeJSON() });
  } catch (error) {
    const handled = handleHouseholdError(res, error);
    if (handled) return handled;
    if (error?.name === "ValidationError" || error?.name === "CastError") {
      return res.status(400).json({ ok: false, error: "Datos de conversión no válidos." });
    }
    if (error?.code === 11000 && error?.keyPattern?.email) {
      return res.status(409).json({ ok: false, error: "Ese email ya está en uso por otra cuenta." });
    }
    console.error("[kitchen/household] convert placeholder failed", {
      userId: req.user?.id || null,
      placeholderId: req.params.id,
      body: req.body,
      error: error?.message,
      stack: error?.stack
    });
    return res.status(500).json({ ok: false, error: "No se pudo convertir el comensal." });
  }
});

export default router;
