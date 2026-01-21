import express from "express";
import bcrypt from "bcryptjs";
import { KitchenUser } from "../models/KitchenUser.js";
import { requireAuth, requireRole } from "../middleware.js";

const router = express.Router();

router.get("/", requireAuth, requireRole("admin"), async (req, res) => {
  const users = await KitchenUser.find().sort({ createdAt: 1 });
  res.json({ ok: true, users: users.map((user) => user.toSafeJSON()) });
});

router.get("/members", requireAuth, async (req, res) => {
  const users = await KitchenUser.find().sort({ createdAt: 1 });
  res.json({ ok: true, users: users.map((user) => user.toSafeJSON()) });
});

router.post("/", requireAuth, requireRole("admin"), async (req, res) => {
  try {
    const { username, password, displayName, role } = req.body;
    if (!username || !password || !displayName) {
      return res.status(400).json({ ok: false, error: "Faltan datos obligatorios." });
    }

    const exists = await KitchenUser.findOne({ username: String(username).trim() });
    if (exists) return res.status(409).json({ ok: false, error: "El usuario ya existe." });

    const passwordHash = await bcrypt.hash(password, 10);
    const user = await KitchenUser.create({
      username: String(username).trim(),
      displayName: String(displayName).trim(),
      role: role === "admin" ? "admin" : "user",
      passwordHash
    });

    return res.status(201).json({ ok: true, user: user.toSafeJSON() });
  } catch (error) {
    return res.status(500).json({ ok: false, error: "No se pudo crear el usuario." });
  }
});

export default router;
