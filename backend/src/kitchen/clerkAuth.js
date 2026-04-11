import { createClerkClient, verifyToken } from "@clerk/backend";
import { config } from "../config.js";
import { buildDisplayName, normalizeEmail, normalizeInitials } from "../users/utils.js";
import { generateUniqueHouseholdInviteCode } from "./householdInviteCode.js";
import { Household } from "./models/Household.js";
import { KitchenUser } from "./models/KitchenUser.js";
import { getWeekStart } from "./utils/dates.js";
import { ensureWeekPlan } from "./weekPlanService.js";

const clerkClient = config.clerkSecretKey
  ? createClerkClient({ secretKey: config.clerkSecretKey })
  : null;

function buildAuthError(code, message, status = 401) {
  const error = new Error(message);
  error.code = code;
  error.status = status;
  return error;
}

function getPrimaryEmailAddress(clerkUser) {
  if (!clerkUser) return "";

  const primaryEmail =
    clerkUser.emailAddresses.find((emailAddress) => emailAddress.id === clerkUser.primaryEmailAddressId)
    || clerkUser.emailAddresses[0];

  return normalizeEmail(primaryEmail?.emailAddress);
}

function buildClerkDisplayName(clerkUser, normalizedEmail) {
  const displayName = buildDisplayName({
    firstName: clerkUser?.firstName,
    lastName: clerkUser?.lastName,
    name: clerkUser?.username,
    displayName: ""
  });

  if (displayName) return displayName;
  return normalizedEmail.split("@")[0] || "Nuevo usuario";
}

async function createDevelopmentMongoUserFromClerk(clerkUser, normalizedEmail) {
  if (config.nodeEnv !== "development") return null;

  const displayName = buildClerkDisplayName(clerkUser, normalizedEmail);
  const user = await KitchenUser.create({
    username: normalizedEmail,
    email: normalizedEmail,
    firstName: clerkUser?.firstName || undefined,
    lastName: clerkUser?.lastName || undefined,
    displayName,
    initials: normalizeInitials("", displayName),
    clerkId: clerkUser.id,
    passwordHash: null,
    type: "user",
    hasLogin: true,
    active: true,
    canCook: true,
    dinnerActive: true,
    dinnerCanCook: true,
    role: "owner",
    householdId: null,
    isPlaceholder: false
  });

  const household = await Household.create({
    name: `Casa de ${displayName}`,
    ownerUserId: user._id,
    inviteCode: await generateUniqueHouseholdInviteCode()
  });

  user.householdId = household._id;
  await user.save();

  try {
    await ensureWeekPlan(getWeekStart(new Date()), household._id.toString());
  } catch (error) {
    console.error("[clerk] No se pudo crear el plan semanal durante el alta dev:", error?.message || error);
  }

  return user;
}

export function isClerkAuthEnabled() {
  return Boolean(config.clerkSecretKey);
}

export async function authenticateClerkToken(token) {
  if (!isClerkAuthEnabled() || !token) {
    return null;
  }

  const verified = await verifyToken(token, {
    secretKey: config.clerkSecretKey,
    ...(config.clerkJwtKey ? { jwtKey: config.clerkJwtKey } : {}),
    ...(config.clerkAuthorizedParties.length
      ? { authorizedParties: config.clerkAuthorizedParties }
      : {})
  });

  if (!verified.data?.sub) {
    throw buildAuthError("CLERK_TOKEN_INVALID", "No se pudo validar la sesion de Clerk.");
  }

  const clerkUser = await clerkClient.users.getUser(verified.data.sub);
  const normalizedEmail = getPrimaryEmailAddress(clerkUser);

  if (!normalizedEmail) {
    throw buildAuthError("CLERK_EMAIL_MISSING", "La cuenta de Clerk no tiene un email utilizable.");
  }

  let mongoUser = await KitchenUser.findOne({ email: normalizedEmail });
  if (!mongoUser) {
    // TODO: Remove this development-only bootstrap path before production Clerk cutover.
    mongoUser = await createDevelopmentMongoUserFromClerk(clerkUser, normalizedEmail);
  }

  if (!mongoUser) {
    throw buildAuthError(
      "CLERK_USER_NOT_MAPPED",
      "La identidad de Clerk no esta vinculada a ningun usuario interno."
    );
  }

  if (!mongoUser.clerkId) {
    mongoUser.clerkId = clerkUser.id;
    await mongoUser.save();
  } else if (mongoUser.clerkId !== clerkUser.id) {
    throw buildAuthError(
      "CLERK_USER_MISMATCH",
      "La identidad de Clerk no coincide con el usuario interno vinculado."
    );
  }

  return {
    authType: "clerk",
    clerkClaims: verified.data,
    clerkUser,
    kitchenUser: mongoUser
  };
}
