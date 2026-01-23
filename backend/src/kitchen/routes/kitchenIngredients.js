import express from "express";
import { KitchenIngredient } from "../models/KitchenIngredient.js";
import { requireAuth } from "../middleware.js";
import { normalizeIngredientName } from "../utils/normalize.js";

const router = express.Router();
const MAX_RESULTS = 15;
const escapeRegex = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

router.get("/", requireAuth, async (req, res) => {
  const { q } = req.query;
  const filters = { active: true };

  if (q) {
    const trimmed = String(q).trim();
    const normalized = normalizeIngredientName(trimmed);
    const normalizedRegex = normalized ? new RegExp(escapeRegex(normalized), "i") : null;
    const nameRegex = trimmed ? new RegExp(escapeRegex(trimmed), "i") : null;
    const orFilters = [];
    if (normalizedRegex) orFilters.push({ canonicalName: normalizedRegex });
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
