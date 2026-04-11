import jwt from "jsonwebtoken";
import { config } from "../config.js";
import { authenticateClerkToken } from "./clerkAuth.js";
import { KitchenUser } from "./models/KitchenUser.js";

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
    if (!token) return res.status(401).json({ ok: false, error: "No hay sesion activa." });

    const legacyAuth = await authenticateLegacyToken(token);
    if (legacyAuth) {
      req.authType = legacyAuth.authType;
      req.kitchenUser = legacyAuth.kitchenUser;
      req.user = buildAuthUser(legacyAuth.kitchenUser, legacyAuth.payload);
      return next();
    }

    const clerkAuth = await authenticateClerkToken(token);
    if (clerkAuth) {
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
    return res.status(status).json({ ok: false, code: error?.code || "AUTH_INVALID", error: message });
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
