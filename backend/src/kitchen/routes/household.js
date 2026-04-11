import crypto from "crypto";
import express from "express";
import bcrypt from "bcryptjs";
import mongoose from "mongoose";
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
import { Household } from "../models/Household.js";
import { ensureHouseholdInviteCode } from "../householdInviteCode.js";
import { sendEmail } from "../../services/emailService.js";
import { buildHouseholdInvitationEmail } from "../householdInvitationEmail.js";
import {
  createHouseholdInvitation,
  findInvitationByToken,
  getInvitationStatus
} from "../invitationService.js";
import {
  buildHouseholdFeatureAvailability,
  buildHouseholdSubscriptionResponse,
  canUseBudgetFeature
} from "../subscriptionService.js";
import {
  assertCanAddNonUserDinerToHousehold,
  assertCanAddUserToHousehold,
  buildHouseholdLicenseSummary,
  countHouseholdLicenseUsage,
  sendHouseholdLicenseError
} from "../householdLicenseService.js";

const router = express.Router();

function normalizeAvoidRepeatsWeeks(value) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return 1;
  return Math.min(12, Math.max(1, Math.round(parsed)));
}

function normalizeCycleStartDay(value) {
  const parsed = Number.parseInt(String(value ?? 1), 10);
  if (!Number.isFinite(parsed)) return 1;
  return Math.min(28, Math.max(1, parsed));
}

function parseBooleanInput(value) {
  if (typeof value === "boolean") return { ok: true, value };
  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase();
    if (normalized === "true") return { ok: true, value: true };
    if (normalized === "false") return { ok: true, value: false };
  }
  return { ok: false, value: null };
}

function parseWeeksInput(value) {
  if (value === undefined || value === null || value === "") {
    return { ok: false, value: null };
  }
  const parsed = Number.parseInt(String(value), 10);
  if (!Number.isFinite(parsed)) return { ok: false, value: null };
  const weeks = Math.round(parsed);
  if (weeks < 1 || weeks > 12) return { ok: false, value: null };
  return { ok: true, value: weeks };
}

function parseBudgetInput(value) {
  if (value === undefined || value === null || value === "") {
    return { ok: true, value: null };
  }
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0) {
    return { ok: false, value: null };
  }
  return { ok: true, value: Number(parsed.toFixed(2)) };
}

function parseCycleStartDayInput(value) {
  if (value === undefined || value === null || value === "") {
    return { ok: true, value: 1 };
  }
  const parsed = Number.parseInt(String(value), 10);
  if (!Number.isFinite(parsed) || parsed < 1 || parsed > 28) {
    return { ok: false, value: null };
  }
  return { ok: true, value: parsed };
}

