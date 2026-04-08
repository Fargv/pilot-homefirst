import { createClerkClient, verifyToken } from "@clerk/backend";
import { config } from "../config.js";
import { normalizeEmail } from "../users/utils.js";
import { KitchenUser } from "./models/KitchenUser.js";

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

  const mongoUser = await KitchenUser.findOne({ email: normalizedEmail });
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
