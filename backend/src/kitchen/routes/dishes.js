import express from "express";
import { KitchenDish } from "../models/KitchenDish.js";
import { normalizeIngredientList } from "../utils/normalize.js";
import { requireAuth, requireRole } from "../middleware.js";
import {
  buildScopedFilter,
  getEffectiveHouseholdId,
  handleHouseholdError
} from "../householdScope.js";

const router = express.Router();

router.get("/", requireAuth, async (req, res) => {
  try {
    const { sidedish } = req.query;
    const effectiveHouseholdId = getEffectiveHouseholdId(req.user);
    const filter = sidedish === "true" ? { sidedish: true } : {};
    const dishes = await KitchenDish.find(buildScopedFilter(effectiveHouseholdId, filter)).sort({
      createdAt: -1
    });

    res.json({ ok: true, dishes });
  } catch (error) {
    const handled = handleHouseholdError(res, error);
    if (handled) return handled;
    return res.status(500).json({ ok: false, error: "No se pudieron cargar los platos." });
  }
});

router.post("/", requireAuth, async (req, res) => {
  try {
    const { name, ingredients, sidedish } = req.body;
    if (!name) return res.status(400).json({ ok: false, error: "El nombre del plato es obligatorio." });

    const effectiveHouseholdId = getEffectiveHouseholdId(req.user);
    const normalizedIngredients = normalizeIngredientList(ingredients || []);
    const dish = await KitchenDish.create({
      name: String(name).trim(),
      ingredients: normalizedIngredients,
      sidedish: Boolean(sidedish),
      createdBy: req.kitchenUser._id,
      householdId: effectiveHouseholdId
    });

    return res.status(201).json({ ok: true, dish });
  } catch (error) {
    const handled = handleHouseholdError(res, error);
    if (handled) return handled;
    return res.status(500).json({ ok: false, error: "No se pudo guardar el plato." });
  }
});

router.put("/:id", requireAuth, async (req, res) => {
  try {
    const { name, ingredients, sidedish } = req.body;
    const effectiveHouseholdId = getEffectiveHouseholdId(req.user);
        const dish = await KitchenDish.findOne(buildScopedFilter(effectiveHouseholdId, { _id: req.params.id }));
    if (!dish) return res.status(404).json({ ok: false, error: "Plato no encontrado." });

    if (name) dish.name = String(name).trim();
    if (Array.isArray(ingredients)) dish.ingredients = normalizeIngredientList(ingredients);
    if (typeof sidedish === "boolean") dish.sidedish = sidedish;

    await dish.save();
    return res.json({ ok: true, dish });
  } catch (error) {
    const handled = handleHouseholdError(res, error);
    if (handled) return handled;
    return res.status(500).json({ ok: false, error: "No se pudo actualizar el plato." });
  }
});

router.delete("/:id", requireAuth, requireRole("admin"), async (req, res) => {
  try {
    const effectiveHouseholdId = getEffectiveHouseholdId(req.user);
        const dish = await KitchenDish.findOne(buildScopedFilter(effectiveHouseholdId, { _id: req.params.id }));
    if (!dish) return res.status(404).json({ ok: false, error: "Plato no encontrado." });

    await dish.deleteOne();
    return res.json({ ok: true });
  } catch (error) {
    const handled = handleHouseholdError(res, error);
    if (handled) return handled;
    return res.status(500).json({ ok: false, error: "No se pudo eliminar el plato." });
  }
});

export default router;
