import jwt from "jsonwebtoken";
import { config } from "../config.js";
import { KitchenUser } from "./models/KitchenUser.js";

function normalizeRoleForAuthorization(role) {
  if (role === "owner") return "admin";
  if (role === "member") return "user";
  return role;
}

function buildAuthUser(user, payload) {
  return {
    id: user._id.toString(),
    role: user.role,
    householdId: user.householdId ? user.householdId.toString() : payload.householdId ?? null,
    globalRole: user.globalRole ?? payload.globalRole ?? null,
    activeHouseholdId: user.activeHouseholdId ? user.activeHouseholdId.toString() : payload.activeHouseholdId ?? null
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

export async function requireAuth(req, res, next) {
  try {
    const authHeader = req.headers.authorization || "";
    const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : null;
    if (!token) return res.status(401).json({ ok: false, error: "No hay sesión activa." });

    const payload = jwt.verify(token, config.jwtSecret);
    const user = await KitchenUser.findById(payload.sub);
    if (!user) return res.status(401).json({ ok: false, error: "Sesión inválida." });

    req.kitchenUser = user;
    req.user = buildAuthUser(user, payload);
    return next();
  } catch (error) {
    return res.status(401).json({ ok: false, error: "No se pudo validar la sesión." });
  }
}

export function requireRole(...roles) {
  return (req, res, next) => {
    if (!req.kitchenUser) return res.status(401).json({ ok: false, error: "No hay sesión activa." });
    if (req.kitchenUser.globalRole === "diod") return next();

    const normalizedRoles = roles.map((role) => normalizeRoleForAuthorization(role));
    const userRole = normalizeRoleForAuthorization(req.kitchenUser.role);
    if (!normalizedRoles.includes(userRole)) {
      return res.status(403).json({ ok: false, error: "No tienes permisos para esta acción." });
    }
    return next();
  };
}

export function requireDiod(req, res, next) {
  if (!req.kitchenUser) return res.status(401).json({ ok: false, error: "No hay sesión activa." });
  if (req.kitchenUser.globalRole !== "diod") {
    return res.status(403).json({ ok: false, error: "No tienes permisos para esta acción." });
  }
  return next();
}
