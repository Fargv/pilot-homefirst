import jwt from "jsonwebtoken";
import { config } from "../config.js";
import { KitchenUser } from "./models/KitchenUser.js";

export function createToken(user) {
  return jwt.sign({ sub: user._id.toString(), role: user.role }, config.jwtSecret, {
    expiresIn: "7d"
  });
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
    return next();
  } catch (error) {
    return res.status(401).json({ ok: false, error: "No se pudo validar la sesión." });
  }
}

export function requireRole(...roles) {
  return (req, res, next) => {
    if (!req.kitchenUser) return res.status(401).json({ ok: false, error: "No hay sesión activa." });
    if (!roles.includes(req.kitchenUser.role)) {
      return res.status(403).json({ ok: false, error: "No tienes permisos para esta acción." });
    }
    return next();
  };
}
