import express from "express";
import bcrypt from "bcryptjs";
import { KitchenUser } from "../kitchen/models/KitchenUser.js";
import { Household } from "../kitchen/models/Household.js";
import { requireAuth, requireRole } from "../kitchen/middleware.js";
import {
  buildScopedFilter,
  getEffectiveHouseholdId,
  handleHouseholdError,
  shouldUseLegacyFallback
} from "../kitchen/householdScope.js";
import { buildDisplayName, isValidEmail, normalizeEmail, normalizeRole } from "./utils.js";

const router = express.Router();

router.get("/bootstrap-needed", async (req, res) => {
  try {
    const total = await KitchenUser.countDocuments();
    res.json({ needed: total === 0 });
  } catch (error) {
    res.status(500).json({ ok: false, error: "No se pudo comprobar el estado de usuarios." });
  }
});

router.post("/bootstrap", async (req, res) => {
  try {
    const total = await KitchenUser.countDocuments();
    if (total > 0) {
      return res.status(403).json({ ok: false, error: "Ya existe un usuario creado." });
    }

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

    const safeDisplayName = buildDisplayName({ firstName, lastName, name, displayName });
    if (!safeDisplayName) {
      return res.status(400).json({ ok: false, error: "El nombre es obligatorio." });
    }

    const passwordHash = await bcrypt.hash(password, 10);
    const user = await KitchenUser.create({
      username: normalizedEmail,
      email: normalizedEmail,
      firstName: firstName ? String(firstName).trim() : undefined,
      lastName: lastName ? String(lastName).trim() : undefined,
      displayName: safeDisplayName,
      role: "owner",
      passwordHash
    });

    const household = await Household.create({
      name: `Casa de ${safeDisplayName}`,
      ownerUserId: user._id
    });

    user.householdId = household._id;
    await user.save();

    return res.status(201).json({ ok: true, user: user.toSafeJSON() });
  } catch (error) {
    return res.status(500).json({ ok: false, error: "No se pudo crear el primer usuario." });
  }
});

router.get("/", requireAuth, requireRole("admin"), async (req, res) => {
  try {
    const effectiveHouseholdId = getEffectiveHouseholdId(req.user);
    const includeLegacy = shouldUseLegacyFallback(effectiveHouseholdId);
    const users = await KitchenUser.find(buildScopedFilter(effectiveHouseholdId, {}, { includeLegacy })).sort({ createdAt: 1 });
    res.json({ ok: true, users: users.map((user) => user.toSafeJSON()) });
  } catch (error) {
    const handled = handleHouseholdError(res, error);
    if (handled) return handled;
    res.status(500).json({ ok: false, error: "No se pudieron cargar los usuarios." });
  }
});

router.post("/", requireAuth, requireRole("admin"), async (req, res) => {
  try {
    const { email, password, firstName, lastName, name, displayName, role } = req.body;
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
      role: normalizeRole(role),
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
