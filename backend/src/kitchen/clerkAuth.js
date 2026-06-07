import { createClerkClient, verifyToken } from "@clerk/backend";
import { config } from "../config.js";
import { buildDisplayName, normalizeEmail } from "../users/utils.js";
import { KitchenUser } from "./models/KitchenUser.js";

const clerkClient = config.clerkSecretKey
  ? createClerkClient({ secretKey: config.clerkSecretKey })
  : null;

const CLERK_API_TIMEOUT_MS = 5000;

function isDevelopmentClerkReconciliationEnabled() {
  return config.nodeEnv === "development" || process.env.APP_ENV === "development";
}

function isDevMode() {
  return (
    config.nodeEnv === "development"
    || process.env.APP_ENV === "development"
    || process.env.CLERK_DEBUG === "true"
  );
}

function logClerkDev(event, details = {}) {
  if (!isDevMode()) return;
  console.log(`[clerk][dev] ${event}`, details);
}

function buildAuthError(code, message, status = 401) {
  const error = new Error(message);
  error.code = code;
  error.status = status;
  return error;
}

/**
 * Wraps a promise with a timeout. Rejects with { code: "CLERK_API_TIMEOUT" }
 * if the promise does not resolve within `ms` milliseconds.
 */
function withTimeout(promise, ms) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(
      () => reject(Object.assign(new Error("Clerk API timed out"), { code: "CLERK_API_TIMEOUT" })),
      ms
    );
    promise.then(
      (v) => { clearTimeout(timer); resolve(v); },
      (e) => { clearTimeout(timer); reject(e); }
    );
  });
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

export async function isEmailRegisteredInClerk(email) {
  const normalizedEmail = normalizeEmail(email);
  if (!normalizedEmail || !clerkClient) return false;

  try {
    const response = await clerkClient.users.getUserList({
      emailAddress: [normalizedEmail],
      limit: 1
    });
    const users = Array.isArray(response?.data) ? response.data : Array.isArray(response) ? response : [];
    return users.some((user) => getPrimaryEmailAddress(user) === normalizedEmail);
  } catch (error) {
    logClerkDev("Clerk email lookup failed", {
      email: normalizedEmail,
      message: error?.message || null
    });
    return false;
  }
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
    logClerkDev("clerk_auth_skipped", {
      hasSecretKey: Boolean(config.clerkSecretKey),
      hasToken: Boolean(token)
    });
    return null;
  }

  logClerkDev("token_verification_start", {
    hasJwtKey: Boolean(config.clerkJwtKey),
    authorizedParties: config.clerkAuthorizedParties,
    tokenLength: token.length
  });

  // ── Step 1: Verify JWT locally (no network call) ─────────────────────────────
  let clerkClaims = null;
  try {
    const verified = await verifyToken(token, {
      secretKey: config.clerkSecretKey,
      ...(config.clerkJwtKey ? { jwtKey: config.clerkJwtKey } : {}),
      ...(config.clerkAuthorizedParties.length
        ? { authorizedParties: config.clerkAuthorizedParties }
        : {})
    });
    clerkClaims = verified?.data || verified;
  } catch (error) {
    logClerkDev("token_verification_failed", {
      name: error?.name || null,
      reason: error?.reason || null,
      message: error?.message || null
    });
    throw buildAuthError(
      "CLERK_TOKEN_INVALID",
      error?.message || "No se pudo validar la sesion de Clerk."
    );
  }

  if (!clerkClaims?.sub) {
    logClerkDev("token_verification_no_subject", {
      hasPayload: Boolean(clerkClaims),
      payloadKeys: clerkClaims ? Object.keys(clerkClaims) : []
    });
    throw buildAuthError("CLERK_TOKEN_INVALID", "No se pudo validar la sesion de Clerk.");
  }

  logClerkDev("token_verified_locally", {
    clerkUserId: clerkClaims.sub,
    azp: clerkClaims.azp || null,
    iss: clerkClaims.iss || null
  });

  // ── Step 2: Fast path — MongoDB lookup by clerkId (no Clerk API needed) ──────
  // Returning users already have clerkId stored in Mongo. We can skip the
  // Clerk Management API call entirely for them, making auth resilient to
  // Clerk API outages.
  const mongoUserByClerkId = await KitchenUser.findOne({ clerkId: clerkClaims.sub });
  if (mongoUserByClerkId) {
    const email = normalizeEmail(mongoUserByClerkId.email);
    logClerkDev("mongo_lookup_by_clerk_id_hit", {
      clerkUserId: clerkClaims.sub,
      userId: mongoUserByClerkId._id.toString(),
      email: email || null
    });
    if (!email) {
      throw buildAuthError("CLERK_EMAIL_MISSING", "La cuenta de Clerk no tiene un email utilizable.");
    }
    // Build a minimal clerkUser stub so downstream code that reads
    // .id, .firstName, .lastName, .emailAddresses doesn't throw.
    // Full Clerk API was not called — only the sub is guaranteed.
    const minimalClerkUser = {
      id: clerkClaims.sub,
      emailAddresses: [],
      firstName: null,
      lastName: null,
      username: null,
      primaryEmailAddressId: null
    };
    return {
      authType: "clerk",
      clerkClaims,
      clerkUser: minimalClerkUser,
      clerkApiSkipped: true,
      email,
      kitchenUser: mongoUserByClerkId
    };
  }

  logClerkDev("mongo_lookup_by_clerk_id_miss", {
    clerkUserId: clerkClaims.sub,
    note: "falling back to Clerk Management API for new or unlinked user"
  });

  // ── Step 3: Clerk Management API (new/unlinked users only) ───────────────────
  // Only reached when no Mongo user has this clerkId yet. Wrapped with a
  // timeout so a Clerk API outage returns a clean 503 instead of a raw 500.
  if (!clerkClient) {
    throw buildAuthError(
      "CLERK_API_UNAVAILABLE",
      "Proveedor de autenticacion no disponible temporalmente.",
      503
    );
  }

  let clerkUser = null;
  try {
    clerkUser = await withTimeout(
      clerkClient.users.getUser(clerkClaims.sub),
      CLERK_API_TIMEOUT_MS
    );
  } catch (error) {
    logClerkDev("clerk_api_failed", {
      clerkUserId: clerkClaims.sub,
      code: error?.code || null,
      message: error?.message || null
    });
    const msg = error?.code === "CLERK_API_TIMEOUT"
      ? "Proveedor de autenticacion no disponible temporalmente. Intentalo de nuevo en unos segundos."
      : "No se pudo contactar con el proveedor de autenticacion.";
    throw buildAuthError("CLERK_API_UNAVAILABLE", msg, 503);
  }

  const normalizedEmail = getPrimaryEmailAddress(clerkUser);
  logClerkDev("clerk_api_user_fetched", {
    clerkUserId: clerkUser.id,
    primaryEmailAddressId: clerkUser.primaryEmailAddressId || null,
    emailCount: clerkUser.emailAddresses?.length || 0,
    normalizedEmail: normalizedEmail || null
  });

  if (!normalizedEmail) {
    throw buildAuthError("CLERK_EMAIL_MISSING", "La cuenta de Clerk no tiene un email utilizable.");
  }

  // ── Step 4: Mongo lookup by email (for users not yet linked) ─────────────────
  const mongoUser = await KitchenUser.findOne({ email: normalizedEmail });
  logClerkDev("mongo_lookup_by_email", {
    email: normalizedEmail,
    found: Boolean(mongoUser),
    userId: mongoUser?._id?.toString?.() || null,
    existingClerkId: mongoUser?.clerkId || null
  });

  return {
    authType: "clerk",
    clerkClaims,
    clerkUser,
    clerkApiSkipped: false,
    email: normalizedEmail,
    kitchenUser: mongoUser
  };
}

