import express from "express";
import { KitchenDish } from "../models/KitchenDish.js";
import { normalizeIngredientList } from "../utils/normalize.js";
import { requireAuth, requireRole } from "../middleware.js";

const router = express.Router();

router.get("/", requireAuth, async (req, res) => {
  const dishes = await KitchenDish.find().sort({ createdAt: -1 });
  res.json({ ok: true, dishes });
});

router.post("/", requireAuth, async (req, res) => {
  try {
    const { name, ingredients } = req.body;
    if (!name) return res.status(400).json({ ok: false, error: "El nombre del plato es obligatorio." });

    const normalizedIngredients = normalizeIngredientList(ingredients || []);
    const dish = await KitchenDish.create({
      name: String(name).trim(),
      ingredients: normalizedIngredients,
      createdBy: req.kitchenUser._id
    });

    return res.status(201).json({ ok: true, dish });
  } catch (error) {
    return res.status(500).json({ ok: false, error: "No se pudo guardar el plato." });
  }
});

router.put("/:id", requireAuth, async (req, res) => {
  try {
    const { name, ingredients } = req.body;
    const dish = await KitchenDish.findById(req.params.id);
    if (!dish) return res.status(404).json({ ok: false, error: "Plato no encontrado." });

    if (name) dish.name = String(name).trim();
    if (Array.isArray(ingredients)) dish.ingredients = normalizeIngredientList(ingredients);

    await dish.save();
    return res.json({ ok: true, dish });
  } catch (error) {
    return res.status(500).json({ ok: false, error: "No se pudo actualizar el plato." });
  }
});

router.delete("/:id", requireAuth, requireRole("admin"), async (req, res) => {
  const dish = await KitchenDish.findById(req.params.id);
  if (!dish) return res.status(404).json({ ok: false, error: "Plato no encontrado." });

  await dish.deleteOne();
  return res.json({ ok: true });
});

export default router;
