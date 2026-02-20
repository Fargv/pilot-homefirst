import express from "express";
import { Category } from "../models/Category.js";
import { requireAuth } from "../middleware.js";
import { getEffectiveHouseholdId, getOptionalHouseholdId, handleHouseholdError } from "../householdScope.js";
import {
  CATALOG_SCOPES,
  clearHiddenMasterForHousehold,
  hideMasterForHousehold,
  isDiodUser,
  resolveCatalogForHousehold
} from "../utils/catalogScopes.js";
import { slugifyCategory } from "../utils/categoryMatching.js";

const router = express.Router();

const DEFAULT_COLOR_BG = "#E8F1FF";
const DEFAULT_COLOR_TEXT = "#1D4ED8";

const escapeRegex = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

router.get("/", requireAuth, async (req, res) => {
  try {
    const effectiveHouseholdId = getOptionalHouseholdId(req.user);
    const categories = await resolveCatalogForHousehold({
      Model: Category,
      householdId: effectiveHouseholdId,
      type: "category",
      masterFilter: { active: true },
      householdFilter: { active: true },
      overrideFilter: { active: true },
      sort: { order: 1, name: 1 }
    });

    return res.json({ ok: true, categories });
  } catch (error) {
    const handled = handleHouseholdError(res, error);
    if (handled) return handled;
    return res.status(500).json({ ok: false, error: "No se pudieron cargar las categorías." });
  }
});

router.post("/", requireAuth, async (req, res) => {
  try {
    const { name, colorBg, colorText, scope } = req.body;
    if (!name) return res.status(400).json({ ok: false, error: "El nombre de la categoría es obligatorio." });

    const isDiod = isDiodUser(req.kitchenUser);
    const isMasterWrite = scope === CATALOG_SCOPES.MASTER;

    const effectiveHouseholdId = isMasterWrite ? getOptionalHouseholdId(req.user) : getEffectiveHouseholdId(req.user);

    if (isMasterWrite && !isDiod) {
      return res.status(403).json({ ok: false, error: "Solo DIOD puede crear categorías master." });
    }

    const trimmedName = String(name).trim();
    const slug = slugifyCategory(trimmedName);
    if (!slug) return res.status(400).json({ ok: false, error: "El nombre de la categoría no es válido." });

    const baseFilter = {
      $or: [{ slug: new RegExp(`^${escapeRegex(slug)}$`, "i") }, { name: new RegExp(`^${escapeRegex(trimmedName)}$`, "i") }],
      scope: isMasterWrite ? CATALOG_SCOPES.MASTER : CATALOG_SCOPES.HOUSEHOLD,
      isArchived: { $ne: true }
    };
    if (!isMasterWrite) baseFilter.householdId = effectiveHouseholdId;

    const existing = await Category.findOne(baseFilter);

    if (existing) return res.json({ ok: true, category: existing, created: false });

    const category = await Category.create({
      name: trimmedName,
      slug,
      colorBg: colorBg || DEFAULT_COLOR_BG,
      colorText: colorText || DEFAULT_COLOR_TEXT,
      scope: isMasterWrite ? CATALOG_SCOPES.MASTER : CATALOG_SCOPES.HOUSEHOLD,
      householdId: isMasterWrite ? undefined : effectiveHouseholdId
    });

    if (!isMasterWrite) {
      await clearHiddenMasterForHousehold({ householdId: effectiveHouseholdId, type: "category", masterId: category._id });
    }

    return res.status(201).json({ ok: true, category, created: true });
  } catch (error) {
    const handled = handleHouseholdError(res, error);
    if (handled) return handled;
    return res.status(500).json({ ok: false, error: "No se pudo crear la categoría." });
  }
});

router.put("/:id", requireAuth, async (req, res) => {
  try {
    const { id } = req.params;
    const { name, colorBg, colorText, active } = req.body;
    if (!name) return res.status(400).json({ ok: false, error: "El nombre de la categoría es obligatorio." });

    getOptionalHouseholdId(req.user);
    const isDiod = isDiodUser(req.kitchenUser);
    const trimmedName = String(name).trim();
    const slug = slugifyCategory(trimmedName);

    const target = await Category.findById(id);
    if (!target || target.isArchived) {
      return res.status(404).json({ ok: false, error: "Categoría no encontrada." });
    }

    const nextData = {
      name: trimmedName,
      slug,
      colorBg: colorBg || DEFAULT_COLOR_BG,
      colorText: colorText || DEFAULT_COLOR_TEXT,
      active: typeof active === "boolean" ? active : target.active
    };

    if (target.scope === CATALOG_SCOPES.MASTER) {
      if (isDiod) {
        Object.assign(target, nextData);
        await target.save();
        return res.json({ ok: true, category: target });
      }

      const category = await Category.findOneAndUpdate(
        {
          householdId: getEffectiveHouseholdId(req.user),
          scope: CATALOG_SCOPES.OVERRIDE,
          masterId: target._id
        },
        {
          ...nextData,
          householdId: getEffectiveHouseholdId(req.user),
          masterId: target._id,
          scope: CATALOG_SCOPES.OVERRIDE,
          isArchived: false
        },
        { upsert: true, new: true, setDefaultsOnInsert: true }
      );

      await clearHiddenMasterForHousehold({ householdId: getEffectiveHouseholdId(req.user), type: "category", masterId: target._id });
      return res.json({ ok: true, category, overridden: true });
    }

    if (!target.householdId || String(target.householdId) !== String(getEffectiveHouseholdId(req.user))) {
      return res.status(403).json({ ok: false, error: "No tienes permisos para modificar esta categoría." });
    }

    Object.assign(target, nextData);
    await target.save();

    return res.json({ ok: true, category: target });
  } catch (error) {
    const handled = handleHouseholdError(res, error);
    if (handled) return handled;
    return res.status(500).json({ ok: false, error: "No se pudo actualizar la categoría." });
  }
});

router.delete("/:id", requireAuth, async (req, res) => {
  try {
    const { id } = req.params;
    getOptionalHouseholdId(req.user);
    const isDiod = isDiodUser(req.kitchenUser);
    const target = await Category.findById(id);

    if (!target || target.isArchived) {
      return res.status(404).json({ ok: false, error: "Categoría no encontrada." });
    }

    if (target.scope === CATALOG_SCOPES.MASTER) {
      if (isDiod) {
        target.isArchived = true;
        await target.save();
      } else {
        await hideMasterForHousehold({ householdId: getEffectiveHouseholdId(req.user), type: "category", masterId: target._id });
      }
      return res.json({ ok: true });
    }

    if (!target.householdId || String(target.householdId) !== String(getEffectiveHouseholdId(req.user))) {
      return res.status(403).json({ ok: false, error: "No tienes permisos para eliminar esta categoría." });
    }

    target.isArchived = true;
    await target.save();
    return res.json({ ok: true });
  } catch (error) {
    const handled = handleHouseholdError(res, error);
    if (handled) return handled;
    return res.status(500).json({ ok: false, error: "No se pudo eliminar la categoría." });
  }
});

export default router;