export async function authenticateClerkToken(token) {
  const identity = await resolveClerkIdentityFromToken(token);
  if (!identity) return null;

  const { clerkClaims, clerkUser, clerkApiSkipped, kitchenUser: mongoUser, email: normalizedEmail } = identity;

  if (!mongoUser) {
    throw buildAuthError(
      "CLERK_USER_NOT_MAPPED",
      "La identidad de Clerk requiere completar el perfil interno.",
      428
    );
  }

  // clerkApiSkipped === true means we found the user via MongoDB fast-path.
  // Their clerkId is already set — no reconciliation needed.
  if (!clerkApiSkipped && clerkUser) {
    if (!mongoUser.clerkId) {
      mongoUser.clerkId = clerkUser.id;
      await mongoUser.save();
      logClerkDev("clerk_id_attached", {
        userId: mongoUser._id.toString(),
        clerkUserId: clerkUser.id
      });
    } else if (mongoUser.clerkId !== clerkUser.id) {
      if (isDevelopmentClerkReconciliationEnabled()) {
        const previousClerkId = String(mongoUser.clerkId || "").trim();
        mongoUser.clerkId = clerkUser.id;
        await mongoUser.save();
        logClerkDev("clerk_id_reconciled_dev", {
          userId: mongoUser._id.toString(),
          email: normalizedEmail,
          previousClerkId,
          nextClerkId: clerkUser.id,
          reason: "email-matched dev import/test reconciliation"
        });
      } else {
        logClerkDev("clerk_id_mismatch", {
          userId: mongoUser._id.toString(),
          expectedClerkId: mongoUser.clerkId,
          actualClerkId: clerkUser.id
        });
        throw buildAuthError(
          "CLERK_USER_MISMATCH",
          "La identidad de Clerk no coincide con el usuario interno vinculado."
        );
      }
    }
  }

  return {
    authType: "clerk",
    clerkClaims,
    clerkUser,
    kitchenUser: mongoUser
  };
}

/**
 * Pings the Clerk Management API to check reachability.
 * Returns { ok, ms?, error? }.
 * Safe to call from DEV-only debug endpoints — never exposes secrets.
 */
export async function pingClerkApi() {
  if (!clerkClient) {
    return { ok: false, error: "Clerk not configured (no CLERK_SECRET_KEY)" };
  }
  const start = Date.now();
  try {
    await withTimeout(clerkClient.users.getUserList({ limit: 1 }), CLERK_API_TIMEOUT_MS);
    return { ok: true, ms: Date.now() - start };
  } catch (error) {
    return { ok: false, ms: Date.now() - start, error: error?.message || "unknown" };
  }
}
