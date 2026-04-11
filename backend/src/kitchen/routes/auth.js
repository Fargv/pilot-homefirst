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
import { sendEmail } from "../../services/emailService.js";
import { config } from "../../config.js";
import { findActiveInvitationByToken } from "../invitationService.js";
import { assertCanAddUserToHousehold, sendHouseholdLicenseError } from "../householdLicenseService.js";
import { resolveClerkIdentityFromToken } from "../clerkAuth.js";

const DIOD_EMAIL = "admin@admin.com";

const router = express.Router();

function parseBooleanWithDefault(value, fallback) {
  if (typeof value === "boolean") return value;
  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase();
    if (normalized === "true") return true;
    if (normalized === "false") return false;
  }
  return fallback;
}

function normalizeAvoidRepeatsWeeks(value) {
  const parsed = Number.parseInt(String(value ?? 1), 10);
  if (!Number.isFinite(parsed)) return 1;
  return Math.min(12, Math.max(1, Math.round(parsed)));
}

function getBearerToken(req) {
  const authHeader = req.headers.authorization || "";
  return authHeader.startsWith("Bearer ") ? authHeader.slice(7) : null;
}

function logClerkOnboardingDev(message, details = {}) {
  if (
    config.nodeEnv !== "development"
    && process.env.APP_ENV !== "development"
    && process.env.CLERK_DEBUG !== "true"
  ) {
    return;
  }
  console.log(`[clerk/onboarding][dev] ${message}`, details);
}

function buildSafeUserResponse(user, householdName = null) {
  return {
    ...user.toSafeJSON(),
    migrationPending: !user.householdId,
    onboardingRequired: !user.householdId,
    householdName
  };
}

async function resolveClerkOnboardingHousehold({ inviteCode, inviteToken, identity }) {
  const normalizedInviteCode = String(inviteCode || "").replace(/\D/g, "").slice(0, 6);
  const normalizedInviteToken = String(inviteToken || "").trim();

  if (normalizedInviteToken) {
    const invitation = await findActiveInvitationByToken(normalizedInviteToken);
    if (!invitation) {
      const error = new Error("La invitacion no es valida o expiro.");
      error.status = 400;
      error.code = "INVITATION_INVALID";
      throw error;
    }

    if (invitation.recipientEmail && invitation.recipientEmail !== identity.email) {
      const error = new Error("Esta invitacion fue enviada a otro email. Usa ese correo o pide una nueva invitacion.");
      error.status = 403;
      error.code = "INVITATION_EMAIL_MISMATCH";
      throw error;
    }

    const household = await Household.findById(invitation.householdId)
      .select("_id name subscriptionPlan inviteCode")
      .lean();
    if (!household) {
      const error = new Error("No encontramos el hogar asociado a esta invitacion.");
      error.status = 404;
      error.code = "INVITATION_HOUSEHOLD_MISSING";
      throw error;
    }

    await assertCanAddUserToHousehold(household);
    return {
      mode: "token",
      household,
      role: invitation.role || "member",
      invitation
    };
  }

  if (normalizedInviteCode) {
    if (!isValidInviteCodeFormat(normalizedInviteCode)) {
      const error = new Error("El codigo debe tener 6 digitos numericos.");
      error.status = 400;
      error.code = "INVITE_CODE_INVALID";
      throw error;
    }

    const household = await Household.findOne({ inviteCode: normalizedInviteCode })
      .select("_id name subscriptionPlan inviteCode")
      .lean();
    if (!household) {
      const error = new Error("El codigo del hogar no es valido.");
      error.status = 404;
      error.code = "INVITE_CODE_NOT_FOUND";
      throw error;
    }

    await assertCanAddUserToHousehold(household);
    return {
      mode: "code",
      household,
      role: "member",
      invitation: null
    };
  }

  return {
    mode: "create",
    household: null,
    role: "owner",
    invitation: null
  };
}


function hashResetPasswordToken(token) {
  return crypto.createHash("sha256").update(token).digest("hex");
}

function hashResetPasswordTokenLegacy(token) {
  return crypto
    .createHmac("sha256", config.resetPasswordTokenSecret)
    .update(token)
    .digest("hex");
}

function createResetPasswordToken() {
  return crypto.randomBytes(32).toString("base64url");
}