function buildHouseholdResponse(household, license = null) {
  const budgetFeatureEnabled = canUseBudgetFeature(household?.subscriptionPlan);
  return {
    id: household._id,
    name: household.name || "Mi household",
    inviteCode: household.inviteCode || null,
    ownerUserId: household.ownerUserId || null,
    dinnersEnabled: Boolean(household.dinnersEnabled),
    avoidRepeatsEnabled: Boolean(household.avoidRepeatsEnabled),
    avoidRepeatsWeeks: normalizeAvoidRepeatsWeeks(household.avoidRepeatsWeeks),
    monthlyBudget: budgetFeatureEnabled && Number.isFinite(Number(household.monthlyBudget))
      ? Number(household.monthlyBudget)
      : null,
    cycleStartDay: budgetFeatureEnabled ? normalizeCycleStartDay(household.cycleStartDay) : null,
    ...buildHouseholdSubscriptionResponse(household),
    featureAvailability: buildHouseholdFeatureAvailability(household),
    license: license || buildHouseholdLicenseSummary(household)
  };
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

function isDiodUser(req) {
  return req.kitchenUser?.globalRole === "diod";
}

function normalizeRequestedHouseholdId(value) {
  if (value === null || value === undefined || value === "") return null;
  return String(value).trim();
}

async function resolveShareHousehold(req, requestedHouseholdId) {
  if (isDiodUser(req)) {
    const householdId = normalizeRequestedHouseholdId(requestedHouseholdId);
    console.info("[kitchen/household] resolving share household", {
      userId: req.user?.id || null,
      isDiod: true,
      requestedHouseholdId: householdId || null
    });
    if (!householdId) {
      return { error: { status: 400, message: "Debes seleccionar un household para enviar invitaciones." } };
    }
    if (!mongoose.isValidObjectId(householdId)) {
      return { error: { status: 400, message: "El household seleccionado no es válido." } };
    }
    const household = await Household.findById(householdId)
      .select("_id name inviteCode ownerUserId subscriptionPlan")
      .lean();
    if (!household) {
      console.warn("[kitchen/household] share household not found", {
        userId: req.user?.id || null,
        requestedHouseholdId: householdId
      });
      return { error: { status: 404, message: "No encontramos el household seleccionado." } };
    }
    console.info("[kitchen/household] share household resolved", {
      userId: req.user?.id || null,
      householdId: String(household._id),
      hasInviteCode: Boolean(household.inviteCode),
      hasOwnerUserId: Boolean(household.ownerUserId)
    });
    return { household };
  }

  const effectiveHouseholdId = getEffectiveHouseholdId(req.user);
  const requestedId = normalizeRequestedHouseholdId(requestedHouseholdId);
  console.info("[kitchen/household] resolving share household", {
    userId: req.user?.id || null,
    isDiod: false,
    requestedHouseholdId: requestedId || null,
    effectiveHouseholdId: String(effectiveHouseholdId)
  });
  if (requestedId && requestedId !== String(effectiveHouseholdId)) {
    return { error: { status: 403, message: "Solo puedes invitar personas a tu propio household." } };
  }

  const household = await Household.findById(effectiveHouseholdId)
    .select("_id name inviteCode ownerUserId subscriptionPlan")
    .lean();
  if (!household) {
    console.warn("[kitchen/household] share household not found", {
      userId: req.user?.id || null,
      effectiveHouseholdId: String(effectiveHouseholdId)
    });
    return { error: { status: 404, message: "No encontramos el hogar." } };
  }
  console.info("[kitchen/household] share household resolved", {
    userId: req.user?.id || null,
    householdId: String(household._id),
    hasInviteCode: Boolean(household.inviteCode),
    hasOwnerUserId: Boolean(household.ownerUserId)
  });
  return { household };
}

function normalizeInvitationEmails(emails) {
  if (!Array.isArray(emails)) return { emails: [], invalidEmails: [] };

  const seen = new Set();
  const validEmails = [];
  const invalidEmails = [];

  for (const rawEmail of emails) {
    const email = normalizeEmail(rawEmail);
    if (!email) continue;
    if (seen.has(email)) continue;
    seen.add(email);
    if (!isValidEmail(email)) {
      invalidEmails.push(email);
      continue;
    }
    validEmails.push(email);
  }

  return { emails: validEmails, invalidEmails };
}

function invitationRoleLabel(role) {
  const normalizedRole = String(role || "member").toLowerCase();
  if (normalizedRole === "owner" || normalizedRole === "admin") return "Administrador";
  return "Miembro";
}

router.get("/summary", requireAuth, async (req, res) => {
  try {
    const effectiveHouseholdId = getEffectiveHouseholdId(req.user);
    const household = await Household.findById(effectiveHouseholdId)
      .select("_id name inviteCode ownerUserId dinnersEnabled avoidRepeatsEnabled avoidRepeatsWeeks monthlyBudget cycleStartDay subscriptionPlan subscriptionStatus subscriptionRequestedPlan trialEndsAt subscriptionEndsAt isPro assignedByAdmin")
      .lean();
    if (!household) {
      return res.status(404).json({ ok: false, error: "No encontramos el hogar." });
    }
    const license = buildHouseholdLicenseSummary(
      household,
      await countHouseholdLicenseUsage(household._id)
    );
    return res.json({ ok: true, household: buildHouseholdResponse(household, license) });
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

    return res.json({ ok: true, household: buildHouseholdResponse(household) });
  } catch (error) {
    const handled = handleHouseholdError(res, error);
    if (handled) return handled;
    return res.status(500).json({ ok: false, error: "No se pudo actualizar el nombre del household." });
  }
});

router.patch("/preferences", requireAuth, requireRole("owner"), async (req, res) => {
  try {
    const effectiveHouseholdId = getEffectiveHouseholdId(req.user);
    const household = await Household.findById(effectiveHouseholdId).lean();
    if (!household) {
      return res.status(404).json({ ok: false, error: "No encontramos el hogar." });
    }
    const budgetFeatureEnabled = canUseBudgetFeature(household?.subscriptionPlan);
    const isBudgetMutation = req.body?.monthlyBudget !== undefined || req.body?.cycleStartDay !== undefined;
    if (!budgetFeatureEnabled && isBudgetMutation) {
      return res.status(403).json({
        ok: false,
        code: "BUDGET_FEATURE_NOT_AVAILABLE",
        message: "Budget feature is available only for Pro and Premium households."
      });
    }

    const incomingEnabled = req.body?.avoidRepeatsEnabled;
    const incomingDinnersEnabled = req.body?.dinnersEnabled;
    const parsedEnabled = incomingEnabled === undefined
      ? { ok: true, value: Boolean(household.avoidRepeatsEnabled) }
      : parseBooleanInput(incomingEnabled);
    if (!parsedEnabled.ok) {
      return res.status(400).json({ ok: false, error: "avoidRepeatsEnabled debe ser booleano." });
    }
    const parsedDinnersEnabled = incomingDinnersEnabled === undefined
      ? { ok: true, value: Boolean(household.dinnersEnabled) }
      : parseBooleanInput(incomingDinnersEnabled);
    if (!parsedDinnersEnabled.ok) {
      return res.status(400).json({ ok: false, error: "dinnersEnabled debe ser booleano." });
    }

    const parsedWeeks = parseWeeksInput(req.body?.avoidRepeatsWeeks);
    const currentWeeks = normalizeAvoidRepeatsWeeks(household.avoidRepeatsWeeks);
    const nextWeeks = parsedWeeks.ok ? parsedWeeks.value : currentWeeks;
    const parsedBudget = parseBudgetInput(req.body?.monthlyBudget);
    if (!parsedBudget.ok) {
      return res.status(400).json({ ok: false, error: "monthlyBudget debe ser un número mayor o igual que 0." });
    }
    const parsedCycleStartDay = parseCycleStartDayInput(req.body?.cycleStartDay);
    if (!parsedCycleStartDay.ok) {
      return res.status(400).json({ ok: false, error: "cycleStartDay debe estar entre 1 y 28." });
    }
    if (parsedEnabled.value && !Number.isInteger(nextWeeks)) {
      return res.status(400).json({ ok: false, error: "avoidRepeatsWeeks debe estar entre 1 y 12." });
    }
    if (parsedEnabled.value && !parsedWeeks.ok && req.body?.avoidRepeatsWeeks !== undefined) {
      return res.status(400).json({ ok: false, error: "avoidRepeatsWeeks debe ser un entero entre 1 y 12." });
    }

    const updated = await Household.findByIdAndUpdate(
      effectiveHouseholdId,
      {
        $set: {
          avoidRepeatsEnabled: parsedEnabled.value,
          dinnersEnabled: parsedDinnersEnabled.value,
          avoidRepeatsWeeks: normalizeAvoidRepeatsWeeks(nextWeeks),
          monthlyBudget: parsedBudget.value,
          cycleStartDay: parsedCycleStartDay.value
        }
      },
      { new: true, runValidators: true }
    ).lean();
    if (!updated) {
      return res.status(404).json({ ok: false, error: "No encontramos el hogar." });
    }

    return res.json({ ok: true, household: buildHouseholdResponse(updated) });
  } catch (error) {
    const handled = handleHouseholdError(res, error);
    if (handled) return handled;
    if (error?.name === "ValidationError" || error?.name === "CastError") {
      return res.status(400).json({ ok: false, error: "Preferencias del household no válidas." });
    }
    console.error("[kitchen/household] update preferences failed", {
      userId: req.user?.id || null,
      householdId: req.user?.activeHouseholdId || req.user?.householdId || null,
      body: req.body,
      error: error?.message,
      stack: error?.stack
    });
    return res.status(500).json({ ok: false, error: "No se pudieron actualizar las preferencias del household." });
  }
});

router.get("/invite-code", requireAuth, requireRole("owner"), async (req, res) => {
  try {
    const { household, error } = await resolveShareHousehold(req, req.query?.householdId);
    if (error) {
      return res.status(error.status).json({ ok: false, error: error.message });
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
    const { household, error } = await resolveShareHousehold(req, req.body?.householdId);
    if (error) {
      return res.status(error.status).json({ ok: false, error: error.message });
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
    const { household, error } = await resolveShareHousehold(req, req.body?.householdId);
    if (error) {
      return res.status(error.status).json({ ok: false, error: error.message });
    }
    await assertCanAddUserToHousehold(household);

    const { rawToken, inviteLink, clerkInviteLink, invitation } = await createHouseholdInvitation({
      householdId: household._id,
      createdByUserId: req.kitchenUser._id
    });

    return res.status(201).json({
      ok: true,
      inviteLink,
      clerkInviteLink,
      token: rawToken,
      expiresAt: invitation.expiresAt
    });
  } catch (error) {
    if (sendHouseholdLicenseError(res, error)) return;
    const handled = handleHouseholdError(res, error);
    if (handled) return handled;
    return res.status(500).json({ ok: false, error: "No se pudo crear la invitación." });
  }
});

router.get("/invitations", requireAuth, requireRole("owner"), async (req, res) => {
  try {
    const { household, error } = await resolveShareHousehold(req, req.query?.householdId);
    if (error) {
      return res.status(error.status).json({ ok: false, error: error.message });
    }
    const now = new Date();
    const invitations = await Invitation.find(
      buildScopedFilter(household._id, {
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
        status: invitation.status || "active",
        recipientEmail: invitation.recipientEmail || "",
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

router.get("/invitations/:token/validate", requireAuth, async (req, res) => {
  try {
    const invitation = await findInvitationByToken(req.params.token);
    const invitationStatus = getInvitationStatus(invitation);

    if (!invitation || invitationStatus === "invalid") {
      return res.status(404).json({ ok: false, error: "La invitacion no es valida." });
    }
    if (invitationStatus === "expired") {
      return res.status(410).json({ ok: false, error: "La invitacion ha caducado." });
    }
    if (invitationStatus === "used") {
      return res.status(409).json({ ok: false, error: "La invitacion ya fue utilizada." });
    }
    if (invitationStatus === "revoked") {
      return res.status(410).json({ ok: false, error: "La invitacion ya no esta disponible." });
    }

    const household = await Household.findById(invitation.householdId).select("_id name").lean();
    if (!household) {
      return res.status(404).json({ ok: false, error: "No encontramos el hogar asociado a esta invitacion." });
    }

    const userHouseholdId = req.kitchenUser?.householdId ? String(req.kitchenUser.householdId) : "";
    const targetHouseholdId = String(invitation.householdId);

    if (userHouseholdId && userHouseholdId !== targetHouseholdId) {
      return res.status(409).json({
        ok: false,
        error: "Tu cuenta ya pertenece a otro hogar. No puedes unirte con esta invitacion."
      });
    }

    return res.json({
      ok: true,
      status: userHouseholdId === targetHouseholdId ? "already_member" : "valid",
      householdName: household.name || "",
      expiresAt: invitation.expiresAt,
      role: invitation.role || "member",
      roleLabel: invitationRoleLabel(invitation.role),
      recipientEmail: invitation.recipientEmail || ""
    });
  } catch (error) {
    const handled = handleHouseholdError(res, error);
    if (handled) return handled;
    return res.status(500).json({ ok: false, error: "No se pudo validar la invitacion." });
  }
});

router.post("/invitations/:token/accept", requireAuth, async (req, res) => {
  try {
    const invitation = await findInvitationByToken(req.params.token);
    const invitationStatus = getInvitationStatus(invitation);

    if (!invitation || invitationStatus === "invalid") {
      return res.status(404).json({ ok: false, error: "La invitacion no es valida." });
    }
    if (invitationStatus === "expired") {
      return res.status(410).json({ ok: false, error: "La invitacion ha caducado." });
    }
    if (invitationStatus === "used") {
      return res.status(409).json({ ok: false, error: "La invitacion ya fue utilizada." });
    }
    if (invitationStatus === "revoked") {
      return res.status(410).json({ ok: false, error: "La invitacion ya no esta disponible." });
    }

    if (
      invitation.recipientEmail
      && req.kitchenUser?.email
      && invitation.recipientEmail !== String(req.kitchenUser.email).toLowerCase()
    ) {
      return res.status(403).json({
        ok: false,
        error: "Esta invitacion fue enviada a otro email. Inicia sesion con ese correo o pide una nueva invitacion."
      });
    }

    const currentHouseholdId = req.kitchenUser?.householdId ? String(req.kitchenUser.householdId) : "";
    const targetHouseholdId = String(invitation.householdId);

    if (currentHouseholdId && currentHouseholdId !== targetHouseholdId) {
      return res.status(409).json({
        ok: false,
        error: "Tu cuenta ya pertenece a otro hogar. No puedes unirte con esta invitacion."
      });
    }

    if (currentHouseholdId === targetHouseholdId) {
      return res.json({
        ok: true,
        status: "already_member",
        user: req.kitchenUser.toSafeJSON()
      });
    }

    const targetHousehold = await Household.findById(invitation.householdId)
      .select("_id subscriptionPlan")
      .lean();
    if (!targetHousehold) {
      return res.status(404).json({ ok: false, error: "No encontramos el hogar asociado a esta invitacion." });
    }
    await assertCanAddUserToHousehold(targetHousehold);

    req.kitchenUser.householdId = invitation.householdId;
    req.kitchenUser.role = invitation.role || "member";
    await req.kitchenUser.save();

    invitation.status = "used";
    invitation.usedAt = new Date();
    invitation.usedByUserId = req.kitchenUser._id;
    await invitation.save();

    return res.json({
      ok: true,
      status: "joined",
      user: req.kitchenUser.toSafeJSON()
    });
  } catch (error) {
    if (sendHouseholdLicenseError(res, error)) return;
    const handled = handleHouseholdError(res, error);
    if (handled) return handled;
    return res.status(500).json({ ok: false, error: "No se pudo aceptar la invitacion." });
  }
});

router.post("/invitations/email", requireAuth, requireRole("owner"), async (req, res) => {
  try {
    console.info("[kitchen/household] invitation email send requested", {
      userId: req.user?.id || null,
      requestedHouseholdId: req.body?.householdId || null,
      emailCount: Array.isArray(req.body?.emails) ? req.body.emails.length : 0
    });

    const { household, error } = await resolveShareHousehold(req, req.body?.householdId);
    if (error) {
      return res.status(error.status).json({ ok: false, error: error.message });
    }
    await assertCanAddUserToHousehold(household);

    const { emails, invalidEmails } = normalizeInvitationEmails(req.body?.emails);
    if (!emails.length) {
      return res.status(400).json({ ok: false, error: "Debes indicar al menos un email válido." });
    }
    if (invalidEmails.length) {
      return res.status(400).json({
        ok: false,
        error: "Hay emails no válidos en la lista.",
        invalidEmails
      });
    }

    console.info("[kitchen/household] invitation email payload prepared", {
      userId: req.user?.id || null,
      householdId: String(household._id),
      householdName: household.name || "",
      normalizedEmailCount: emails.length,
      needsInviteCodePersistence: !household.inviteCode
    });

    const inviteCode = await ensureHouseholdInviteCode(household);
    const inviterName = req.kitchenUser?.displayName || req.kitchenUser?.email || "Lunchfy";
    const results = await Promise.all(
      emails.map(async (email) => {
        let createdInvitation = null;
        try {
          console.info("[kitchen/household] preparing invitation email", {
            householdId: String(household._id),
            email
          });

          const { invitation, inviteLink, clerkInviteLink } = await createHouseholdInvitation({
            householdId: household._id,
            createdByUserId: req.kitchenUser._id,
            recipientEmail: email
          });
          createdInvitation = invitation;

          await sendEmail({
            to: email,
            subject: `Join ${household.name} on Lunchfy`,
            html: buildHouseholdInvitationEmail({
              householdName: household.name,
              inviteLink,
              clerkInviteLink,
              inviteCode,
              inviterName,
              recipientEmail: email
            })
          });

          return {
            email,
            ok: true,
            inviteLink,
            clerkInviteLink,
            expiresAt: invitation.expiresAt
          };
        } catch (sendError) {
          if (createdInvitation?._id) {
            await Invitation.deleteOne({ _id: createdInvitation._id }).catch(() => {});
          }
          return {
            email,
            ok: false,
            error: sendError?.message || "No se pudo enviar la invitación."
          };
        }
      })
    );

    const sentCount = results.filter((result) => result.ok).length;
    const failedCount = results.length - sentCount;

    console.info("[kitchen/household] invitation email send completed", {
      userId: req.user?.id || null,
      householdId: String(household._id),
      sentCount,
      failedCount
    });

    return res.status(sentCount ? 201 : 500).json({
      ok: sentCount > 0,
      household: {
        id: household._id,
        name: household.name,
        inviteCode
      },
      results,
      sentCount,
      failedCount
    });
  } catch (error) {
    if (sendHouseholdLicenseError(res, error)) return;
    const handled = handleHouseholdError(res, error);
    if (handled) return handled;
    console.error("[kitchen/household] send invitation emails failed", {
      userId: req.user?.id || null,
      householdId: req.body?.householdId || req.user?.activeHouseholdId || req.user?.householdId || null,
      error: error?.message,
      stack: error?.stack
    });
    return res.status(500).json({ ok: false, error: "No se pudieron enviar las invitaciones por email." });
  }
});

router.post("/placeholders", requireAuth, requireRole("owner"), async (req, res) => {
  try {
    const { displayName, initials, colorId, active, canCook, dinnerActive, dinnerCanCook } = req.body;
    const safeDisplayName = buildDisplayName({ displayName, name: displayName });
    if (!safeDisplayName) {
      return res.status(400).json({ ok: false, error: "El nombre del comensal es obligatorio." });
    }

    const effectiveHouseholdId = getEffectiveHouseholdId(req.user);
    const household = await Household.findById(effectiveHouseholdId)
      .select("_id subscriptionPlan")
      .lean();
    if (!household) {
      return res.status(404).json({ ok: false, error: "El household activo no existe." });
    }
    await assertCanAddNonUserDinerToHousehold(household);

    const suffix = crypto.randomBytes(6).toString("hex");
    const placeholder = await KitchenUser.create({
      username: `placeholder-${suffix}`,
      displayName: safeDisplayName,
      initials: normalizeInitials(initials, safeDisplayName),
      colorId: normalizeColorId(colorId),
      type: "placeholder",
      hasLogin: false,
      isPlaceholder: true,
      active: parseBooleanWithDefault(active, true),
      canCook: parseBooleanWithDefault(canCook, false),
      dinnerActive: parseBooleanWithDefault(dinnerActive, true),
      dinnerCanCook: parseBooleanWithDefault(dinnerCanCook, false),
      role: "member",
      householdId: effectiveHouseholdId,
      createdByUserId: req.kitchenUser?._id || null,
      passwordHash: null,
      email: undefined
    });

    return res.status(201).json({ ok: true, user: placeholder.toSafeJSON() });
  } catch (error) {
    if (sendHouseholdLicenseError(res, error)) return;
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
    const household = await Household.findById(effectiveHouseholdId)
      .select("_id subscriptionPlan")
      .lean();
    if (!household) {
      return res.status(404).json({ ok: false, error: "El household activo no existe." });
    }
    await assertCanAddUserToHousehold(household);
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
    placeholder.active = true;
    placeholder.canCook = true;
    placeholder.dinnerActive = true;
    placeholder.dinnerCanCook = true;
    placeholder.claimedAt = new Date();
    await placeholder.save();

    return res.json({ ok: true, user: placeholder.toSafeJSON() });
  } catch (error) {
    if (sendHouseholdLicenseError(res, error)) return;
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

