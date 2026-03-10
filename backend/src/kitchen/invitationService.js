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
    usedAt: null,
    expiresAt: { $gt: new Date() }
  });
}