function buildResetPasswordTokenCandidates(token) {
  const variants = new Set();
  const baseToken = String(token || "");

  if (!baseToken) {
    return {
      rawVariants: [],
      hashedVariants: []
    };
  }

  variants.add(baseToken);

  try {
    variants.add(decodeURIComponent(baseToken));
  } catch {
    // Ignore malformed URI sequences and continue with the raw token.
  }

  if (baseToken.includes(" ")) {
    variants.add(baseToken.replace(/ /g, "+"));
  }

  const rawVariants = Array.from(variants).filter(Boolean);
  const hashedVariants = Array.from(
    new Set(
      rawVariants.flatMap((rawVariant) => [
        hashResetPasswordToken(rawVariant),
        hashResetPasswordTokenLegacy(rawVariant)
      ])
    )
  );

  return {
    rawVariants,
    hashedVariants
  };
}

function tokenPreview(token) {
  const normalized = String(token || "");
  if (!normalized) return "";
  if (normalized.length <= 12) return normalized;
  return `${normalized.slice(0, 6)}...${normalized.slice(-6)}`;
}

function buildResetPasswordEmail(resetUrl) {
  return `
    <div style="margin: 0; padding: 32px 16px; background: #f8fafc; font-family: Arial, sans-serif; color: #1f2937;">
      <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="border-collapse: collapse;">
        <tr>
          <td align="center">
            <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="width: 100%; max-width: 560px; border-collapse: collapse;">
              <tr>
                <td style="padding-bottom: 18px; text-align: center;">
                  <div style="display: inline-block; padding: 10px 18px; border-radius: 999px; background: #eef2ff; color: #4338ca; font-size: 12px; font-weight: 700; letter-spacing: 0.08em; text-transform: uppercase;">
                    Lunchfy
                  </div>
                </td>
              </tr>
              <tr>
                <td style="background: #ffffff; border: 1px solid #e4e7ec; border-radius: 24px; padding: 36px 32px; box-shadow: 0 10px 30px rgba(15, 23, 42, 0.08);">
                  <h1 style="margin: 0 0 14px; font-size: 28px; line-height: 1.2; color: #111827;">Reset your password</h1>
                  <p style="margin: 0 0 14px; font-size: 15px; line-height: 1.6; color: #475467;">
                    We received a request to reset the password for your Lunchfy account.
                  </p>
                  <p style="margin: 0 0 26px; font-size: 15px; line-height: 1.6; color: #475467;">
                    Use the button below to choose a new password. For your security, this link will expire in 1 hour.
                  </p>
                  <table role="presentation" cellspacing="0" cellpadding="0" style="border-collapse: collapse; margin: 0 0 22px;">
                    <tr>
                      <td style="border-radius: 999px; background: #4338ca; text-align: center;">
                        <a
                          href="${resetUrl}"
                          style="display: inline-block; padding: 14px 24px; color: #ffffff; text-decoration: none; font-size: 15px; font-weight: 700;"
                        >
                          Reset password
                        </a>
                      </td>
                    </tr>
                  </table>
                  <p style="margin: 0 0 10px; font-size: 13px; line-height: 1.6; color: #667085;">
                    If the button does not work, copy and paste this link into your browser:
                  </p>
                  <p style="margin: 0 0 24px; font-size: 13px; line-height: 1.6; word-break: break-word;">
                    <a href="${resetUrl}" style="color: #4338ca; text-decoration: underline;">${resetUrl}</a>
                  </p>
                  <p style="margin: 0 0 8px; font-size: 13px; line-height: 1.6; color: #667085;">
                    If you did not request a password reset, you can safely ignore this email.
                  </p>
                  <p style="margin: 0; font-size: 12px; line-height: 1.6; color: #98a2b3;">
                    This message was sent automatically by Lunchfy. Please do not reply directly to this email.
                  </p>
                </td>
              </tr>
            </table>
          </td>
        </tr>
      </table>
    </div>
  `;
}

