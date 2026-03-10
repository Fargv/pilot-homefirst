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
  const householdId = household?._id || household;
  if (!householdId) {
    throw new Error("HOUSEHOLD_ID_REQUIRED_FOR_INVITE_CODE");
  }

  if (household?.inviteCode) {
    return household.inviteCode;
  }

  const currentHousehold = await Household.findById(householdId).select("_id inviteCode").lean();
  if (!currentHousehold) {
    throw new Error("HOUSEHOLD_NOT_FOUND_FOR_INVITE_CODE");
  }

  if (currentHousehold.inviteCode) {
    return currentHousehold.inviteCode;
  }

  console.info("[householdInviteCode] invite code missing, generating", {
    householdId: String(householdId)
  });

  const maxAttempts = 20;
  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    const candidate = randomSixDigitCode();

    try {
      const updateResult = await Household.updateOne(
        {
          _id: householdId,
          $or: [
            { inviteCode: null },
            { inviteCode: { $exists: false } },
            { inviteCode: "" }
          ]
        },
        { $set: { inviteCode: candidate } }
      );

      if (updateResult.modifiedCount > 0) {
        console.info("[householdInviteCode] invite code persisted", {
          householdId: String(householdId)
        });
        return candidate;
      }

      const existingHousehold = await Household.findById(householdId).select("_id inviteCode").lean();
      if (!existingHousehold) {
        throw new Error("HOUSEHOLD_NOT_FOUND_FOR_INVITE_CODE");
      }
      if (existingHousehold.inviteCode) {
        return existingHousehold.inviteCode;
      }
    } catch (error) {
      if (error?.code === 11000) continue;
      throw error;
    }
  }

  throw new Error("NO_UNIQUE_INVITE_CODE_AVAILABLE");
}

export function isValidInviteCodeFormat(value) {
  return /^\d{6}$/.test(String(value || "").trim());
}
