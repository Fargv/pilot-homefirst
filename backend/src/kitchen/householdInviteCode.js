import { Household } from "./models/Household.js";

function randomSixDigitCode() {
  return String(Math.floor(100000 + Math.random() * 900000));
}

export async function generateUniqueHouseholdInviteCode() {
  const maxAttempts = 20;
  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    const candidate = randomSixDigitCode();
    const exists = await Household.exists({ inviteCode: candidate });
    if (!exists) return candidate;
  }
  throw new Error("NO_UNIQUE_INVITE_CODE_AVAILABLE");
}

export async function ensureHouseholdInviteCode(household) {
  if (household.inviteCode) return household.inviteCode;
  household.inviteCode = await generateUniqueHouseholdInviteCode();
  await household.save();
  return household.inviteCode;
}

export function isValidInviteCodeFormat(value) {
  return /^\d{6}$/.test(String(value || "").trim());
}
