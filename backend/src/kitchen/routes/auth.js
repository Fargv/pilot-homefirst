import express from "express";
import crypto from "crypto";
import bcrypt from "bcryptjs";
import { KitchenUser } from "../models/KitchenUser.js";
import { KitchenAuditLog } from "../models/KitchenAuditLog.js";
import { Invitation } from "../models/Invitation.js";
import { Household } from "../models/Household.js";
import { createToken, requireAuth } from "../middleware.js";
import { buildDisplayName, isValidEmail, normalizeEmail, normalizeInitials } from "../../users/utils.js";
import { generateUniqueHouseholdInviteCode, isValidInviteCodeFormat } from "../householdInviteCode.js";
import { getWeekStart } from "../utils/dates.js";
import { ensureWeekPlan } from "../weekPlanService.js";
import { sendEmail } from "../../services/emailService.js";
import { config } from "../../config.js";
import { findActiveInvitationByToken, atomicClaimInvitation } from "../invitationService.js";
import { assertCanAddUserToHousehold, sendHouseholdLicenseError } from "../householdLicenseService.js";
import { isEmailRegisteredInClerk, resolveClerkIdentityFromToken } from "../clerkAuth.js";
import { normalizeSubscriptionPlan } from "../subscriptionService.js";
import { initOnboarding } from "../onboardingEngine.js";
import { checkBetaAccess, markBetaInviteUsed } from "../betaService.js";

const DIOD_EMAIL = "admin@admin.com";

function _betaErrorMessage(code) {
  const messages = {
    BETA_ACCESS_REQUIRED: "Lunchfy está en beta privada. Necesitas una invitación para registrarte.",
    BETA_INVITE_INVALID: "La invitación no es válida.",
    BETA_INVITE_USED: "Esta invitación ya fue utilizada.",
    BETA_INVITE_REVOKED: "Esta invitación ha sido revocada.",
    BETA_INVITE_EXPIRED: "Esta invitación ha expirado.",
    BETA_INVITE_EMAIL_MISMATCH: "Esta invitación no corresponde a tu email.",
  };
  return messages[code] || "No tienes acceso a la beta privada.";
}

const router = express.Router();

const _rateLimitStore = new Map();
function _checkRateLimit(key, maxRequests, windowMs) {
  const now = Date.now();
  const entry = _rateLimitStore.get(key);
  if (!entry || now > entry.resetAt) {
    _rateLimitStore.set(key, { count: 1, resetAt: now + windowMs });
    return true;
  }
  if (entry.count >= maxRequests) return false;
  entry.count++;
  return true;
}
function getClientIp(req) {
  return String(req.ip || req.socket?.remoteAddress || "unknown");
}

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