router.get("/invite/:token", async (req, res) => {
  try {
    const { token } = req.params;
    if (!token) {
      return res.status(400).json({ ok: false, error: "Token de invitación inválido." });
    }

    const invitation = await findActiveInvitationByToken(token);
    if (!invitation) {
      return res.status(404).json({ ok: false, error: "La invitación no es válida o expiró." });
    }

    const household = await Household.findById(invitation.householdId).select("name");
    return res.json({
      ok: true,
      role: invitation.role,
      householdName: household?.name || "",
      expiresAt: invitation.expiresAt,
      recipientEmail: invitation.recipientEmail || ""
    });
  } catch (error) {
    if (sendHouseholdLicenseError(res, error)) return;
    return res.status(500).json({ ok: false, error: "No se pudo validar la invitación." });
  }
});


router.post("/login", async (req, res) => {
  try {
    const { email, password, username } = req.body;
    const loginValue = normalizeEmail(email || username);
    if (!loginValue || !password) {
      return res.status(400).json({ ok: false, error: "Email y contraseña son obligatorios." });
    }

    const user = await KitchenUser.findOne({ email: loginValue });
    if (!user) return res.status(401).json({ ok: false, error: "Credenciales inválidas." });

    if (!user.passwordHash || user.isPlaceholder || user.type === "placeholder" || user.hasLogin === false) {
      return res.status(401).json({ ok: false, error: "Credenciales inválidas." });
    }

    const ok = await bcrypt.compare(password, user.passwordHash);
    if (!ok) return res.status(401).json({ ok: false, error: "Credenciales inválidas." });

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
    return res.status(500).json({ ok: false, error: "No se pudo iniciar sesión." });
  }
});


router.get("/resolve-household/:inviteCode", async (req, res) => {
  try {
    const inviteCode = String(req.params.inviteCode || "").trim();
    if (!isValidInviteCodeFormat(inviteCode)) {
      return res.status(400).json({ ok: false, error: "El código debe tener 6 dígitos numéricos." });
    }

    const household = await Household.findOne({ inviteCode }).select("_id name");
    if (!household) {
      return res.status(404).json({ ok: false, error: "El código del hogar no es válido." });
    }

    return res.json({
      ok: true,
      household: {
        id: household._id,
        name: household.name
      }
    });
  } catch (error) {
    return res.status(500).json({ ok: false, error: "No se pudo validar el código del hogar." });
  }
});

