import { createClerkClient, verifyToken } from "@clerk/backend";
import { config } from "../config.js";
import { buildDisplayName, normalizeEmail } from "../users/utils.js";
import { KitchenUser } from "./models/KitchenUser.js";

const clerkClient = config.clerkSecretKey
  ? createClerkClient({ secretKey: config.clerkSecretKey })
  : null;

function logClerkDev(message, details = {}) {
  if (
    config.nodeEnv !== "development"
    && process.env.APP_ENV !== "development"
    && process.env.CLERK_DEBUG !== "true"
  ) {
    return;
  }
  console.log(`[clerk][dev] ${message}`, details);
}

function buildAuthError(code, message, status = 401) {
  const error = new Error(message);
  error.code = code;
  error.status = status;
  return error;
}

export function getPrimaryEmailAddress(clerkUser) {
  if (!clerkUser) return "";

  const primaryEmail =
    clerkUser.emailAddresses.find((emailAddress) => emailAddress.id === clerkUser.primaryEmailAddressId)
    || clerkUser.emailAddresses[0];

  return normalizeEmail(primaryEmail?.emailAddress);
}

export function buildClerkDisplayName(clerkUser, normalizedEmail) {
  const displayName = buildDisplayName({
    firstName: clerkUser?.firstName,
    lastName: clerkUser?.lastName,
    name: clerkUser?.username,
    displayName: ""
  });

  if (displayName) return displayName;
  return normalizedEmail.split("@")[0] || "Nuevo usuario";
}

export function isClerkAuthEnabled() {
  return Boolean(config.clerkSecretKey);
}

export async function deleteClerkUserById(clerkId, context = {}) {
  const safeClerkId = String(clerkId || "").trim();
  if (!safeClerkId) {
    return { ok: true, skipped: true, reason: "missing_clerk_id" };
  }

  if (!clerkClient) {
    logClerkDev("Clerk user deletion skipped because Clerk is not configured", {
      clerkUserId: safeClerkId,
      ...context
    });
    return { ok: false, skipped: true, clerkId: safeClerkId, error: "Clerk is not configured." };
  }

  try {
    await clerkClient.users.deleteUser(safeClerkId);
    logClerkDev("Deleted Clerk user after Mongo user deletion", {
      clerkUserId: safeClerkId,
      ...context
    });
    return { ok: true, clerkId: safeClerkId };
  } catch (error) {
    console.error("[clerk] Failed to delete Clerk user after Mongo user deletion", {
      clerkUserId: safeClerkId,
      ...context,
      error: error?.message,
      stack: error?.stack
    });
    return {
      ok: false,
      clerkId: safeClerkId,
      error: error?.message || "No se pudo eliminar el usuario en Clerk."
    };
  }
}

export async function resolveClerkIdentityFromToken(token) {
  if (!isClerkAuthEnabled() || !token) {
    logClerkDev("Clerk auth skipped", {
      hasSecretKey: Boolean(config.clerkSecretKey),
      hasToken: Boolean(token)
    });
    return null;
  }

  logClerkDev("Verifying Clerk token", {
    hasJwtKey: Boolean(config.clerkJwtKey),
    authorizedParties: config.clerkAuthorizedParties,
    tokenLength: token.length
  });

  let verified = null;
  try {
    verified = await verifyToken(token, {
      secretKey: config.clerkSecretKey,
      ...(config.clerkJwtKey ? { jwtKey: config.clerkJwtKey } : {}),
      ...(config.clerkAuthorizedParties.length
        ? { authorizedParties: config.clerkAuthorizedParties }
        : {})
    });
  } catch (error) {
    logClerkDev("Clerk token verification failed", {
      name: error?.name || null,
      reason: error?.reason || null,
      message: error?.message || null
    });
    throw buildAuthError(
      "CLERK_TOKEN_INVALID",
      error?.message || "No se pudo validar la sesion de Clerk."
    );
  }

  const clerkClaims = verified?.data || verified;
  const verificationErrors = verified?.errors || [];

  if (!clerkClaims?.sub) {
    logClerkDev("Clerk token verification returned no subject", {
      hasPayload: Boolean(clerkClaims),
      payloadKeys: clerkClaims ? Object.keys(clerkClaims) : [],
      errors: verificationErrors.map((error) => error.message)
    });
    throw buildAuthError("CLERK_TOKEN_INVALID", "No se pudo validar la sesion de Clerk.");
  }

  logClerkDev("Clerk token verified", {
    clerkUserId: clerkClaims.sub,
    azp: clerkClaims.azp || null,
    iss: clerkClaims.iss || null
  });
  const clerkUser = await clerkClient.users.getUser(clerkClaims.sub);
  const normalizedEmail = getPrimaryEmailAddress(clerkUser);

  logClerkDev("Fetched Clerk user", {
    clerkUserId: clerkUser.id,
    primaryEmailAddressId: clerkUser.primaryEmailAddressId || null,
    emailCount: clerkUser.emailAddresses?.length || 0,
    normalizedEmail: normalizedEmail || null
  });

  if (!normalizedEmail) {
    throw buildAuthError("CLERK_EMAIL_MISSING", "La cuenta de Clerk no tiene un email utilizable.");
  }

  const mongoUser = await KitchenUser.findOne({ email: normalizedEmail });
  logClerkDev("Mongo user lookup by email completed", {
    email: normalizedEmail,
    found: Boolean(mongoUser),
    userId: mongoUser?._id?.toString?.() || null,
    existingClerkId: mongoUser?.clerkId || null
  });

  return {
    authType: "clerk",
    clerkClaims,
    clerkUser,
    email: normalizedEmail,
    kitchenUser: mongoUser
  };
}

export async function authenticateClerkToken(token) {
  const identity = await resolveClerkIdentityFromToken(token);
  if (!identity) return null;

  const { clerkUser, kitchenUser: mongoUser } = identity;

  if (!mongoUser) {
    throw buildAuthError(
      "CLERK_USER_NOT_MAPPED",
      "La identidad de Clerk requiere completar el perfil interno.",
      428
    );
  }

  if (!mongoUser.clerkId) {
    mongoUser.clerkId = clerkUser.id;
    await mongoUser.save();
    logClerkDev("Attached Clerk ID to existing Mongo user", {
      userId: mongoUser._id.toString(),
      clerkUserId: clerkUser.id
    });
  } else if (mongoUser.clerkId !== clerkUser.id) {
    logClerkDev("Clerk ID mismatch", {
      userId: mongoUser._id.toString(),
      expectedClerkId: mongoUser.clerkId,
      actualClerkId: clerkUser.id
    });
    throw buildAuthError(
      "CLERK_USER_MISMATCH",
      "La identidad de Clerk no coincide con el usuario interno vinculado."
    );
  }

  return {
    authType: "clerk",
    clerkClaims: identity.clerkClaims,
    clerkUser,
    kitchenUser: mongoUser
  };
}