function normalizeRequestedOnboardingPlan(value) {
  const normalizedPlan = normalizeSubscriptionPlan(value);
  const allowed = ["basic", "pro", "premium"];
  return allowed.includes(normalizedPlan) ? normalizedPlan : "basic";
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
  if (!_checkRateLimit(`resolve-household:${getClientIp(req)}`, 10, 60_000)) {
    return res.status(429).json({ ok: false, error: "Demasiadas peticiones. Inténtalo más tarde." });
  }
  try {
    const inviteCode = String(req.params.inviteCode || "").trim();
    if (!isValidInviteCodeFormat(inviteCode)) {
      return res.status(400).json({ ok: false, error: "El código debe tener 6 dígitos numéricos." });
    }

    const household = await Household.findOne({ inviteCode }).select("_id name subscriptionPlan");
    if (!household) {
      return res.status(404).json({ ok: false, error: "El código del hogar no es válido." });
    }
    await assertCanAddUserToHousehold(household);

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

router.get("/check-email", async (req, res) => {
  if (!_checkRateLimit(`check-email:${getClientIp(req)}`, 20, 60_000)) {
    return res.status(429).json({ ok: false, error: "Demasiadas peticiones. Inténtalo más tarde." });
  }
  try {
    const normalizedEmail = normalizeEmail(req.query?.email);
    if (!normalizedEmail || !isValidEmail(normalizedEmail)) {
      return res.status(400).json({ ok: false, error: "El email no es válido." });
    }

    const existingUser = await KitchenUser.findOne({ email: normalizedEmail }).select("_id").lean();
    const existsInClerk = existingUser ? false : await isEmailRegisteredInClerk(normalizedEmail);

    return res.json({
      ok: true,
      exists: Boolean(existingUser) || Boolean(existsInClerk)
    });
  } catch (error) {
    return res.status(500).json({ ok: false, error: "No se pudo validar el email." });
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

    // Beta gate — only for new household creation (not joining an existing one).
    // Household member joins (via 6-digit invite code) intentionally bypass the beta gate:
    //   • The invite code is private, shared by an existing beta household member.
    //   • Beta testers should be able to add family members without each needing
    //     a separate beta invite.
    //   • The beta gate's purpose is to control WHO CREATES NEW HOUSEHOLDS,
    //     not who joins existing ones.
    const normalizedBetaToken = String(req.body.betaToken || "").trim();
    let betaCheckResult = null;
    if (!normalizedInviteCode) {
      const betaCheck = await checkBetaAccess(normalizedEmail, normalizedBetaToken);
      if (!betaCheck.allowed) {
        return res.status(403).json({ ok: false, code: betaCheck.code, error: _betaErrorMessage(betaCheck.code) });
      }
      betaCheckResult = betaCheck;
    }

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
      initOnboarding(household._id.toString()).catch((e) =>
        console.error("[onboarding] init failed on register:", e.message)
      );
      if (betaCheckResult?.invite) {
        markBetaInviteUsed(betaCheckResult.invite, user._id, household._id).catch(() => {});
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
      return res.status(404).json({ ok: false, error: "No encontramos el hogar asociado a esta invitación." });
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

// ─── Admin Legacy Password Recovery ──────────────────────────────────────────
// Separate recovery flow for the DIOD/admin legacy account.
// Must never touch Clerk users. All responses are intentionally generic.

const _adminRecoveryRateLimit = new Map();

function _checkAdminRecoveryRateLimit(key, maxRequests, windowMs) {
  const now = Date.now();
  const entry = _adminRecoveryRateLimit.get(key);
  if (!entry || now > entry.resetAt) {
    _adminRecoveryRateLimit.set(key, { count: 1, resetAt: now + windowMs });
    return true;
  }
  if (entry.count >= maxRequests) return false;
  entry.count++;
  return true;
}

function validateAdminPasswordStrength(password) {
  const pw = String(password || "");
  if (pw.length < 10) {
    return { valid: false, error: "La contraseña debe tener al menos 10 caracteres." };
  }
  const groups = [
    /[A-Z]/.test(pw),
    /[a-z]/.test(pw),
    /[0-9]/.test(pw),
    /[^A-Za-z0-9]/.test(pw)
  ];
  const metGroups = groups.filter(Boolean).length;
  if (metGroups < 2) {
    return {
      valid: false,
      error: "La contraseña debe incluir al menos 2 de los siguientes grupos: mayúsculas, minúsculas, números, símbolos."
    };
  }
  return { valid: true };
}

function maskRecoveryEmail(email) {
  if (!email || typeof email !== "string") return null;
  const [local, domain] = email.split("@");
  if (!domain) return null;
  const visible = local.length > 2 ? local.slice(0, 2) : local.slice(0, 1);
  return `${visible}${"*".repeat(Math.max(3, local.length - visible.length))}@${domain}`;
}

// POST /api/auth/admin/forgot-password
// Rate limit: 3 per 15 min per IP, 2 per 15 min per identifier
router.post("/admin/forgot-password", async (req, res) => {
  const GENERIC_OK = {
    ok: true,
    message: "Si existe una cuenta compatible, enviaremos instrucciones de recuperación."
  };

  try {
    const ip = getClientIp(req);
    const identifier = normalizeEmail(req.body?.identifier || req.body?.email);

    if (!identifier) {
      return res.status(400).json({ ok: false, error: "El identificador de acceso es obligatorio." });
    }

    // Rate limit by IP (3 requests / 15 min)
    if (!_checkAdminRecoveryRateLimit(`admin-forgot:ip:${ip}`, 3, 15 * 60_000)) {
      return res.status(429).json({ ok: false, error: "Demasiadas peticiones. Inténtalo en 15 minutos." });
    }

    // Rate limit by identifier (2 requests / 15 min)
    if (!_checkAdminRecoveryRateLimit(`admin-forgot:id:${identifier}`, 2, 15 * 60_000)) {
      return res.status(429).json({ ok: false, error: "Demasiadas peticiones. Inténtalo en 15 minutos." });
    }

    console.log("[admin/recovery] Password recovery requested", { identifier, ip });

    const user = await KitchenUser.findOne({ email: identifier, globalRole: "diod" });

    if (!user) {
      console.log("[admin/recovery] No matching diod account found — returning generic response", { identifier });
      return res.json(GENERIC_OK);
    }

    if (!user.recoveryEmail) {
      console.log("[admin/recovery] diod account has no recoveryEmail — returning generic response", {
        userId: user._id.toString()
      });
      // Audit: someone tried but no recovery email configured
      await KitchenAuditLog.create({
        action: "admin_password_recovery_requested_no_email",
        actorUserId: user._id,
        data: { ip }
      }).catch(() => {});
      return res.json(GENERIC_OK);
    }

    const rawToken = createResetPasswordToken();
    const hashedToken = hashResetPasswordToken(rawToken);
    const expiresAt = new Date(Date.now() + 15 * 60_000); // 15 minutes — stricter than regular users

    user.resetPasswordToken = hashedToken;
    user.resetPasswordExpires = expiresAt;
    await user.save();

    const resetUrl = `${String(config.appUrl || "").replace(/\/$/, "")}/admin/reset-password?token=${encodeURIComponent(rawToken)}`;

    console.log("[admin/recovery] Admin reset token stored", {
      userId: user._id.toString(),
      tokenLength: rawToken.length,
      expiresAt: expiresAt.toISOString(),
      recoveryEmailMasked: maskRecoveryEmail(user.recoveryEmail)
    });

    await sendEmail({
      to: user.recoveryEmail,
      subject: "Lunchfy — Recuperación de acceso admin",
      html: buildAdminResetPasswordEmail(resetUrl, expiresAt)
    });

    console.log("[admin/recovery] Admin reset email sent", {
      userId: user._id.toString(),
      recoveryEmailMasked: maskRecoveryEmail(user.recoveryEmail),
      expiresAt: expiresAt.toISOString()
    });

    await KitchenAuditLog.create({
      action: "admin_password_recovery_requested",
      actorUserId: user._id,
      data: { ip, recoveryEmailMasked: maskRecoveryEmail(user.recoveryEmail) }
    }).catch(() => {});

    return res.json(GENERIC_OK);
  } catch (error) {
    console.error("[admin/recovery] Forgot password failed", { message: error?.message });
    // Still return generic OK to avoid leaking implementation details
    return res.json({
      ok: true,
      message: "Si existe una cuenta compatible, enviaremos instrucciones de recuperación."
    });
  }
});

// POST /api/auth/admin/reset-password
// Validates token, enforces admin password strength policy, invalidates token after use.
router.post("/admin/reset-password", async (req, res) => {
  try {
    const rawToken = String(req.body?.token || "");
    const newPassword = String(req.body?.newPassword || "");

    if (!rawToken) {
      return res.status(400).json({ ok: false, error: "El token de recuperación es obligatorio." });
    }

    if (!newPassword) {
      return res.status(400).json({ ok: false, error: "La nueva contraseña es obligatoria." });
    }

    const strengthCheck = validateAdminPasswordStrength(newPassword);
    if (!strengthCheck.valid) {
      return res.status(400).json({ ok: false, error: strengthCheck.error });
    }

    const { hashedVariants } = buildResetPasswordTokenCandidates(rawToken);

    console.log("[admin/recovery] Reset password requested", {
      tokenLength: rawToken.length,
      tokenPreview: tokenPreview(rawToken)
    });

    // Token must match a diod user with a non-expired token
    const user = await KitchenUser.findOne({
      resetPasswordToken: { $in: hashedVariants },
      resetPasswordExpires: { $gt: new Date() },
      globalRole: "diod"
    });

    if (!user) {
      // Audit the failed attempt (log without leaking the token)
      const matchedWithoutExpiry = await KitchenUser.findOne({
        resetPasswordToken: { $in: hashedVariants },
        globalRole: "diod"
      }).select("_id resetPasswordExpires");

      console.warn("[admin/recovery] Reset failed: invalid or expired token", {
        tokenPreview: tokenPreview(rawToken),
        matchedStoredToken: Boolean(matchedWithoutExpiry),
        storedExpiry: matchedWithoutExpiry?.resetPasswordExpires?.toISOString?.() || null
      });

      return res.status(400).json({ ok: false, error: "El enlace de recuperación no es válido o ha expirado." });
    }

    user.passwordHash = await bcrypt.hash(newPassword, 12);
    user.resetPasswordToken = null;
    user.resetPasswordExpires = null;
    await user.save();

    console.log("[admin/recovery] Admin password reset completed", { userId: user._id.toString() });

    await KitchenAuditLog.create({
      action: "admin_password_reset_completed",
      actorUserId: user._id,
      data: { ip: getClientIp(req) }
    }).catch(() => {});

    return res.json({ ok: true, message: "La contraseña se ha restablecido correctamente." });
  } catch (error) {
    console.error("[admin/recovery] Reset password failed", { message: error?.message });
    return res.status(500).json({ ok: false, error: "No se pudo restablecer la contraseña." });
  }
});

function buildAdminResetPasswordEmail(resetUrl, expiresAt) {
  const expiresStr = expiresAt instanceof Date
    ? expiresAt.toLocaleTimeString("es-ES", { hour: "2-digit", minute: "2-digit", timeZone: "UTC" }) + " UTC"
    : "15 minutos";

  return `
    <div style="margin:0;padding:32px 16px;background:#f8fafc;font-family:Arial,sans-serif;color:#1f2937;">
      <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="border-collapse:collapse;">
        <tr><td align="center">
          <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="width:100%;max-width:560px;border-collapse:collapse;">
            <tr>
              <td style="padding-bottom:18px;text-align:center;">
                <div style="display:inline-block;padding:10px 18px;border-radius:999px;background:#1e1b4b;color:#a5b4fc;font-size:12px;font-weight:700;letter-spacing:0.08em;text-transform:uppercase;">
                  Lunchfy · Admin
                </div>
              </td>
            </tr>
            <tr>
              <td style="background:#ffffff;border:1px solid #e4e7ec;border-radius:24px;padding:36px 32px;box-shadow:0 10px 30px rgba(15,23,42,0.08);">
                <h1 style="margin:0 0 14px;font-size:24px;line-height:1.2;color:#111827;">Restablece tu contraseña de administrador</h1>
                <p style="margin:0 0 14px;font-size:15px;line-height:1.6;color:#475467;">
                  Recibiste este correo porque se solicitó recuperar el acceso a la cuenta de administrador de Lunchfy.
                </p>
                <div style="background:#fef9c3;border:1px solid #fde047;border-radius:8px;padding:10px 14px;margin:0 0 20px;font-size:13px;color:#713f12;">
                  ⚠ Este enlace expira a las <strong>${expiresStr}</strong> (15 minutos). Solo puede usarse una vez.
                </div>
                <table role="presentation" cellspacing="0" cellpadding="0" style="border-collapse:collapse;margin:0 0 22px;">
                  <tr>
                    <td style="border-radius:999px;background:#312e81;text-align:center;">
                      <a href="${resetUrl}" style="display:inline-block;padding:14px 24px;color:#ffffff;text-decoration:none;font-size:15px;font-weight:700;">
                        Restablecer contraseña
                      </a>
                    </td>
                  </tr>
                </table>
                <p style="margin:0 0 10px;font-size:13px;line-height:1.6;color:#667085;">
                  Si el botón no funciona, copia y pega este enlace en tu navegador:
                </p>
                <p style="margin:0 0 24px;font-size:13px;line-height:1.6;word-break:break-word;">
                  <a href="${resetUrl}" style="color:#4338ca;text-decoration:underline;">${resetUrl}</a>
                </p>
                <p style="margin:0 0 8px;font-size:13px;line-height:1.6;color:#667085;">
                  Si no solicitaste este restablecimiento, ignora este correo. Tu contraseña actual no ha cambiado.
                </p>
                <p style="margin:0;font-size:12px;line-height:1.6;color:#98a2b3;">
                  Este mensaje fue generado automáticamente. No respondas directamente a este correo.
                </p>
              </td>
            </tr>
          </table>
        </td></tr>
      </table>
    </div>
  `;
}

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
      selectedPlan,
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
    const requestedPlan = normalizeRequestedOnboardingPlan(selectedPlan);

    if (!finalDisplayName) {
      return res.status(400).json({ ok: false, code: "PROFILE_REQUIRED", error: "El nombre visible es obligatorio." });
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
    let userCreatedNow = false;
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
      const isPlaceholder = user.isPlaceholder || user.type === "placeholder" || user.hasLogin === false;
      return res.status(409).json({
        ok: false,
        code: isPlaceholder ? "PLACEHOLDER_HOUSEHOLD_MISMATCH" : "USER_ALREADY_IN_OTHER_HOUSEHOLD",
        error: isPlaceholder
          ? "Este usuario ya existe en otro hogar y no puede ser reclamado con esta invitación."
          : "Tu cuenta ya pertenece a otro hogar. No puedes unirte con esta invitacion."
      });
    }

    if (onboardingTarget.mode === "create" && !requestedPlan) {
      return res.status(400).json({
        ok: false,
        code: "SUBSCRIPTION_PLAN_MISSING",
        error: "Debes seleccionar un plan para crear un hogar."
      });
    }

    if (!user) {
      logClerkOnboardingDev("Creating safe Mongo user from Clerk onboarding", {
        email: identity.email
      });
      user = await KitchenUser.create({
        username: identity.email,
        email: identity.email,
        firstName: safeFirstName || finalDisplayName,
        lastName: safeLastName || "",
        displayName: finalDisplayName,
        initials: normalizeInitials(initials, finalDisplayName),
        clerkId: identity.clerkUser.id,
        passwordHash: null, // Clerk users authenticate via Clerk; no local password is stored or needed.
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
      userCreatedNow = true;
    } else {
      logClerkOnboardingDev("Completing existing Mongo user from Clerk onboarding", {
        userId: user._id?.toString?.() || null,
        email: identity.email
      });
      user.clerkId = user.clerkId || identity.clerkUser.id;
      user.email = user.email || identity.email;
      user.username = user.username || identity.email;
      user.firstName = safeFirstName || user.firstName || finalDisplayName;
      user.lastName = safeLastName || user.lastName || "";
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

    // Beta gate — only blocks NEW household creation.
    // Joining via inviteCode or inviteToken is intentionally excluded: see comment
    // in the /register route above for the full rationale.
    if (!household && onboardingTarget.mode === "create") {
      const betaToken = String(req.body.betaToken || "").trim();
      const betaCheck = await checkBetaAccess(identity.email, betaToken);
      if (!betaCheck.allowed) {
        return res.status(403).json({ ok: false, code: betaCheck.code, error: _betaErrorMessage(betaCheck.code) });
      }
      req._betaInvite = betaCheck.invite || null;
    }

    if (!household) {
      user.role = "owner";
      const finalHouseholdName = String(householdName || "").trim() || `${finalDisplayName} - Hogar`;
      logClerkOnboardingDev("Creating safe Household from Clerk onboarding", {
        userId: user._id?.toString?.() || null,
        householdName: finalHouseholdName
      });
      try {
        household = await Household.create({
          name: finalHouseholdName,
          ownerUserId: user._id,
          inviteCode: await generateUniqueHouseholdInviteCode(),
          subscriptionPlan: requestedPlan || "basic",
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
        initOnboarding(household._id.toString()).catch((e) =>
          console.error("[onboarding] init failed on clerk register:", e.message)
        );
        if (req._betaInvite) {
          markBetaInviteUsed(req._betaInvite, user._id, household._id).catch(() => {});
          req._betaInvite = null;
        }
      } catch (householdError) {
        if (userCreatedNow) {
          await KitchenUser.findByIdAndDelete(user._id).catch(() => {});
        }
        throw householdError;
      }
    }

    if (onboardingTarget.invitation) {
      const claimed = await atomicClaimInvitation(onboardingTarget.invitation._id, user._id);
      if (!claimed) {
        if (userCreatedNow) {
          await KitchenUser.findByIdAndDelete(user._id).catch(() => {});
        }
        return res.status(409).json({
          ok: false,
          code: "INVITATION_ALREADY_USED",
          error: "Esta invitación ya fue utilizada por otra cuenta."
        });
      }
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
    let subscriptionPlan = "basic";
    const effectiveHouseholdId = req.user?.activeHouseholdId || req.user?.householdId || null;
    let planSource = "manual";
    let betaProActive = false;
    if (effectiveHouseholdId) {
      const household = await Household.findById(effectiveHouseholdId)
        .select("name subscriptionPlan planSource betaPro")
        .lean();
      householdName = household?.name || null;
      subscriptionPlan = normalizeSubscriptionPlan(household?.subscriptionPlan);
      planSource = household?.planSource || "manual";
      betaProActive = household?.betaPro?.active ?? false;
    }

    res.json({
      ok: true,
      user: {
        ...buildSafeUserResponse(req.kitchenUser, householdName),
        subscriptionPlan,
        planSource,
        betaProActive
      },
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