router.post("/register", async (req, res) => {
  try {
    const { email, password, displayName, householdName, inviteCode, active, canCook, dinnerActive, dinnerCanCook } = req.body;
    const normalizedEmail = normalizeEmail(email);
    const safeDisplayName = buildDisplayName({ displayName, name: displayName });
    const normalizedInviteCode = String(inviteCode || "").trim();

    if (!normalizedEmail || !password || !safeDisplayName) {
      return res.status(400).json({ ok: false, error: "Nombre, email y contraseña son obligatorios." });
    }

    if (!isValidEmail(normalizedEmail)) {
      return res.status(400).json({ ok: false, error: "El email no es válido." });
    }

    if (String(password).length < 8) {
      return res.status(400).json({ ok: false, error: "La contraseña debe tener al menos 8 caracteres." });
    }

    const existingUser = await KitchenUser.findOne({ email: normalizedEmail });
    if (existingUser) {
      return res.status(409).json({ ok: false, error: "El email ya está registrado." });
    }

    const mode = normalizedInviteCode ? "join" : "create";
    let household = null;
    let role = "owner";

    if (mode === "join") {
      if (!isValidInviteCodeFormat(normalizedInviteCode)) {
        return res.status(400).json({ ok: false, error: "El código debe tener 6 dígitos numéricos." });
      }

      household = await Household.findOne({ inviteCode: normalizedInviteCode });
      if (!household) {
        return res.status(404).json({ ok: false, error: "El código del hogar no es válido." });
      }
      await assertCanAddUserToHousehold(household);
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
      active: parseBooleanWithDefault(active, true),
      canCook: parseBooleanWithDefault(canCook, true),
      dinnerActive: parseBooleanWithDefault(dinnerActive, true),
      dinnerCanCook: parseBooleanWithDefault(dinnerCanCook, true),
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
        console.error("No se pudo crear automáticamente el plan semanal durante el registro:", error?.message || error);
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
    if (sendHouseholdLicenseError(res, error)) return;
    if (error?.code === 11000) {
      return res.status(409).json({ ok: false, error: "No se pudo completar el registro. Intenta nuevamente." });
    }
    return res.status(500).json({ ok: false, error: "No se pudo completar el registro." });
  }
});

router.post("/accept-invite", async (req, res) => {
  try {
    const { token, email, password, displayName, active, canCook, dinnerActive, dinnerCanCook } = req.body;
    const normalizedEmail = normalizeEmail(email);

    if (!token || !normalizedEmail || !password) {
      return res.status(400).json({
        ok: false,
        error: "Token, email y contraseña son obligatorios."
      });
    }

    if (String(password).length < 8) {
      return res.status(400).json({ ok: false, error: "La contraseña debe tener al menos 8 caracteres." });
    }

    const invitation = await findActiveInvitationByToken(token);

    if (!invitation) {
      return res.status(400).json({ ok: false, error: "La invitación no es válida o expiró." });
    }

    if (invitation.recipientEmail && invitation.recipientEmail !== normalizedEmail) {
      return res.status(403).json({
        ok: false,
        error: "Esta invitación fue enviada a otro email. Usa ese correo o pide una nueva invitación."
      });
    }

    const household = await Household.findById(invitation.householdId)
      .select("_id subscriptionPlan")
      .lean();
    if (!household) {
      return res.status(404).json({ ok: false, error: "No encontramos el hogar asociado a esta invitaciÃ³n." });
    }

    let user = await KitchenUser.findOne({ email: normalizedEmail });

    if (user) {
      if (user.householdId && user.householdId.toString() !== invitation.householdId.toString()) {
        return res.status(409).json({
          ok: false,
          error: "Ese email ya pertenece a otro hogar y no se puede unir con esta invitación."
        });
      }

      if (!user.householdId) {
        await assertCanAddUserToHousehold(household);
        user.householdId = invitation.householdId;
      }

      if (!user.passwordHash || user.isPlaceholder || user.type === "placeholder" || user.hasLogin === false) {
        if (user.isPlaceholder || user.type === "placeholder" || user.hasLogin === false) {
          await assertCanAddUserToHousehold(household);
        }
        if (!displayName || !String(displayName).trim()) {
          return res.status(400).json({ ok: false, error: "El nombre para mostrar es obligatorio para activar la cuenta." });
        }
        user.displayName = String(displayName).trim();
        user.passwordHash = await bcrypt.hash(password, 10);
        user.type = "user";
        user.hasLogin = true;
        user.active = true;
        user.canCook = true;
        user.dinnerActive = true;
        user.dinnerCanCook = true;
      } else {
        const passwordOk = await bcrypt.compare(password, user.passwordHash);
        if (!passwordOk) {
          return res.status(401).json({ ok: false, error: "Credenciales inválidas." });
        }
      }

      if (user.isPlaceholder) {
        user.isPlaceholder = false;
        user.claimedAt = new Date();
        user.type = "user";
        user.hasLogin = true;
        user.active = true;
        user.canCook = true;
        user.dinnerActive = true;
        user.dinnerCanCook = true;
      }

      if (displayName && String(displayName).trim()) {
        user.displayName = String(displayName).trim();
        user.initials = normalizeInitials(user.initials, user.displayName);
      }

      user.role = invitation.role || "member";
      await user.save();
    } else {
      await assertCanAddUserToHousehold(household);
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
        active: parseBooleanWithDefault(active, true),
        canCook: parseBooleanWithDefault(canCook, true),
        dinnerActive: parseBooleanWithDefault(dinnerActive, true),
        dinnerCanCook: parseBooleanWithDefault(dinnerCanCook, true),
        role: invitation.role || "member",
        householdId: invitation.householdId,
        isPlaceholder: false
      });
    }

    invitation.status = "used";
    invitation.usedAt = new Date();
    invitation.usedByUserId = user._id;
    await invitation.save();

    const jwt = createToken(user);
    return res.json({ ok: true, token: jwt, user: user.toSafeJSON() });
  } catch (error) {
    if (sendHouseholdLicenseError(res, error)) return;
    return res.status(500).json({ ok: false, error: "No se pudo aceptar la invitación." });
  }
});

router.post("/logout", (req, res) => {
  res.json({ ok: true });
});

