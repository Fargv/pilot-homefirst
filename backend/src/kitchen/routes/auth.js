import express from "express";
import crypto from "crypto";
import bcrypt from "bcryptjs";
import { KitchenUser } from "../models/KitchenUser.js";
import { Invitation } from "../models/Invitation.js";
import { Household } from "../models/Household.js";
import { createToken, requireAuth } from "../middleware.js";
import { buildDisplayName, isValidEmail, normalizeEmail, normalizeInitials } from "../../users/utils.js";
import { generateUniqueHouseholdInviteCode, isValidInviteCodeFormat } from "../householdInviteCode.js";
import { getWeekStart } from "../utils/dates.js";
import { ensureWeekPlan } from "../weekPlanService.js";

const DIOD_EMAIL = "admin@admin.com";

const router = express.Router();


function hashInviteToken(token) {
  return crypto.createHash("sha256").update(token).digest("hex");
}

async function findActiveInvitationByToken(token) {
  return Invitation.findOne({
    tokenHash: hashInviteToken(token),
    usedAt: null,
    expiresAt: { $gt: new Date() }
  });
}

router.get("/invite/:token", async (req, res) => {
  try {
    const { token } = req.params;
    if (!token) {
      return res.status(400).json({ ok: false, error: "Token de invitaciÃ³n invÃ¡lido." });
    }

    const invitation = await findActiveInvitationByToken(token);
    if (!invitation) {
      return res.status(404).json({ ok: false, error: "La invitaciÃ³n no es vÃ¡lida o expirÃ³." });
    }

    const household = await Household.findById(invitation.householdId).select("name");
    return res.json({
      ok: true,
      role: invitation.role,
      householdName: household?.name || "",
      expiresAt: invitation.expiresAt
    });
  } catch (error) {
    return res.status(500).json({ ok: false, error: "No se pudo validar la invitaciÃ³n." });
  }
});


router.post("/login", async (req, res) => {
  try {
    const { email, password, username } = req.body;
    const loginValue = normalizeEmail(email || username);
    if (!loginValue || !password) {
      return res.status(400).json({ ok: false, error: "Email y contraseÃ±a son obligatorios." });
    }

    const user = await KitchenUser.findOne({ email: loginValue });
    if (!user) return res.status(401).json({ ok: false, error: "Credenciales invÃ¡lidas." });

    if (!user.passwordHash || user.isPlaceholder || user.type === "placeholder" || user.hasLogin === false) {
      return res.status(401).json({ ok: false, error: "Credenciales invÃ¡lidas." });
    }

    const ok = await bcrypt.compare(password, user.passwordHash);
    if (!ok) return res.status(401).json({ ok: false, error: "Credenciales invÃ¡lidas." });

    const isDiod = loginValue === DIOD_EMAIL;
    const shouldUpdateGlobalRole = (isDiod && user.globalRole !== "diod") || (!isDiod && user.globalRole);
    if (shouldUpdateGlobalRole) {
      user.globalRole = isDiod ? "diod" : null;
      await user.save();
    }

    const token = createToken(user);
    const safeUser = {
      ...user.toSafeJSON(),
      migrationPending: !user.householdId
    };
    return res.json({ ok: true, token, user: safeUser });
  } catch (error) {
    return res.status(500).json({ ok: false, error: "No se pudo iniciar sesiÃ³n." });
  }
});


router.get("/resolve-household/:inviteCode", async (req, res) => {
  try {
    const inviteCode = String(req.params.inviteCode || "").trim();
    if (!isValidInviteCodeFormat(inviteCode)) {
      return res.status(400).json({ ok: false, error: "El cÃ³digo debe tener 6 dÃ­gitos numÃ©ricos." });
    }

    const household = await Household.findOne({ inviteCode }).select("_id name");
    if (!household) {
      return res.status(404).json({ ok: false, error: "El cÃ³digo del hogar no es vÃ¡lido." });
    }

    return res.json({
      ok: true,
      household: {
        id: household._id,
        name: household.name
      }
    });
  } catch (error) {
    return res.status(500).json({ ok: false, error: "No se pudo validar el cÃ³digo del hogar." });
  }
});

