import express from "express";
import { KitchenIngredient } from "../models/KitchenIngredient.js";
import { requireAuth } from "../middleware.js";
import { normalizeIngredientName } from "../utils/normalize.js";

const router = express.Router();
const MAX_RESULTS = 15;
const escapeRegex = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const ACCENT_CHAR_MAP = {
  a: "aàáâäãå",
  e: "eèéêë",
  i: "iìíîï",
  o: "oòóôöõ",
  u: "uùúûü",
  n: "nñ",
  c: "cç"
};

const buildAccentInsensitiveRegex = (value) => {
  const escaped = escapeRegex(value);
  const pattern = escaped
    .split("")
    .map((char) => {
      const lower = char.toLowerCase();
      if (ACCENT_CHAR_MAP[lower]) {
        return `[${ACCENT_CHAR_MAP[lower]}]`;
      }
      return char;
    })
    .join("");
  return new RegExp(pattern, "i");
};

router.get("/", requireAuth, async (req, res) => {
  const { q } = req.query;
  const filters = { active: true };
  if (process.env.NODE_ENV === "development") {
    console.log("🔎 [kitchenIngredients] search", { q });
  }

  if (q) {
    const trimmed = String(q).trim();
    const normalized = normalizeIngredientName(trimmed);
    const normalizedRegex = normalized ? new RegExp(escapeRegex(normalized), "i") : null;
    const normalizedFallback =
      normalized && normalized.length > 4 ? new RegExp(escapeRegex(normalized.slice(0, -1)), "i") : null;
    const nameRegex = trimmed ? buildAccentInsensitiveRegex(trimmed) : null;
    const orFilters = [];
    if (normalizedRegex) orFilters.push({ canonicalName: normalizedRegex });
    if (normalizedFallback) orFilters.push({ canonicalName: normalizedFallback });
    if (nameRegex) orFilters.push({ name: nameRegex });
    if (orFilters.length) filters.$or = orFilters;
  }

  const ingredients = await KitchenIngredient.find(filters)
    .populate("categoryId", "name colorBg colorText")
    .sort({ name: 1 })
    .limit(MAX_RESULTS);

  return res.json({ ok: true, ingredients });
});

router.post("/", requireAuth, async (req, res) => {
  try {
    const { name, categoryId } = req.body;
    if (process.env.NODE_ENV === "development") {
      console.log("🧪 [kitchenIngredients] create", { name, categoryId });
    }
    if (!name) return res.status(400).json({ ok: false, error: "El nombre del ingrediente es obligatorio." });
    if (!categoryId)
      return res.status(400).json({ ok: false, error: "Selecciona una categoría para el ingrediente." });

    const trimmedName = String(name).trim();
    const canonicalName = normalizeIngredientName(trimmedName);
    if (!canonicalName)
      return res.status(400).json({ ok: false, error: "El nombre del ingrediente no es válido." });

    const existing = await KitchenIngredient.findOne({
      canonicalName: new RegExp(`^${escapeRegex(canonicalName)}$`, "i")
    }).populate("categoryId", "name colorBg colorText");

    if (existing) return res.json({ ok: true, ingredient: existing, created: false });

    const ingredient = await KitchenIngredient.create({
      name: trimmedName,
      canonicalName,
      categoryId
    });

    const populatedIngredient = await KitchenIngredient.findById(ingredient._id).populate(
      "categoryId",
      "name colorBg colorText"
    );

    return res.status(201).json({ ok: true, ingredient: populatedIngredient, created: true });
  } catch (error) {
    return res.status(500).json({ ok: false, error: "No se pudo crear el ingrediente." });
  }
});

export default router;
