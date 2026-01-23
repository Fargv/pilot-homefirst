import express from "express";
import { Category } from "../models/Category.js";
import { requireAuth } from "../middleware.js";

const router = express.Router();

const DEFAULT_COLOR_BG = "#eef2ff";
const DEFAULT_COLOR_TEXT = "#4338ca";

const escapeRegex = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const slugifyCategory = (value = "") => {
  const trimmed = value.trim().toLowerCase();
  if (!trimmed) return "";

  const noAccents = trimmed.normalize("NFD").replace(/\p{Diacritic}/gu, "");
  const noPunctuation = noAccents.replace(/[^\w\s-]/g, "");
  return noPunctuation.replace(/\s+/g, "-").replace(/-+/g, "-").replace(/^-|-$/g, "");
};

router.get("/", requireAuth, async (req, res) => {
  const categories = await Category.find({ active: true }).sort({ order: 1, name: 1 });
  return res.json({ ok: true, categories });
});

router.post("/", requireAuth, async (req, res) => {
  try {
    const { name, colorBg, colorText } = req.body;
    if (!name) return res.status(400).json({ ok: false, error: "El nombre de la categoría es obligatorio." });

    const trimmedName = String(name).trim();
    const slug = slugifyCategory(trimmedName);
    if (!slug) return res.status(400).json({ ok: false, error: "El nombre de la categoría no es válido." });

    const existing = await Category.findOne({
      $or: [
        { slug: new RegExp(`^${escapeRegex(slug)}$`, "i") },
        { name: new RegExp(`^${escapeRegex(trimmedName)}$`, "i") }
      ]
    });

    if (existing) return res.json({ ok: true, category: existing, created: false });

    const category = await Category.create({
      name: trimmedName,
      slug,
      colorBg: colorBg || DEFAULT_COLOR_BG,
      colorText: colorText || DEFAULT_COLOR_TEXT
    });

    return res.status(201).json({ ok: true, category, created: true });
  } catch (error) {
    return res.status(500).json({ ok: false, error: "No se pudo crear la categoría." });
  }
});

export default router;