router.post("/clerk/onboarding", async (req, res) => {
  try {
    const token = getBearerToken(req);
    logClerkOnboardingDev("Onboarding request received", {
      hasBearerToken: Boolean(token)
    });
    const identity = await resolveClerkIdentityFromToken(token);
    if (!identity) {
      logClerkOnboardingDev("Onboarding rejected: missing Clerk identity");
      return res.status(401).json({ ok: false, code: "CLERK_AUTH_REQUIRED", error: "Debes iniciar sesion con Clerk." });
    }

    logClerkOnboardingDev("Clerk identity resolved for onboarding", {
      clerkUserId: identity.clerkUser?.id || null,
      email: identity.email,
      existingMongoUserId: identity.kitchenUser?._id?.toString?.() || null,
      existingHouseholdId: identity.kitchenUser?.householdId?.toString?.() || null
    });

    const {
      firstName,
      lastName,
      initials,
      displayName,
      householdName,
      active,
      canCook,
      dinnerActive,
      dinnerCanCook,
      dinnersEnabled,
      avoidRepeatsEnabled,
      avoidRepeatsWeeks,
      inviteCode,
      inviteToken
    } = req.body || {};

    const safeFirstName = String(firstName || identity.clerkUser?.firstName || "").trim();
    const safeLastName = String(lastName || identity.clerkUser?.lastName || "").trim();
    const safeDisplayName = buildDisplayName({
      firstName: safeFirstName,
      lastName: safeLastName,
      displayName,
      name: displayName
    });
    const finalDisplayName = safeDisplayName || String(identity.email || "").split("@")[0] || "Nuevo usuario";

    if (!safeFirstName || !safeLastName) {
      logClerkOnboardingDev("Onboarding rejected: profile fields missing", {
        hasFirstName: Boolean(safeFirstName),
        hasLastName: Boolean(safeLastName)
      });
      return res.status(400).json({ ok: false, code: "PROFILE_REQUIRED", error: "Nombre y apellidos son obligatorios." });
    }

    const onboardingTarget = await resolveClerkOnboardingHousehold({
      inviteCode,
      inviteToken,
      identity
    });
    logClerkOnboardingDev("Clerk onboarding household target resolved", {
      mode: onboardingTarget.mode,
      targetHouseholdId: onboardingTarget.household?._id?.toString?.() || null,
      role: onboardingTarget.role,
      hasInvitation: Boolean(onboardingTarget.invitation)
    });

    let user = identity.kitchenUser;
    if (user?.clerkId && user.clerkId !== identity.clerkUser.id) {
      logClerkOnboardingDev("Onboarding rejected: Clerk ID mismatch", {
        userId: user._id?.toString?.() || null,
        existingClerkId: user.clerkId,
        incomingClerkId: identity.clerkUser.id
      });
      return res.status(409).json({ ok: false, code: "CLERK_USER_MISMATCH", error: "Esta cuenta interna ya esta vinculada a otra identidad de Clerk." });
    }

    if (
      user?.householdId
      && onboardingTarget.household
      && String(user.householdId) !== String(onboardingTarget.household._id)
    ) {
      return res.status(409).json({
        ok: false,
        code: "USER_ALREADY_IN_OTHER_HOUSEHOLD",
        error: "Tu cuenta ya pertenece a otro hogar. No puedes unirte con esta invitacion."
      });
    }

    if (!user) {
      logClerkOnboardingDev("Creating safe Mongo user from Clerk onboarding", {
        email: identity.email
      });
      user = await KitchenUser.create({
        username: identity.email,
        email: identity.email,
        firstName: safeFirstName,
        lastName: safeLastName,
        displayName: finalDisplayName,
        initials: normalizeInitials(initials, finalDisplayName),
        clerkId: identity.clerkUser.id,
        passwordHash: null,
        type: "user",
        hasLogin: true,
        active: parseBooleanWithDefault(active, true),
        canCook: parseBooleanWithDefault(canCook, true),
        dinnerActive: parseBooleanWithDefault(dinnerActive, true),
        dinnerCanCook: parseBooleanWithDefault(dinnerCanCook, true),
        role: onboardingTarget.role,
        householdId: null,
        isPlaceholder: false,
        globalRole: null
      });
    } else {
      logClerkOnboardingDev("Completing existing Mongo user from Clerk onboarding", {
        userId: user._id?.toString?.() || null,
        email: identity.email
      });
      user.clerkId = user.clerkId || identity.clerkUser.id;
      user.email = user.email || identity.email;
      user.username = user.username || identity.email;
      user.firstName = safeFirstName;
      user.lastName = safeLastName;
      user.displayName = finalDisplayName;
      user.initials = normalizeInitials(initials || user.initials, finalDisplayName);
      user.type = "user";
      user.hasLogin = true;
      user.isPlaceholder = false;
      user.active = parseBooleanWithDefault(active, user.active ?? true);
      user.canCook = parseBooleanWithDefault(canCook, user.canCook ?? true);
      user.dinnerActive = parseBooleanWithDefault(dinnerActive, user.dinnerActive ?? true);
      user.dinnerCanCook = parseBooleanWithDefault(dinnerCanCook, user.dinnerCanCook ?? true);
    }

    let household = user.householdId ? await Household.findById(user.householdId) : null;
    if (!household && onboardingTarget.household) {
      household = onboardingTarget.household;
      user.role = onboardingTarget.role;
      user.householdId = onboardingTarget.household._id;
    }

    if (!household) {
      user.role = "owner";
      const finalHouseholdName = String(householdName || "").trim() || `${finalDisplayName} - Hogar`;
      logClerkOnboardingDev("Creating safe Household from Clerk onboarding", {
        userId: user._id?.toString?.() || null,
        householdName: finalHouseholdName
      });
      household = await Household.create({
        name: finalHouseholdName,
        ownerUserId: user._id,
        inviteCode: await generateUniqueHouseholdInviteCode(),
        dinnersEnabled: parseBooleanWithDefault(dinnersEnabled, false),
        avoidRepeatsEnabled: parseBooleanWithDefault(avoidRepeatsEnabled, false),
        avoidRepeatsWeeks: normalizeAvoidRepeatsWeeks(avoidRepeatsWeeks)
      });
      user.householdId = household._id;

      try {
        await ensureWeekPlan(getWeekStart(new Date()), household._id.toString());
      } catch (error) {
        console.error("[clerk/onboarding] No se pudo crear el plan semanal:", error?.message || error);
      }
    }

    if (onboardingTarget.invitation) {
      onboardingTarget.invitation.status = "used";
      onboardingTarget.invitation.usedAt = new Date();
      onboardingTarget.invitation.usedByUserId = user._id;
      await onboardingTarget.invitation.save();
    }

    await user.save();

    logClerkOnboardingDev("Clerk onboarding completed", {
      userId: user._id?.toString?.() || null,
      householdId: user.householdId?.toString?.() || null,
      role: user.role,
      globalRole: user.globalRole || null
    });

    return res.status(identity.kitchenUser ? 200 : 201).json({
      ok: true,
      user: buildSafeUserResponse(user, household?.name || null),
      household: household ? {
        id: household._id,
        name: household.name,
        inviteCode: household.inviteCode || null
      } : null,
      joinMode: onboardingTarget.mode
    });
  } catch (error) {
    console.error("[clerk/onboarding] failed", {
      code: error?.code || null,
      message: error?.message,
      stack: error?.stack
    });
    if (error?.code === 11000) {
      return res.status(409).json({ ok: false, code: "DUPLICATE_USER", error: "Ya existe un usuario con esos datos." });
    }
    return res.status(error?.status || 500).json({
      ok: false,
      code: error?.code || "CLERK_ONBOARDING_FAILED",
      error: error?.message || "No se pudo completar el onboarding."
    });
  }
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
      user: buildSafeUserResponse(req.kitchenUser, householdName),
      auth: req.user
    });
  } catch {
    return res.status(500).json({ ok: false, error: "No se pudo cargar el perfil." });
  }
});

