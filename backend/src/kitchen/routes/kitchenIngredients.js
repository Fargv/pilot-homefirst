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
  const { q, includeInactive, limit } = req.query;
  const filters = {};
  const shouldIncludeInactive = String(includeInactive || "").toLowerCase() === "true";
  if (!shouldIncludeInactive) {
    filters.active = true;
  }
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

  const limitValue = Number.parseInt(limit, 10);
  let queryBuilder = KitchenIngredient.find(filters)
    .populate("categoryId", "name colorBg colorText")
    .sort({ name: 1 });
  if (!Number.isNaN(limitValue) && limitValue > 0) {
    queryBuilder = queryBuilder.limit(limitValue);
  } else if (!limit) {
    queryBuilder = queryBuilder.limit(MAX_RESULTS);
  }

  const ingredients = await queryBuilder;

  return res.json({ ok: true, ingredients });
});

router.post("/", requireAuth, async (req, res) => {
  try {
    const { name, categoryId, canonicalName: canonicalInput } = req.body;
    if (process.env.NODE_ENV === "development") {
      console.log("🧪 [kitchenIngredients] create", { name, categoryId });
    }
    if (!name) return res.status(400).json({ ok: false, error: "El nombre del ingrediente es obligatorio." });
    if (!categoryId)
      return res.status(400).json({ ok: false, error: "Selecciona una categoría para el ingrediente." });

    const trimmedName = String(name).trim();
    const canonicalName = normalizeIngredientName(canonicalInput || trimmedName);
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

router.put("/:id", requireAuth, async (req, res) => {
  try {
    const { id } = req.params;
    const { name, categoryId, active, canonicalName: canonicalInput } = req.body;
    if (!name) return res.status(400).json({ ok: false, error: "El nombre del ingrediente es obligatorio." });
    if (!categoryId)
      return res.status(400).json({ ok: false, error: "Selecciona una categoría para el ingrediente." });
    if (typeof active !== "boolean")
      return res.status(400).json({ ok: false, error: "Indica si el ingrediente está activo." });

    const trimmedName = String(name).trim();
    const canonicalName = normalizeIngredientName(canonicalInput || trimmedName);
    if (!canonicalName)
      return res.status(400).json({ ok: false, error: "El nombre del ingrediente no es válido." });

    const ingredient = await KitchenIngredient.findByIdAndUpdate(
      id,
      {
        name: trimmedName,
        canonicalName,
        categoryId,
        active
      },
      { new: true }
    ).populate("categoryId", "name colorBg colorText");

    if (!ingredient) {
      return res.status(404).json({ ok: false, error: "Ingrediente no encontrado." });
    }

    return res.json({ ok: true, ingredient });
  } catch (error) {
    return res.status(500).json({ ok: false, error: "No se pudo actualizar el ingrediente." });
  }
});

export default router;
