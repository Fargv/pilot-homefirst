import express from "express";
import bcrypt from "bcryptjs";
import { KitchenUser } from "../models/KitchenUser.js";
import { createToken, requireAuth } from "../middleware.js";

const router = express.Router();

router.post("/login", async (req, res) => {
  try {
    const { username, password } = req.body;
    if (!username || !password) {
      return res.status(400).json({ ok: false, error: "Usuario y contraseña son obligatorios." });
    }

    const user = await KitchenUser.findOne({ username: String(username).trim() });
    if (!user) return res.status(401).json({ ok: false, error: "Credenciales inválidas." });

    const ok = await bcrypt.compare(password, user.passwordHash);
    if (!ok) return res.status(401).json({ ok: false, error: "Credenciales inválidas." });

    const token = createToken(user);
    return res.json({ ok: true, token, user: user.toSafeJSON() });
  } catch (error) {
    return res.status(500).json({ ok: false, error: "No se pudo iniciar sesión." });
  }
});

router.post("/logout", (req, res) => {
  res.json({ ok: true });
});

router.get("/me", requireAuth, (req, res) => {
  res.json({ ok: true, user: req.kitchenUser.toSafeJSON() });
});

export default router;
