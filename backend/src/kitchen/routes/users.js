import express from "express";
import bcrypt from "bcryptjs";
import { KitchenUser } from "../models/KitchenUser.js";
import { requireAuth, requireRole } from "../middleware.js";
import { buildDisplayName, isValidEmail, normalizeEmail, normalizeRole } from "../../users/utils.js";
import { buildScopedFilter, getEffectiveHouseholdId, handleHouseholdError, shouldUseLegacyFallback } from "../householdScope.js";

const router = express.Router();

router.get("/", requireAuth, requireRole("admin"), async (req, res) => {
  try {
    const effectiveHouseholdId = getEffectiveHouseholdId(req.user);
    const includeLegacy = shouldUseLegacyFallback(effectiveHouseholdId);
    const users = await KitchenUser.find(buildScopedFilter(effectiveHouseholdId, {}, { includeLegacy })).sort({ createdAt: 1 });
    res.json({ ok: true, users: users.map((user) => user.toSafeJSON()) });
  } catch (error) {
    const handled = handleHouseholdError(res, error);
    if (handled) return handled;
    return res.status(500).json({ ok: false, error: "No se pudieron cargar los usuarios." });
  }
});

router.get("/members", requireAuth, async (req, res) => {
  try {
    const effectiveHouseholdId = getEffectiveHouseholdId(req.user);
    const includeLegacy = shouldUseLegacyFallback(effectiveHouseholdId);
    const users = await KitchenUser.find(buildScopedFilter(effectiveHouseholdId, {}, { includeLegacy })).sort({ createdAt: 1 });
    res.json({ ok: true, users: users.map((user) => user.toSafeJSON()) });
  } catch (error) {
    const handled = handleHouseholdError(res, error);
    if (handled) return handled;
    return res.status(500).json({ ok: false, error: "No se pudieron cargar los miembros." });
  }
});

router.post("/", requireAuth, requireRole("admin"), async (req, res) => {
  try {
    const { email, password, firstName, lastName, name, displayName } = req.body;
    const normalizedEmail = normalizeEmail(email);
    if (!normalizedEmail || !password) {
      return res.status(400).json({ ok: false, error: "Email y contraseña son obligatorios." });
    }
    if (!isValidEmail(normalizedEmail)) {
      return res.status(400).json({ ok: false, error: "El email no es válido." });
    }
    if (String(password).length < 8) {
      return res.status(400).json({ ok: false, error: "La contraseña debe tener al menos 8 caracteres." });
    }

    const exists = await KitchenUser.findOne({ email: normalizedEmail });
    if (exists) return res.status(409).json({ ok: false, error: "El email ya está registrado." });

    const safeDisplayName = buildDisplayName({ firstName, lastName, name, displayName });
    if (!safeDisplayName) {
      return res.status(400).json({ ok: false, error: "El nombre es obligatorio." });
    }

    const effectiveHouseholdId = getEffectiveHouseholdId(req.user);
    const passwordHash = await bcrypt.hash(password, 10);
    const user = await KitchenUser.create({
      username: normalizedEmail,
      email: normalizedEmail,
      firstName: firstName ? String(firstName).trim() : undefined,
      lastName: lastName ? String(lastName).trim() : undefined,
      displayName: safeDisplayName,
      role: normalizeRole(req.body.role),
      ...(effectiveHouseholdId ? { householdId: effectiveHouseholdId } : {}),
      passwordHash
    });

    return res.status(201).json({ ok: true, user: user.toSafeJSON() });
  } catch (error) {
    const handled = handleHouseholdError(res, error);
    if (handled) return handled;
    return res.status(500).json({ ok: false, error: "No se pudo crear el usuario." });
  }
});

export default router;
