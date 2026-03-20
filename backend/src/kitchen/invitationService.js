import crypto from "crypto";
import { config } from "../config.js";
import { Invitation } from "./models/Invitation.js";

const INVITATION_TTL_MS = 7 * 24 * 60 * 60 * 1000;

export function hashInvitationToken(token) {
  return crypto.createHash("sha256").update(String(token || "")).digest("hex");
}

export function createInvitationToken() {
  return crypto.randomBytes(32).toString("hex");
}

export function buildInvitationLink(token) {
  const frontendBaseUrl = String(config.frontendUrl || "").replace(/\/$/, "");
  return `${frontendBaseUrl}/invite/${token}`;
}

export function getInvitationStatus(invitation) {
  if (!invitation) return "invalid";
  if (invitation.status === "revoked") return "revoked";
  if (invitation.usedAt || invitation.status === "used") return "used";
  if (invitation.expiresAt && new Date(invitation.expiresAt).getTime() <= Date.now()) return "expired";
  return "active";
}

export async function createHouseholdInvitation({
  householdId,
  createdByUserId,
  role = "member",
  recipientEmail = null,
  expiresAt = new Date(Date.now() + INVITATION_TTL_MS)
}) {
  const rawToken = createInvitationToken();
  const invitation = await Invitation.create({
    householdId,
    tokenHash: hashInvitationToken(rawToken),
    role,
    status: "active",
    createdByUserId,
    recipientEmail: recipientEmail || null,
    expiresAt
  });

  return {
    invitation,
    rawToken,
    inviteLink: buildInvitationLink(rawToken)
  };
}

export async function findActiveInvitationByToken(token) {
  return Invitation.findOne({
    tokenHash: hashInvitationToken(token),
    $or: [
      { status: "active" },
      { status: { $exists: false } },
      { status: null }
    ],
    usedAt: null,
    expiresAt: { $gt: new Date() }
  });
}

export async function findInvitationByToken(token) {
  return Invitation.findOne({
    tokenHash: hashInvitationToken(token)
  });
}