router.post("/forgot-password", async (req, res) => {
  const genericResponse = {
    success: true,
    message: "If an account exists for that email, a password reset link has been sent."
  };
  let user = null;

  try {
    const normalizedEmail = normalizeEmail(req.body?.email);

    if (!normalizedEmail) {
      return res.status(400).json({
        success: false,
        message: "Email is required."
      });
    }

    if (!isValidEmail(normalizedEmail)) {
      return res.status(400).json({
        success: false,
        message: "Email is invalid."
      });
    }

    console.log("[auth] Forgot password requested", { email: normalizedEmail });

    user = await KitchenUser.findOne({ email: normalizedEmail });

    if (!user) {
      console.log("[auth] Forgot password requested for non-existing email", { email: normalizedEmail });
      return res.json(genericResponse);
    }

    const rawToken = createResetPasswordToken();
    const hashedToken = hashResetPasswordToken(rawToken);
    const expiresAt = new Date(Date.now() + 60 * 60 * 1000);

    user.resetPasswordToken = hashedToken;
    user.resetPasswordExpires = expiresAt;
    await user.save();

    const resetUrl = `${String(config.appUrl || "").replace(/\/$/, "")}/reset-password?token=${encodeURIComponent(rawToken)}`;

    console.log("[auth] Forgot password token stored", {
      email: normalizedEmail,
      tokenPreview: tokenPreview(rawToken),
      tokenLength: rawToken.length,
      tokenHashPreview: tokenPreview(hashedToken),
      expiresAt: expiresAt.toISOString()
    });

    await sendEmail({
      to: normalizedEmail,
      subject: "Lunchfy password reset",
      html: buildResetPasswordEmail(resetUrl)
    });

    console.log("[auth] Forgot password email sent", {
      email: normalizedEmail,
      expiresAt: expiresAt.toISOString()
    });

    return res.json(genericResponse);
  } catch (error) {
    if (user?.resetPasswordToken) {
      try {
        user.resetPasswordToken = null;
        user.resetPasswordExpires = null;
        await user.save();
      } catch (cleanupError) {
        console.error("[auth] Forgot password cleanup failed", {
          email: user.email,
          message: cleanupError?.message
        });
      }
    }

    console.error("[auth] Forgot password failed", {
      email: normalizeEmail(req.body?.email),
      message: error?.message
    });
    return res.status(500).json({
      success: false,
      message: "Unable to process forgot password request."
    });
  }
});

