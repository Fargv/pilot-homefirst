import express from "express";
import { requireAuth } from "../middleware.js";
import { KitchenDishCategory } from "../models/KitchenDishCategory.js";

const router = express.Router();

const DEFAULT_COLOR_BG = "#E8F1FF";
const DEFAULT_COLOR_TEXT = "#1D4ED8";

function normalizeCategoryCode(value = "") {
  return String(value || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

function canManageDishCategories(user) {
  if (!user) return false;
  if (user.globalRole === "diod") return true;
  return user.role === "owner" || user.role === "admin";
}

router.get("/", requireAuth, async (req, res) => {
  try {
    const includeInactive = String(req.query?.includeInactive || "").toLowerCase() === "true";
    const filter = includeInactive ? {} : { active: { $ne: false } };
    const categories = await KitchenDishCategory.find(filter)
      .select("_id name slug code colorBg colorText active")
      .sort({ name: 1 })
      .lean();
    return res.json({ ok: true, categories });
  } catch (_error) {
    return res.status(500).json({ ok: false, error: "No se pudieron cargar las categorías de plato." });
  }
});

router.post("/", requireAuth, async (req, res) => {
  try {
    if (!canManageDishCategories(req.kitchenUser)) {
      return res.status(403).json({ ok: false, error: "No tienes permisos para gestionar categorías de plato." });
    }
    const name = String(req.body?.name || "").trim();
    if (!name) {
      return res.status(400).json({ ok: false, error: "El nombre de la categoría es obligatorio." });
    }
    const code = normalizeCategoryCode(req.body?.code || name);
    if (!code) {
      return res.status(400).json({ ok: false, error: "El código de categoría no es válido." });
    }
    const existing = await KitchenDishCategory.findOne({ code }).lean();
    if (existing) {
      return res.status(409).json({ ok: false, error: "Ya existe una categoría de plato con ese código." });
    }

    const category = await KitchenDishCategory.create({
      name,
      code,
      slug: normalizeCategoryCode(name).replace(/_/g, "-"),
      colorBg: String(req.body?.colorBg || DEFAULT_COLOR_BG),
      colorText: String(req.body?.colorText || DEFAULT_COLOR_TEXT),
      active: typeof req.body?.active === "boolean" ? req.body.active : true
    });
    return res.status(201).json({ ok: true, category });
  } catch (_error) {
    return res.status(500).json({ ok: false, error: "No se pudo crear la categoría de plato." });
  }
});

router.put("/:id", requireAuth, async (req, res) => {
  try {
    if (!canManageDishCategories(req.kitchenUser)) {
      return res.status(403).json({ ok: false, error: "No tienes permisos para gestionar categorías de plato." });
    }
    const category = await KitchenDishCategory.findById(req.params.id);
    if (!category) {
      return res.status(404).json({ ok: false, error: "Categoría de plato no encontrada." });
    }
    const name = String(req.body?.name ?? category.name).trim();
    if (!name) {
      return res.status(400).json({ ok: false, error: "El nombre de la categoría es obligatorio." });
    }
    const code = normalizeCategoryCode(req.body?.code || category.code || name);
    if (!code) {
      return res.status(400).json({ ok: false, error: "El código de categoría no es válido." });
    }
    const duplicate = await KitchenDishCategory.findOne({ _id: { $ne: category._id }, code }).lean();
    if (duplicate) {
      return res.status(409).json({ ok: false, error: "Ya existe una categoría de plato con ese código." });
    }

    category.name = name;
    category.code = code;
    category.slug = normalizeCategoryCode(name).replace(/_/g, "-");
    category.colorBg = String(req.body?.colorBg || category.colorBg || DEFAULT_COLOR_BG);
    category.colorText = String(req.body?.colorText || category.colorText || DEFAULT_COLOR_TEXT);
    if (typeof req.body?.active === "boolean") {
      category.active = req.body.active;
    }
    await category.save();
    return res.json({ ok: true, category });
  } catch (_error) {
    return res.status(500).json({ ok: false, error: "No se pudo actualizar la categoría de plato." });
  }
});

router.delete("/:id", requireAuth, async (req, res) => {
  try {
    if (!canManageDishCategories(req.kitchenUser)) {
      return res.status(403).json({ ok: false, error: "No tienes permisos para gestionar categorías de plato." });
    }
    const category = await KitchenDishCategory.findById(req.params.id);
    if (!category) {
      return res.status(404).json({ ok: false, error: "Categoría de plato no encontrada." });
    }
    category.active = false;
    await category.save();
    return res.json({ ok: true, category });
  } catch (_error) {
    return res.status(500).json({ ok: false, error: "No se pudo eliminar la categoría de plato." });
  }
});

export default router;
