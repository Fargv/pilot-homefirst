/**
 * betaService.js — Private beta invite gate
 *
 * Controls who can create a NEW household during private beta. Existing users
 * and household member joins are NEVER blocked regardless of beta mode.
 *
 * ── Environment variables ────────────────────────────────────────────────────
 *
 * PRIVATE_BETA_ENABLED=true
 *   Set to "true" to activate the beta gate. When enabled, new-household
 *   registrations require a valid beta invite token. Defaults to off.
 *
 * PUBLIC_REGISTRATION_ENABLED=true
 *   When set to "true" the beta gate is bypassed even if PRIVATE_BETA_ENABLED
 *   is also "true". Use this as a quick override to open registration without
 *   removing PRIVATE_BETA_ENABLED from your environment.
 *
 * ── How to open registration later ──────────────────────────────────────────
 *   Option A: remove PRIVATE_BETA_ENABLED or set it to "false"
 *   Option B: set PUBLIC_REGISTRATION_ENABLED=true (faster rollback)
 *
 * ── Invite lifecycle ─────────────────────────────────────────────────────────
 *   pending → (email sent) → sent → (used once) → used
 *                                 → (admin revoke) → revoked
 *   expired: expiresAt < now, any status except used/revoked
 *   Invites are single-use: status is set to "used" on first successful registration.
 *   Token is a 64-char hex string (32 random bytes → 2^256 space).
 */

import crypto from "crypto";
import { BetaInvite } from "./models/BetaInvite.js";
import { config } from "../config.js";

export function isBetaModeEnabled() {
  return process.env.PRIVATE_BETA_ENABLED === "true"
    && process.env.PUBLIC_REGISTRATION_ENABLED !== "true";
}

export function createBetaToken() {
  return crypto.randomBytes(32).toString("hex");
}

export function buildBetaInviteLink(token) {
  const base = String(config.frontendUrl || "").replace(/\/$/, "");
  // Point to the Clerk sign-up page so new users land directly on registration.
  // betaInvite is stored in sessionStorage there and picked up by ClerkOnboardingPage.
  return `${base}/signup?betaInvite=${encodeURIComponent(token)}`;
}

export async function checkBetaAccess(email, betaToken) {
  if (!isBetaModeEnabled()) return { allowed: true };
  if (!betaToken) return { allowed: false, code: "BETA_ACCESS_REQUIRED" };

  const invite = await BetaInvite.findOne({ token: betaToken });
  if (!invite) return { allowed: false, code: "BETA_INVITE_INVALID" };
  if (invite.status === "revoked") return { allowed: false, code: "BETA_INVITE_REVOKED" };
  if (invite.status === "used") return { allowed: false, code: "BETA_INVITE_USED" };
  if (invite.expiresAt && invite.expiresAt < new Date()) return { allowed: false, code: "BETA_INVITE_EXPIRED" };

  const normalizedInviteEmail = String(invite.email || "").toLowerCase().trim();
  const normalizedEmail = String(email || "").toLowerCase().trim();
  if (normalizedInviteEmail && normalizedEmail && normalizedInviteEmail !== normalizedEmail) {
    return { allowed: false, code: "BETA_INVITE_EMAIL_MISMATCH" };
  }

  return { allowed: true, invite };
}

export async function createBetaInvite({ email, expiresInDays = 30, createdByAdminId = null, note = "" }) {
  const token = createBetaToken();
  const expiresAt = new Date(Date.now() + expiresInDays * 24 * 60 * 60 * 1000);
  const invite = await BetaInvite.create({
    email: email.toLowerCase().trim(),
    token,
    expiresAt,
    createdByAdminId,
    note,
  });
  return { invite, link: buildBetaInviteLink(token) };
}

export async function markBetaInviteUsed(invite, userId, householdId) {
  await BetaInvite.findByIdAndUpdate(invite._id, {
    status: "used",
    usedAt: new Date(),
    usedByUserId: userId || null,
    createdHouseholdId: householdId || null,
  });
}

export function getBetaInviteStatus(invite) {
  if (!invite) return "invalid";
  if (invite.status === "revoked") return "revoked";
  if (invite.status === "used") return "used";
  if (invite.expiresAt && new Date(invite.expiresAt) <= new Date()) return "expired";
  if (invite.sentAt) return "sent";
  return "pending";
}