router.post("/reset-password", async (req, res) => {
  try {
    const rawToken = String(req.body?.token || "");
    const newPassword = String(req.body?.newPassword || "");

    if (!rawToken) {
      return res.status(400).json({
        success: false,
        message: "Token is required."
      });
    }

    if (!newPassword) {
      return res.status(400).json({
        success: false,
        message: "New password is required."
      });
    }

    if (newPassword.length < 8) {
      return res.status(400).json({
        success: false,
        message: "Password must be at least 8 characters long."
      });
    }

    const { rawVariants, hashedVariants } = buildResetPasswordTokenCandidates(rawToken);

    console.log("[auth] Reset password requested", {
      tokenPreview: tokenPreview(rawToken),
      tokenLength: rawToken.length,
      hashedPreview: hashedVariants.map((hash) => tokenPreview(hash))
    });

    const user = await KitchenUser.findOne({
      resetPasswordToken: { $in: hashedVariants },
      resetPasswordExpires: { $gt: new Date() }
    });

    if (!user) {
      const matchingTokenWithoutExpiry = await KitchenUser.findOne({
        resetPasswordToken: { $in: hashedVariants }
      }).select("_id resetPasswordExpires");

      console.warn("[auth] Reset password failed: invalid or expired token", {
        tokenPreview: tokenPreview(rawToken),
        rawVariantPreviews: rawVariants.map((variant) => tokenPreview(variant)),
        matchedStoredToken: Boolean(matchingTokenWithoutExpiry),
        storedExpiry: matchingTokenWithoutExpiry?.resetPasswordExpires?.toISOString?.() || null
      });

      return res.status(400).json({
        success: false,
        message: "Invalid or expired reset token."
      });
    }

    user.passwordHash = await bcrypt.hash(newPassword, 10);
    user.resetPasswordToken = null;
    user.resetPasswordExpires = null;
    await user.save();

    console.log("[auth] Password reset completed", { userId: user._id.toString() });

    return res.json({
      success: true,
      message: "Password has been reset successfully."
    });
  } catch (error) {
    console.error("[auth] Reset password failed", {
      message: error?.message
    });
    return res.status(500).json({
      success: false,
      message: "Unable to reset password."
    });
  }
});

export default router;


