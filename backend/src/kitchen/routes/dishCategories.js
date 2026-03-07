import express from "express";
import { requireAuth } from "../middleware.js";
import { KitchenDishCategory } from "../models/KitchenDishCategory.js";

const router = express.Router();

router.get("/", requireAuth, async (_req, res) => {
  try {
    const categories = await KitchenDishCategory.find({ active: { $ne: false } })
      .select("_id name slug")
      .sort({ name: 1 })
      .lean();
    return res.json({ ok: true, categories });
  } catch (_error) {
    return res.status(500).json({ ok: false, error: "No se pudieron cargar las categorías de plato." });
  }
});

export default router;