router.post("/register", async (req, res) => {
  try {
    const { email, password, displayName, householdName, inviteCode } = req.body;
    const normalizedEmail = normalizeEmail(email);
    const safeDisplayName = buildDisplayName({ displayName, name: displayName });
    const normalizedInviteCode = String(inviteCode || "").trim();

    if (!normalizedEmail || !password || !safeDisplayName) {
      return res.status(400).json({ ok: false, error: "Nombre, email y contraseÃ±a son obligatorios." });
    }

    if (!isValidEmail(normalizedEmail)) {
      return res.status(400).json({ ok: false, error: "El email no es vÃ¡lido." });
    }

    if (String(password).length < 8) {
      return res.status(400).json({ ok: false, error: "La contraseÃ±a debe tener al menos 8 caracteres." });
    }

    const existingUser = await KitchenUser.findOne({ email: normalizedEmail });
    if (existingUser) {
      return res.status(409).json({ ok: false, error: "El email ya estÃ¡ registrado." });
    }

    const mode = normalizedInviteCode ? "join" : "create";
    let household = null;
    let role = "owner";

    if (mode === "join") {
      if (!isValidInviteCodeFormat(normalizedInviteCode)) {
        return res.status(400).json({ ok: false, error: "El cÃ³digo debe tener 6 dÃ­gitos numÃ©ricos." });
      }

      household = await Household.findOne({ inviteCode: normalizedInviteCode });
      if (!household) {
        return res.status(404).json({ ok: false, error: "El cÃ³digo del hogar no es vÃ¡lido." });
      }
      role = "member";
    }

    const user = await KitchenUser.create({
      username: normalizedEmail,
      email: normalizedEmail,
      displayName: safeDisplayName,
      initials: normalizeInitials("", safeDisplayName),
      passwordHash: await bcrypt.hash(password, 10),
      type: "user",
      hasLogin: true,
      role,
      householdId: null,
      isPlaceholder: false
    });

    if (mode === "create") {
      const finalHouseholdName = String(householdName || "").trim() || `${safeDisplayName} - Hogar`;
      household = await Household.create({
        name: finalHouseholdName,
        ownerUserId: user._id,
        inviteCode: await generateUniqueHouseholdInviteCode()
      });
    }

    user.householdId = household._id;
    await user.save();

    if (mode === "create") {
      try {
        await ensureWeekPlan(getWeekStart(new Date()), household._id.toString());
      } catch (error) {
        console.error("No se pudo crear automÃ¡ticamente el plan semanal durante el registro:", error?.message || error);
      }
    }

    const token = createToken(user);
    return res.status(201).json({
      ok: true,
      token,
      user: user.toSafeJSON(),
      household: {
        id: household._id,
        name: household.name,
        inviteCode: household.inviteCode || null
      }
    });
  } catch (error) {
    if (error?.code === 11000) {
      return res.status(409).json({ ok: false, error: "No se pudo completar el registro. Intenta nuevamente." });
    }
    return res.status(500).json({ ok: false, error: "No se pudo completar el registro." });
  }
});

router.post("/accept-invite", async (req, res) => {
  try {
    const { token, email, password, displayName } = req.body;
    const normalizedEmail = normalizeEmail(email);

    if (!token || !normalizedEmail || !password) {
      return res.status(400).json({
        ok: false,
        error: "Token, email y contraseÃ±a son obligatorios."
      });
    }

    if (String(password).length < 8) {
      return res.status(400).json({ ok: false, error: "La contraseÃ±a debe tener al menos 8 caracteres." });
    }

    const invitation = await findActiveInvitationByToken(token);

    if (!invitation) {
      return res.status(400).json({ ok: false, error: "La invitaciÃ³n no es vÃ¡lida o expirÃ³." });
    }

    let user = await KitchenUser.findOne({ email: normalizedEmail });

    if (user) {
      if (user.householdId && user.householdId.toString() !== invitation.householdId.toString()) {
        return res.status(409).json({
          ok: false,
          error: "Ese email ya pertenece a otro hogar y no se puede unir con esta invitaciÃ³n."
        });
      }

      if (!user.householdId) {
        user.householdId = invitation.householdId;
      }

      if (!user.passwordHash || user.isPlaceholder || user.type === "placeholder" || user.hasLogin === false) {
        if (!displayName || !String(displayName).trim()) {
          return res.status(400).json({ ok: false, error: "El nombre para mostrar es obligatorio para activar la cuenta." });
        }
        user.displayName = String(displayName).trim();
        user.passwordHash = await bcrypt.hash(password, 10);
        user.type = "user";
        user.hasLogin = true;
      } else {
        const passwordOk = await bcrypt.compare(password, user.passwordHash);
        if (!passwordOk) {
          return res.status(401).json({ ok: false, error: "Credenciales invÃ¡lidas." });
        }
      }

      if (user.isPlaceholder) {
        user.isPlaceholder = false;
        user.claimedAt = new Date();
        user.type = "user";
        user.hasLogin = true;
      }

      if (displayName && String(displayName).trim()) {
        user.displayName = String(displayName).trim();
        user.initials = normalizeInitials(user.initials, user.displayName);
      }

      user.role = invitation.role || "member";
      await user.save();
    } else {
      if (!displayName || !String(displayName).trim()) {
        return res.status(400).json({ ok: false, error: "El nombre para mostrar es obligatorio para crear la cuenta." });
      }

      user = await KitchenUser.create({
        username: normalizedEmail,
        email: normalizedEmail,
        displayName: String(displayName).trim(),
        initials: normalizeInitials("", String(displayName).trim()),
        passwordHash: await bcrypt.hash(password, 10),
        type: "user",
        hasLogin: true,
        role: invitation.role || "member",
        householdId: invitation.householdId,
        isPlaceholder: false
      });
    }

    invitation.usedAt = new Date();
    invitation.usedByUserId = user._id;
    await invitation.save();

    const jwt = createToken(user);
    return res.json({ ok: true, token: jwt, user: user.toSafeJSON() });
  } catch (error) {
    return res.status(500).json({ ok: false, error: "No se pudo aceptar la invitaciÃ³n." });
  }
});

router.post("/logout", (req, res) => {
  res.json({ ok: true });
});

router.get("/me", requireAuth, async (req, res) => {
  try {
    let householdName = null;
    const effectiveHouseholdId = req.user?.activeHouseholdId || req.user?.householdId || null;
    if (effectiveHouseholdId) {
      const household = await Household.findById(effectiveHouseholdId).select("name").lean();
      householdName = household?.name || null;
    }

    res.json({
      ok: true,
      user: {
        ...req.kitchenUser.toSafeJSON(),
        migrationPending: !req.kitchenUser.householdId,
        householdName
      },
      auth: req.user
    });
  } catch {
    return res.status(500).json({ ok: false, error: "No se pudo cargar el perfil." });
  }
});

export default router;


