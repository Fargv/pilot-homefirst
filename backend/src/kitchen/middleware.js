import jwt from "jsonwebtoken";
import { config } from "../config.js";
import { authenticateClerkToken } from "./clerkAuth.js";
import { KitchenUser } from "./models/KitchenUser.js";

function logAuthDev(message, details = {}) {
  if (
    config.nodeEnv !== "development"
    && process.env.APP_ENV !== "development"
    && process.env.CLERK_DEBUG !== "true"
  ) {
    return;
  }
  console.log(`[auth][dev] ${message}`, details);
}

function normalizeRoleForAuthorization(role) {
  if (role === "owner") return "admin";
  if (role === "member") return "user";
  return role;
}

function buildAuthUser(user, payload = {}) {
  return {
    id: user._id.toString(),
    role: user.role,
    householdId: user.householdId ? user.householdId.toString() : payload.householdId ?? null,
    globalRole: user.globalRole ?? payload.globalRole ?? null,
    activeHouseholdId: user.activeHouseholdId ? user.activeHouseholdId.toString() : payload.activeHouseholdId ?? null,
    clerkId: user.clerkId ?? null
  };
}

export function createToken(user) {
  return jwt.sign(
    {
      sub: user._id.toString(),
      userId: user._id.toString(),
      role: user.role,
      globalRole: user.globalRole ?? null,
      householdId: user.householdId ? user.householdId.toString() : null,
      activeHouseholdId: user.activeHouseholdId ? user.activeHouseholdId.toString() : null
    },
    config.jwtSecret,
    {
      expiresIn: "7d"
    }
  );
}

async function authenticateLegacyToken(token) {
  try {
    const payload = jwt.verify(token, config.jwtSecret);
    const user = await KitchenUser.findById(payload.sub);
    if (!user) return null;

    return {
      authType: "legacy",
      payload,
      kitchenUser: user
    };
  } catch {
    return null;
  }
}

export async function requireAuth(req, res, next) {
  try {
    const authHeader = req.headers.authorization || "";
    const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : null;
    if (!token) {
      logAuthDev("Authentication failed: missing bearer token", {
        path: req.originalUrl || req.url,
        method: req.method
      });
      return res.status(401).json({ ok: false, code: "AUTH_TOKEN_MISSING", error: "No hay sesion activa." });
    }

    const legacyAuth = await authenticateLegacyToken(token);
    if (legacyAuth) {
      logAuthDev("Authenticated request with legacy JWT", {
        path: req.originalUrl || req.url,
        userId: legacyAuth.kitchenUser?._id?.toString?.() || null
      });
      req.authType = legacyAuth.authType;
      req.kitchenUser = legacyAuth.kitchenUser;
      req.user = buildAuthUser(legacyAuth.kitchenUser, legacyAuth.payload);
      return next();
    }

    logAuthDev("Legacy JWT did not authenticate; trying Clerk", {
      path: req.originalUrl || req.url,
      method: req.method
    });
    const clerkAuth = await authenticateClerkToken(token);
    if (clerkAuth) {
      logAuthDev("Authenticated request with Clerk token", {
        path: req.originalUrl || req.url,
        clerkUserId: clerkAuth.clerkUser?.id || null,
        mongoUserId: clerkAuth.kitchenUser?._id?.toString?.() || null
      });
      req.authType = clerkAuth.authType;
      req.clerkClaims = clerkAuth.clerkClaims;
      req.clerkUser = clerkAuth.clerkUser;
      req.kitchenUser = clerkAuth.kitchenUser;
      req.user = buildAuthUser(clerkAuth.kitchenUser, clerkAuth.clerkClaims);
      return next();
    }

    return res.status(401).json({ ok: false, error: "No se pudo validar la sesion." });
  } catch (error) {
    const status = Number(error?.status || 401);
    const message = error?.message || "No se pudo validar la sesion.";
    logAuthDev("Authentication failed", {
      path: req.originalUrl || req.url,
      status,
      code: error?.code || "AUTH_INVALID",
      message
    });
    return res.status(status).json({
      ok: false,
      code: error?.code || "AUTH_INVALID",
      error: message,
      onboardingRequired: error?.code === "CLERK_USER_NOT_MAPPED"
    });
  }
}

export function requireRole(...roles) {
  return (req, res, next) => {
    if (!req.kitchenUser) return res.status(401).json({ ok: false, error: "No hay sesion activa." });
    if (req.kitchenUser.globalRole === "diod") return next();

    const normalizedRoles = roles.map((role) => normalizeRoleForAuthorization(role));
    const userRole = normalizeRoleForAuthorization(req.kitchenUser.role);
    if (!normalizedRoles.includes(userRole)) {
      return res.status(403).json({ ok: false, error: "No tienes permisos para esta accion." });
    }
    return next();
  };
}

export function requireDiod(req, res, next) {
  if (!req.kitchenUser) return res.status(401).json({ ok: false, error: "No hay sesion activa." });
  if (req.kitchenUser.globalRole !== "diod") {
    return res.status(403).json({ ok: false, error: "No tienes permisos para esta accion." });
  }
  return next();
}
