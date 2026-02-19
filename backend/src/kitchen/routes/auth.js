import express from "express";
import crypto from "crypto";
import bcrypt from "bcryptjs";
import { KitchenUser } from "../models/KitchenUser.js";
import { Invitation } from "../models/Invitation.js";
import { createToken, requireAuth } from "../middleware.js";
import { normalizeEmail } from "../../users/utils.js";

const DIOD_EMAIL = "admin@admin.com";

const router = express.Router();


function hashInviteToken(token) {
  return crypto.createHash("sha256").update(token).digest("hex");
}


router.post("/login", async (req, res) => {
  try {
    const { email, password, username } = req.body;
    const loginValue = normalizeEmail(email || username);
    if (!loginValue || !password) {
      return res.status(400).json({ ok: false, error: "Email y contraseña son obligatorios." });
    }

    const user = await KitchenUser.findOne({ email: loginValue });
    if (!user) return res.status(401).json({ ok: false, error: "Credenciales inválidas." });

    if (!user.passwordHash || user.isPlaceholder) {
      return res.status(401).json({ ok: false, error: "Credenciales inválidas." });
    }

    const ok = await bcrypt.compare(password, user.passwordHash);
    if (!ok) return res.status(401).json({ ok: false, error: "Credenciales inválidas." });

    const isDiod = loginValue === DIOD_EMAIL;
    const shouldUpdateGlobalRole = (isDiod && user.globalRole !== "diod") || (!isDiod && user.globalRole);
    if (shouldUpdateGlobalRole) {
      user.globalRole = isDiod ? "diod" : null;
      await user.save();
    }

    const token = createToken(user);
    const safeUser = {
      ...user.toSafeJSON(),
      migrationPending: !user.householdId
    };
    return res.json({ ok: true, token, user: safeUser });
  } catch (error) {
    return res.status(500).json({ ok: false, error: "No se pudo iniciar sesión." });
  }
});

router.post("/accept-invite", async (req, res) => {
  try {
    const { token, email, password, displayName } = req.body;
    const normalizedEmail = normalizeEmail(email);

    if (!token || !normalizedEmail || !password || !displayName) {
      return res.status(400).json({
        ok: false,
        error: "Token, email, contraseña y nombre son obligatorios."
      });
    }

    if (String(password).length < 8) {
      return res.status(400).json({ ok: false, error: "La contraseña debe tener al menos 8 caracteres." });
    }

    const invitation = await Invitation.findOne({
      tokenHash: hashInviteToken(token),
      usedAt: null,
      expiresAt: { $gt: new Date() }
    });

    if (!invitation) {
      return res.status(400).json({ ok: false, error: "La invitación no es válida o expiró." });
    }

    let user = await KitchenUser.findOne({ email: normalizedEmail });

    if (user) {
      if (user.householdId && user.householdId.toString() !== invitation.householdId.toString()) {
        return res.status(409).json({
          ok: false,
          error: "Ese email ya pertenece a otro hogar y no se puede unir con esta invitación."
        });
      }

      if (!user.householdId) {
        user.householdId = invitation.householdId;
      }
      if (user.isPlaceholder) {
        user.isPlaceholder = false;
        user.claimedAt = new Date();
      }
      user.displayName = String(displayName).trim();
      user.passwordHash = await bcrypt.hash(password, 10);
      user.role = invitation.role || "member";
      await user.save();
    } else {
      user = await KitchenUser.create({
        username: normalizedEmail,
        email: normalizedEmail,
        displayName: String(displayName).trim(),
        passwordHash: await bcrypt.hash(password, 10),
        role: invitation.role || "member",
        householdId: invitation.householdId,
        isPlaceholder: false
      });
    }

    invitation.usedAt = new Date();
    invitation.usedByUserId = user._id;
    await invitation.save();

    const jwt = createToken(user);
    return res.json({ ok: true, token: jwt, user: user.toSafeJSON() });
  } catch (error) {
    return res.status(500).json({ ok: false, error: "No se pudo aceptar la invitación." });
  }
});

router.post("/logout", (req, res) => {
  res.json({ ok: true });
});

router.get("/me", requireAuth, (req, res) => {
  res.json({
    ok: true,
    user: {
      ...req.kitchenUser.toSafeJSON(),
      migrationPending: !req.kitchenUser.householdId
    },
    auth: req.user
  });
});

export default router;
