import express from "express";
import bcrypt from "bcryptjs";
import { KitchenUser } from "../models/KitchenUser.js";
import { requireAuth, requireRole } from "../middleware.js";
import {
  buildDisplayName,
  isValidEmail,
  normalizeEmail,
  normalizeRole,
  normalizeInitials,
  normalizeColorId
} from "../../users/utils.js";
import { buildScopedFilter, getEffectiveHouseholdId, handleHouseholdError } from "../householdScope.js";

const router = express.Router();

router.get("/", requireAuth, requireRole("admin"), async (req, res) => {
  try {
    const effectiveHouseholdId = getEffectiveHouseholdId(req.user);
    const users = await KitchenUser.find(buildScopedFilter(effectiveHouseholdId, {})).sort({ createdAt: 1 });
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
    const users = await KitchenUser.find(buildScopedFilter(effectiveHouseholdId, {})).sort({ createdAt: 1 });
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
      initials: normalizeInitials(req.body?.initials, safeDisplayName),
      colorId: normalizeColorId(req.body?.colorId),
      role: normalizeRole(req.body.role),
      householdId: effectiveHouseholdId,
      passwordHash
    });

    return res.status(201).json({ ok: true, user: user.toSafeJSON() });
  } catch (error) {
    const handled = handleHouseholdError(res, error);
    if (handled) return handled;
    return res.status(500).json({ ok: false, error: "No se pudo crear el usuario." });
  }
});

router.patch("/me", requireAuth, async (req, res) => {
  try {
    const safeDisplayName = buildDisplayName({
      firstName: req.body?.firstName,
      lastName: req.body?.lastName,
      displayName: req.body?.displayName,
      name: req.body?.displayName
    });
    if (!safeDisplayName) {
      return res.status(400).json({ ok: false, error: "El nombre para mostrar es obligatorio." });
    }

    req.kitchenUser.displayName = safeDisplayName;
    req.kitchenUser.firstName = req.body?.firstName ? String(req.body.firstName).trim() : req.kitchenUser.firstName;
    req.kitchenUser.lastName = req.body?.lastName ? String(req.body.lastName).trim() : req.kitchenUser.lastName;
    req.kitchenUser.initials = normalizeInitials(req.body?.initials, safeDisplayName);
    req.kitchenUser.colorId = normalizeColorId(req.body?.colorId);
    await req.kitchenUser.save();

    return res.json({ ok: true, user: req.kitchenUser.toSafeJSON() });
  } catch (error) {
    return res.status(500).json({ ok: false, error: "No se pudo actualizar el perfil." });
  }
});

router.put("/me/password", requireAuth, async (req, res) => {
  try {
    const currentPassword = String(req.body?.currentPassword || "");
    const newPassword = String(req.body?.newPassword || "");
    if (!currentPassword || !newPassword) {
      return res.status(400).json({ ok: false, error: "Debes enviar la contraseña actual y la nueva." });
    }
    if (newPassword.length < 8) {
      return res.status(400).json({ ok: false, error: "La nueva contraseña debe tener al menos 8 caracteres." });
    }
    if (!req.kitchenUser.passwordHash) {
      return res.status(400).json({ ok: false, error: "Esta cuenta no tiene contraseña local activa." });
    }

    const passwordOk = await bcrypt.compare(currentPassword, req.kitchenUser.passwordHash);
    if (!passwordOk) {
      return res.status(401).json({ ok: false, error: "La contraseña actual no es correcta." });
    }

    req.kitchenUser.passwordHash = await bcrypt.hash(newPassword, 10);
    await req.kitchenUser.save();
    return res.json({ ok: true });
  } catch (error) {
    return res.status(500).json({ ok: false, error: "No se pudo actualizar la contraseña." });
  }
});

router.put("/members/:id", requireAuth, requireRole("owner"), async (req, res) => {
  try {
    const effectiveHouseholdId = getEffectiveHouseholdId(req.user);
    const member = await KitchenUser.findOne(buildScopedFilter(effectiveHouseholdId, { _id: req.params.id }));
    if (!member) {
      return res.status(404).json({ ok: false, error: "No encontramos al miembro." });
    }
    if (String(member._id) === String(req.kitchenUser._id)) {
      return res.status(400).json({ ok: false, error: "No puedes editar tu propio rol desde esta pantalla." });
    }

    const nextRole = req.body?.role ? normalizeRole(req.body.role) : member.role;
    if (req.body?.role) {
      member.role = nextRole;
    }
    if (req.body?.displayName) {
      const nextDisplayName = buildDisplayName({
        displayName: req.body.displayName,
        name: req.body.displayName
      });
      if (!nextDisplayName) {
        return res.status(400).json({ ok: false, error: "El nombre para mostrar no es válido." });
      }
      member.displayName = nextDisplayName;
      member.initials = normalizeInitials(req.body?.initials, nextDisplayName);
    } else if (typeof req.body?.initials !== "undefined") {
      member.initials = normalizeInitials(req.body?.initials, member.displayName);
    }
    if (typeof req.body?.colorId !== "undefined") {
      member.colorId = normalizeColorId(req.body?.colorId);
    }

    await member.save();
    return res.json({ ok: true, user: member.toSafeJSON() });
  } catch (error) {
    const handled = handleHouseholdError(res, error);
    if (handled) return handled;
    return res.status(500).json({ ok: false, error: "No se pudo actualizar el miembro." });
  }
});

router.delete("/members/:id", requireAuth, requireRole("owner"), async (req, res) => {
  try {
    const effectiveHouseholdId = getEffectiveHouseholdId(req.user);
    const member = await KitchenUser.findOne(buildScopedFilter(effectiveHouseholdId, { _id: req.params.id }));
    if (!member) {
      return res.status(404).json({ ok: false, error: "No encontramos al miembro." });
    }
    if (String(member._id) === String(req.kitchenUser._id)) {
      return res.status(400).json({ ok: false, error: "No puedes eliminar tu propia cuenta del hogar." });
    }

    await KitchenUser.deleteOne({ _id: member._id });
    return res.json({ ok: true });
  } catch (error) {
    const handled = handleHouseholdError(res, error);
    if (handled) return handled;
    return res.status(500).json({ ok: false, error: "No se pudo eliminar el miembro." });
  }
});

export default router;
