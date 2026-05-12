import express from "express";
import mongoose from "mongoose";
import { requireAuth, requireDiod } from "../middleware.js";
import { getEffectiveHouseholdId, handleHouseholdError } from "../householdScope.js";
import { Household } from "../models/Household.js";
import { KitchenDish } from "../models/KitchenDish.js";
import { KitchenIngredient } from "../models/KitchenIngredient.js";
import { Category } from "../models/Category.js";
import { KitchenDishCategory } from "../models/KitchenDishCategory.js";
import { CatalogPack } from "../models/CatalogPack.js";
import { HouseholdCatalogPack } from "../models/HouseholdCatalogPack.js";
import { normalizeSubscriptionPlan } from "../subscriptionService.js";
import { normalizeIngredientName } from "../utils/normalize.js";
import {
  applyCatalogPackValidation,
  assertIngredientCanBeCreated
} from "../catalogNormalization.js";
import {
  getCatalogMonthlyCredits,
  getCurrentClaimMonth,
  getMonthlyCreditsRemaining,
  resolvePackEntitlement,
  isPackCurrentlyFree
} from "../catalogService.js";

const router = express.Router();

function serializeAdminPack(p, ownedByCount = 0) {
  return {
    id: p._id,
    slug: p.slug,
    title: p.title,
    subtitle: p.subtitle,
    description: p.description,
    coverImage: p.coverImage,
    tags: p.tags,
    cuisineType: p.cuisineType,
    status: p.status || null,
    hasStatus: Boolean(p.status),
    active: p.active,
    featured: p.featured,
    priceBasic: p.priceBasic,
    includedPlans: p.includedPlans,
    monthlyCreditCost: p.monthlyCreditCost,
    dishCount: Array.isArray(p.dishes) ? p.dishes.length : 0,
    dishes: p.dishes || [],
    sortOrder: p.sortOrder,
    releaseDate: p.releaseDate,
    freeUntil: p.freeUntil,
    activeFrom: p.activeFrom,
    activeUntil: p.activeUntil,
    color: p.color,
    defaultSpecial: p.defaultSpecial,
    defaultAllowRandom: p.defaultAllowRandom,
    validationSummary: p.validationSummary || null,
    reviewIssues: p.reviewIssues || [],
    normalizedAt: p.normalizedAt || null,
    reviewedAt: p.reviewedAt || null,
    publishedAt: p.publishedAt || null,
    ownedByCount,
    createdAt: p.createdAt
  };
}

// ─── Master ingredient helpers for pack editor ───────────────────────────────

router.get("/master/ingredient-categories", requireAuth, requireDiod, async (req, res) => {
  try {
    const categories = await Category.find({ scope: "master", active: { $ne: false } })
      .select("_id name slug")
      .sort({ name: 1 })
      .lean();
    return res.json({ ok: true, categories: categories.map((c) => ({ id: c._id, name: c.name, slug: c.slug })) });
  } catch (error) {
    return res.status(500).json({ ok: false, error: error.message || "Error." });
  }
});

router.get("/master/ingredients", requireAuth, requireDiod, async (req, res) => {
  try {
    const q = String(req.query.q || "").trim();
    if (!q) return res.json({ ok: true, ingredients: [] });
    const escaped = q.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const regex = new RegExp(escaped, "i");
    const ingredients = await KitchenIngredient.find({
      scope: "master",
      active: { $ne: false },
      $or: [{ name: regex }, { canonicalName: regex }]
    }).select("_id name canonicalName categoryId").sort({ name: 1 }).limit(15).lean();
    return res.json({ ok: true, ingredients: ingredients.map((i) => ({ id: i._id, name: i.name, canonicalName: i.canonicalName, categoryId: i.categoryId })) });
  } catch (error) {
    return res.status(500).json({ ok: false, error: error.message || "Error al buscar ingredientes." });
  }
});

router.get("/master/dish-categories", requireAuth, requireDiod, async (req, res) => {
  try {
    const cats = await KitchenDishCategory.find({ active: { $ne: false } })
      .select("_id code name")
      .sort({ sortOrder: 1 })
      .lean();
    return res.json({ ok: true, categories: cats.map((c) => ({ id: c._id, code: c.code, name: c.name })) });
  } catch (error) {
    return res.status(500).json({ ok: false, error: error.message || "Error." });
  }
});

router.post("/master/ingredients", requireAuth, requireDiod, async (req, res) => {
  try {
    const name = String(req.body?.name || "").trim();
    const categoryId = req.body?.categoryId;
    if (!name) return res.status(400).json({ ok: false, error: "El nombre es obligatorio." });
    if (!categoryId || !mongoose.isValidObjectId(categoryId)) {
      return res.status(400).json({ ok: false, error: "categoryId válido es obligatorio." });
    }
    const { canonicalName } = await assertIngredientCanBeCreated({ name, categoryId });
    const ing = await KitchenIngredient.create({ scope: "master", name, canonicalName, categoryId, active: true });
    return res.status(201).json({ ok: true, created: true, ingredient: { id: ing._id, name: ing.name, canonicalName: ing.canonicalName, categoryId: ing.categoryId } });
  } catch (error) {
    if (error.statusCode === 409 && error.existing) {
      return res.status(409).json({
        ok: false,
        code: "DUPLICATE_MASTER_INGREDIENT",
        error: "Ya existe un ingrediente master con ese nombre normalizado.",
        ingredient: {
          id: error.existing._id,
          name: error.existing.name,
          canonicalName: error.existing.canonicalName,
          categoryId: error.existing.categoryId
        }
      });
    }
    return res.status(error.statusCode || 500).json({ ok: false, error: error.message || "Error al crear ingrediente." });
  }
});

// ─── Admin pack management ────────────────────────────────────────────────────

router.get("/packs/admin-all", requireAuth, requireDiod, async (req, res) => {
  try {
    const packs = await CatalogPack.find({}).sort({ sortOrder: 1, createdAt: -1 }).lean();
    const counts = await Promise.all(
      packs.map((p) => HouseholdCatalogPack.countDocuments({ packId: p._id }))
    );
    return res.json({
      ok: true,
      packs: packs.map((p, i) => serializeAdminPack(p, counts[i]))
    });
  } catch (error) {
    return res.status(500).json({ ok: false, error: error.message || "Error." });
  }
});

router.delete("/packs/:packId", requireAuth, requireDiod, async (req, res) => {
  try {
    if (!mongoose.isValidObjectId(req.params.packId)) {
      return res.status(404).json({ ok: false, error: "Pack no encontrado." });
    }
    const pack = await CatalogPack.findByIdAndDelete(req.params.packId);
    if (!pack) return res.status(404).json({ ok: false, error: "Pack no encontrado." });
    return res.json({ ok: true });
  } catch (error) {
    return res.status(500).json({ ok: false, error: error.message || "Error al eliminar." });
  }
});

router.get("/packs", requireAuth, async (req, res) => {
  try {
    const householdId = getEffectiveHouseholdId(req.user);
    const household = await Household.findById(householdId).select("subscriptionPlan").lean();
    const subscriptionPlan = normalizeSubscriptionPlan(household?.subscriptionPlan);

    const now = new Date();
    const filter = {
      active: true,
      status: "published",
      $and: [
        { $or: [{ activeFrom: null }, { activeFrom: { $exists: false } }, { activeFrom: { $lte: now } }] },
        { $or: [{ activeUntil: null }, { activeUntil: { $exists: false } }, { activeUntil: { $gte: now } }] }
      ]
    };
    const packs = await CatalogPack.find(filter)
      .sort({ sortOrder: 1, createdAt: -1 })
      .lean();

    const claimMonth = getCurrentClaimMonth();
    const creditsTotal = getCatalogMonthlyCredits(subscriptionPlan);
    const creditsRemaining = await getMonthlyCreditsRemaining(HouseholdCatalogPack, householdId, subscriptionPlan);

    const ownedPacks = await HouseholdCatalogPack.find({ householdId }).lean();
    const ownedMap = Object.fromEntries(ownedPacks.map((o) => [String(o.packId), o]));

    const packsWithEntitlement = packs.map((pack) => {
      const ownership = ownedMap[String(pack._id)] || null;
      const owned = Boolean(ownership);
      const installed = ownership?.status === "installed";
      const isFree = isPackCurrentlyFree(pack);
      const includedInPlan = Array.isArray(pack.includedPlans) && pack.includedPlans.includes(subscriptionPlan);
      const canClaimWithPlan = includedInPlan && creditsRemaining > 0 && !owned;
      const requiresPurchase = !isFree && !owned && !canClaimWithPlan;

      return {
        id: pack._id,
        slug: pack.slug,
        title: pack.title,
        subtitle: pack.subtitle,
        description: pack.description,
        coverImage: pack.coverImage,
        tags: pack.tags,
        cuisineType: pack.cuisineType,
        featured: pack.featured,
        priceBasic: pack.priceBasic,
        includedPlans: pack.includedPlans,
        dishCount: Array.isArray(pack.dishes) ? pack.dishes.length : 0,
        dishPreview: (() => { const all = pack.dishes || []; return all.slice(0, Math.floor(all.length / 2)).map((d) => ({ name: d.name, teaser: d.teaser || null })); })(),
        color: pack.color,
        releaseDate: pack.releaseDate,
        freeUntil: pack.freeUntil,
        entitlement: {
          owned,
          installed,
          isFree,
          isFreeUntil: pack.freeUntil && new Date(pack.freeUntil) > new Date() ? pack.freeUntil : null,
          includedInPlan,
          canClaimWithPlan,
          requiresPurchase,
          priceBasic: pack.priceBasic
        }
      };
    });

    return res.json({
      ok: true,
      packs: packsWithEntitlement,
      plan: subscriptionPlan,
      credits: {
        total: creditsTotal,
        remaining: creditsRemaining,
        claimMonth
      }
    });
  } catch (error) {
    if (handleHouseholdError(res, error)) return;
    return res.status(500).json({ ok: false, error: error.message || "Error al cargar el catálogo." });
  }
});

router.get("/packs/:packId", requireAuth, async (req, res) => {
  try {
    const householdId = getEffectiveHouseholdId(req.user);
    const household = await Household.findById(householdId).select("subscriptionPlan").lean();
    const subscriptionPlan = normalizeSubscriptionPlan(household?.subscriptionPlan);

    if (!mongoose.isValidObjectId(req.params.packId)) {
      return res.status(404).json({ ok: false, error: "Pack no encontrado." });
    }

    const pack = await CatalogPack.findOne({ _id: req.params.packId, active: true, status: "published" }).lean();
    if (!pack) return res.status(404).json({ ok: false, error: "Pack no encontrado." });

    const entitlement = await resolvePackEntitlement(HouseholdCatalogPack, {
      householdId,
      pack,
      subscriptionPlan
    });

    return res.json({
      ok: true,
      pack: {
        id: pack._id,
        slug: pack.slug,
        title: pack.title,
        subtitle: pack.subtitle,
        description: pack.description,
        coverImage: pack.coverImage,
        tags: pack.tags,
        cuisineType: pack.cuisineType,
        featured: pack.featured,
        priceBasic: pack.priceBasic,
        includedPlans: pack.includedPlans,
        dishCount: (pack.dishes || []).length,
        dishPreview: (() => { const all = pack.dishes || []; return all.slice(0, Math.floor(all.length / 2)).map((d) => ({ name: d.name, teaser: d.teaser || null })); })(),
        releaseDate: pack.releaseDate,
        color: pack.color,
        freeUntil: pack.freeUntil
      },
      entitlement
    });
  } catch (error) {
    if (handleHouseholdError(res, error)) return;
    return res.status(500).json({ ok: false, error: error.message || "Error al cargar el pack." });
  }
});

router.post("/packs/:packId/claim", requireAuth, async (req, res) => {
  try {
    const householdId = getEffectiveHouseholdId(req.user);
    const household = await Household.findById(householdId).select("subscriptionPlan").lean();
    const subscriptionPlan = normalizeSubscriptionPlan(household?.subscriptionPlan);

    if (!mongoose.isValidObjectId(req.params.packId)) {
      return res.status(404).json({ ok: false, error: "Pack no encontrado." });
    }

    const pack = await CatalogPack.findOne({ _id: req.params.packId, active: true, status: "published" }).lean();
    if (!pack) return res.status(404).json({ ok: false, error: "Pack no encontrado." });

    const existing = await HouseholdCatalogPack.findOne({ householdId, packId: pack._id }).lean();
    if (existing) {
      return res.json({ ok: true, alreadyOwned: true, message: "Este pack ya está en tu biblioteca." });
    }

    const includedInPlan = Array.isArray(pack.includedPlans) && pack.includedPlans.includes(subscriptionPlan);
    if (!includedInPlan) {
      return res.status(403).json({
        ok: false,
        code: "PLAN_NOT_INCLUDED",
        error: "Tu plan no incluye este pack. Considera actualizar tu suscripción."
      });
    }

    const creditsRemaining = await getMonthlyCreditsRemaining(HouseholdCatalogPack, householdId, subscriptionPlan);
    if (creditsRemaining <= 0) {
      return res.status(403).json({
        ok: false,
        code: "NO_CREDITS_REMAINING",
        error: "Has alcanzado el límite de packs mensuales para tu plan."
      });
    }

    const claimMonth = getCurrentClaimMonth();
    const ownership = await HouseholdCatalogPack.create({
      householdId,
      packId: pack._id,
      acquiredVia: "subscription",
      acquiredAt: new Date(),
      status: "owned",
      claimMonth,
      paymentStatus: "not_required"
    });

    return res.json({ ok: true, ownership: { id: ownership._id, status: ownership.status, claimMonth } });
  } catch (error) {
    if (handleHouseholdError(res, error)) return;
    return res.status(500).json({ ok: false, error: error.message || "Error al reclamar el pack." });
  }
});

router.post("/packs/:packId/install", requireAuth, async (req, res) => {
  try {
    const householdId = getEffectiveHouseholdId(req.user);
    const userId = req.user.id;
    const household = await Household.findById(householdId).select("subscriptionPlan").lean();
    const subscriptionPlan = normalizeSubscriptionPlan(household?.subscriptionPlan);

    if (!mongoose.isValidObjectId(req.params.packId)) {
      return res.status(404).json({ ok: false, error: "Pack no encontrado." });
    }

    const pack = await CatalogPack.findOne({ _id: req.params.packId, active: true, status: "published" }).lean();
    if (!pack) return res.status(404).json({ ok: false, error: "Pack no encontrado." });

    const existing = await HouseholdCatalogPack.findOne({ householdId, packId: pack._id }).lean();

    if (existing?.status === "installed") {
      return res.json({
        ok: true,
        alreadyInstalled: true,
        message: "Este pack ya está instalado en tu hogar."
      });
    }

    const isFree = isPackCurrentlyFree(pack);
    const includedInPlan = Array.isArray(pack.includedPlans) && pack.includedPlans.includes(subscriptionPlan);
    const creditsRemaining = await getMonthlyCreditsRemaining(HouseholdCatalogPack, householdId, subscriptionPlan);
    const canInstall = existing || isFree || (includedInPlan && creditsRemaining > 0);

    if (!canInstall) {
      if (includedInPlan && creditsRemaining <= 0) {
        return res.status(403).json({
          ok: false,
          code: "NO_CREDITS_REMAINING",
          error: "Has alcanzado el límite de packs mensuales para tu plan."
        });
      }
      return res.status(403).json({
        ok: false,
        code: "NOT_ENTITLED",
        error: "No tienes acceso a este pack. Cómpralo o actualiza tu suscripción."
      });
    }

    const now = new Date();
    const claimMonth = getCurrentClaimMonth();

    let ownership = existing
      ? await HouseholdCatalogPack.findOne({ householdId, packId: pack._id })
      : null;

    if (!ownership) {
      const acquiredVia = isFree ? "free" : "subscription";
      ownership = await HouseholdCatalogPack.create({
        householdId,
        packId: pack._id,
        acquiredVia,
        acquiredAt: now,
        status: "owned",
        claimMonth: acquiredVia === "subscription" ? claimMonth : null,
        paymentStatus: "not_required"
      });
    }

    const dishTemplates = Array.isArray(pack.dishes) ? pack.dishes : [];

    // Pre-fetch master ingredient IDs to link ingredients on install
    const allCanonicalNames = dishTemplates
      .flatMap((d) => d.ingredients || [])
      .map((i) => normalizeIngredientName(i.canonicalName || i.displayName))
      .filter(Boolean);
    const uniqueCanonicalNames = [...new Set(allCanonicalNames)];
    const masterIngs = uniqueCanonicalNames.length > 0
      ? await KitchenIngredient.find({ scope: "master", canonicalName: { $in: uniqueCanonicalNames }, active: { $ne: false } })
          .select("_id canonicalName").lean()
      : [];
    const ingIdMap = Object.fromEntries(masterIngs.map((i) => [i.canonicalName, i._id]));

    const createdDishes = [];

    for (const template of dishTemplates) {
      const dishDoc = {
        scope: "household",
        householdId,
        name: template.name,
        sidedish: Boolean(template.sidedish),
        isDinner: Boolean(template.isDinner),
        special: Boolean(template.special),
        allowRandom: template.allowRandom !== false,
        dishCategoryId: template.dishCategoryId || null,
        ingredients: (template.ingredients || []).map((ing) => {
          const cn = normalizeIngredientName(ing.canonicalName || ing.displayName);
          return {
            displayName: ing.displayName,
            canonicalName: ing.canonicalName,
            ingredientId: ing.ingredientId || ingIdMap[cn] || null
          };
        }),
        active: true,
        createdBy: userId,
        source: "catalog",
        sourcePackId: pack._id,
        sourcePackSlug: pack.slug,
        sourcePackTitle: pack.title,
        sourcePackColor: pack.color || null,
        importedAt: now,
        importedBy: userId,
        recipe: {
          ingredients: Array.isArray(template.recipe?.ingredients) ? template.recipe.ingredients : [],
          steps: template.recipe?.steps ?? null,
          servings: template.recipe?.servings || null
        }
      };

      const dish = await KitchenDish.create(dishDoc);
      createdDishes.push({ id: dish._id, name: dish.name });
    }

    ownership.status = "installed";
    ownership.installedAt = now;
    ownership.installedBy = userId;
    await ownership.save();

    return res.json({
      ok: true,
      installed: true,
      dishesCreated: createdDishes.length,
      dishes: createdDishes
    });
  } catch (error) {
    if (handleHouseholdError(res, error)) return;
    return res.status(500).json({ ok: false, error: error.message || "Error al instalar el pack." });
  }
});

router.post("/packs/:packId/admin-grant", requireAuth, requireDiod, async (req, res) => {
  try {
    const { targetHouseholdId } = req.body;
    if (!targetHouseholdId || !mongoose.isValidObjectId(targetHouseholdId)) {
      return res.status(400).json({ ok: false, error: "householdId de destino inválido." });
    }

    if (!mongoose.isValidObjectId(req.params.packId)) {
      return res.status(404).json({ ok: false, error: "Pack no encontrado." });
    }

    const pack = await CatalogPack.findOne({ _id: req.params.packId, status: "published", active: true }).lean();
    if (!pack) return res.status(404).json({ ok: false, error: "Pack no encontrado." });

    const existing = await HouseholdCatalogPack.findOne({
      householdId: targetHouseholdId,
      packId: pack._id
    }).lean();

    if (existing) {
      return res.json({ ok: true, alreadyOwned: true, message: "El hogar ya tiene acceso a este pack." });
    }

    const ownership = await HouseholdCatalogPack.create({
      householdId: targetHouseholdId,
      packId: pack._id,
      acquiredVia: "admin_grant",
      acquiredAt: new Date(),
      status: "owned",
      paymentStatus: "manual"
    });

    return res.json({ ok: true, ownership: { id: ownership._id, status: ownership.status } });
  } catch (error) {
    return res.status(500).json({ ok: false, error: error.message || "Error al conceder el pack." });
  }
});

router.post("/packs", requireAuth, requireDiod, async (req, res) => {
  try {
    const {
      slug, title, subtitle, description, coverImage, tags, cuisineType,
      active, featured, priceBasic, includedPlans, monthlyCreditCost, dishes,
      releaseDate, freeUntil, activeFrom, activeUntil, color, defaultSpecial, defaultAllowRandom, sortOrder
    } = req.body;

    if (!slug || !title) {
      return res.status(400).json({ ok: false, error: "slug y title son obligatorios." });
    }

    const pack = new CatalogPack({
      slug, title, subtitle, description, coverImage, tags, cuisineType,
      active: active !== false, featured: Boolean(featured),
      priceBasic, includedPlans, monthlyCreditCost, dishes: dishes || [],
      releaseDate: releaseDate ? new Date(releaseDate) : null,
      freeUntil: freeUntil ? new Date(freeUntil) : null,
      activeFrom: activeFrom ? new Date(activeFrom) : null,
      activeUntil: activeUntil ? new Date(activeUntil) : null,
      color: color || null,
      defaultSpecial: Boolean(defaultSpecial),
      defaultAllowRandom: defaultAllowRandom !== false,
      sortOrder: sortOrder ?? 0
    });
    await applyCatalogPackValidation(pack, { autoApply: true });
    await pack.save();

    return res.status(201).json({ ok: true, pack: { id: pack._id, slug: pack.slug, title: pack.title, status: pack.status, validationSummary: pack.validationSummary } });
  } catch (error) {
    if (error.code === 11000) {
      return res.status(409).json({ ok: false, error: "Ya existe un pack con ese slug." });
    }
    return res.status(500).json({ ok: false, error: error.message || "Error al crear el pack." });
  }
});

router.put("/packs/:packId", requireAuth, requireDiod, async (req, res) => {
  try {
    if (!mongoose.isValidObjectId(req.params.packId)) {
      return res.status(404).json({ ok: false, error: "Pack no encontrado." });
    }

    const allowedFields = [
      "title", "subtitle", "description", "coverImage", "tags", "cuisineType",
      "active", "featured", "priceBasic", "includedPlans", "monthlyCreditCost",
      "dishes", "releaseDate", "freeUntil", "activeFrom", "activeUntil",
      "color", "defaultSpecial", "defaultAllowRandom", "sortOrder"
    ];

    const packDoc = await CatalogPack.findById(req.params.packId);
    if (!packDoc) return res.status(404).json({ ok: false, error: "Pack no encontrado." });
    if (packDoc.status === "published" && Object.prototype.hasOwnProperty.call(req.body, "dishes")) {
      return res.status(409).json({ ok: false, error: "No se pueden modificar platos de un pack publicado automaticamente. Crea una nueva version del pack." });
    }

    for (const field of allowedFields) {
      if (Object.prototype.hasOwnProperty.call(req.body, field)) {
        packDoc[field] = req.body[field];
      }
    }

    if (packDoc.status !== "published") {
      await applyCatalogPackValidation(packDoc, { autoApply: true });
    }
    await packDoc.save();
    const pack = packDoc.toObject();

    return res.json({ ok: true, pack: { id: pack._id, slug: pack.slug, title: pack.title, active: pack.active, status: pack.status, validationSummary: pack.validationSummary } });
  } catch (error) {
    return res.status(500).json({ ok: false, error: error.message || "Error al actualizar el pack." });
  }
});

router.post("/packs/:packId/revalidate", requireAuth, requireDiod, async (req, res) => {
  try {
    if (!mongoose.isValidObjectId(req.params.packId)) {
      return res.status(404).json({ ok: false, error: "Pack no encontrado." });
    }
    const pack = await CatalogPack.findById(req.params.packId);
    if (!pack) return res.status(404).json({ ok: false, error: "Pack no encontrado." });
    await applyCatalogPackValidation(pack, { autoApply: pack.status !== "published" });
    await pack.save();
    return res.json({ ok: true, pack: serializeAdminPack(pack.toObject()) });
  } catch (error) {
    return res.status(500).json({ ok: false, error: error.message || "Error al validar el pack." });
  }
});

router.post("/packs/:packId/normalize/ingredient", requireAuth, requireDiod, async (req, res) => {
  try {
    if (!mongoose.isValidObjectId(req.params.packId)) {
      return res.status(404).json({ ok: false, error: "Pack no encontrado." });
    }
    const pack = await CatalogPack.findById(req.params.packId);
    if (!pack) return res.status(404).json({ ok: false, error: "Pack no encontrado." });
    if (pack.status === "published") {
      return res.status(409).json({ ok: false, error: "No se puede normalizar un pack publicado." });
    }

    const normalizedName = normalizeIngredientName(req.body?.normalizedName || req.body?.originalName || "");
    if (!normalizedName) return res.status(400).json({ ok: false, error: "normalizedName es obligatorio." });

    let ingredient;
    let duplicateMatched = false;
    if (req.body?.create) {
      try {
        const prepared = await assertIngredientCanBeCreated(req.body.create);
        ingredient = await KitchenIngredient.create({
          scope: "master",
          name: prepared.name,
          canonicalName: prepared.canonicalName,
          categoryId: prepared.category._id,
          active: true
        });
      } catch (error) {
        if (error.statusCode !== 409 || !error.existing) throw error;
        ingredient = await KitchenIngredient.findOne({ _id: error.existing._id, scope: "master" });
        duplicateMatched = true;
      }
    } else if (req.body?.ingredientId && mongoose.isValidObjectId(req.body.ingredientId)) {
      ingredient = await KitchenIngredient.findOne({
        _id: req.body.ingredientId,
        scope: "master",
        active: { $ne: false }
      });
      if (!ingredient) return res.status(400).json({ ok: false, error: "Ingrediente master no encontrado." });
      if (!ingredient.categoryId) return res.status(400).json({ ok: false, error: "El ingrediente master no tiene categoria." });
    } else {
      return res.status(400).json({ ok: false, error: "ingredientId o create es obligatorio." });
    }
    if (!ingredient?.categoryId) {
      return res.status(400).json({ ok: false, error: "El ingrediente master no tiene categoria." });
    }

    let updatedCount = 0;
    for (const dish of pack.dishes || []) {
      for (const item of dish.ingredients || []) {
        const itemName = normalizeIngredientName(item.canonicalName || item.displayName || "");
        if (itemName !== normalizedName) continue;
        item.ingredientId = ingredient._id;
        item.categoryId = ingredient.categoryId;
        item.canonicalName = normalizeIngredientName(ingredient.canonicalName || ingredient.name);
        item.displayName = item.displayName || ingredient.name;
        updatedCount += 1;
      }
    }

    await applyCatalogPackValidation(pack, { autoApply: true });
    pack.reviewedAt = new Date();
    await pack.save();

    return res.json({
      ok: true,
      updatedCount,
      duplicateMatched,
      ingredient: { id: ingredient._id, name: ingredient.name, canonicalName: ingredient.canonicalName, categoryId: ingredient.categoryId },
      pack: serializeAdminPack(pack.toObject())
    });
  } catch (error) {
    return res.status(error.statusCode || 500).json({ ok: false, error: error.message || "Error al normalizar ingrediente." });
  }
});

router.post("/packs/:packId/normalize/dish-category", requireAuth, requireDiod, async (req, res) => {
  try {
    if (!mongoose.isValidObjectId(req.params.packId)) {
      return res.status(404).json({ ok: false, error: "Pack no encontrado." });
    }
    const pack = await CatalogPack.findById(req.params.packId);
    if (!pack) return res.status(404).json({ ok: false, error: "Pack no encontrado." });
    if (pack.status === "published") {
      return res.status(409).json({ ok: false, error: "No se puede modificar un pack publicado." });
    }
    const dishIndex = Number(req.body?.dishIndex);
    const categoryId = req.body?.categoryId;
    if (!Number.isInteger(dishIndex) || dishIndex < 0 || dishIndex >= (pack.dishes || []).length) {
      return res.status(400).json({ ok: false, error: "dishIndex invalido." });
    }
    if (!categoryId || !mongoose.isValidObjectId(categoryId)) {
      return res.status(400).json({ ok: false, error: "categoryId valido es obligatorio." });
    }
    const category = await KitchenDishCategory.findOne({ _id: categoryId, active: { $ne: false } }).lean();
    if (!category) return res.status(400).json({ ok: false, error: "Categoria de plato no encontrada." });

    pack.dishes[dishIndex].dishCategoryId = category._id;
    await applyCatalogPackValidation(pack, { autoApply: true });
    pack.reviewedAt = new Date();
    await pack.save();
    return res.json({ ok: true, pack: serializeAdminPack(pack.toObject()) });
  } catch (error) {
    return res.status(500).json({ ok: false, error: error.message || "Error al asignar categoria." });
  }
});

router.post("/packs/:packId/publish", requireAuth, requireDiod, async (req, res) => {
  try {
    if (!mongoose.isValidObjectId(req.params.packId)) {
      return res.status(404).json({ ok: false, error: "Pack no encontrado." });
    }
    const pack = await CatalogPack.findById(req.params.packId);
    if (!pack) return res.status(404).json({ ok: false, error: "Pack no encontrado." });
    if (pack.status === "published") return res.json({ ok: true, pack: serializeAdminPack(pack.toObject()) });

    await applyCatalogPackValidation(pack, { autoApply: true });
    if (pack.validationSummary?.unresolvedIssues > 0) {
      await pack.save();
      return res.status(409).json({
        ok: false,
        error: "No se puede publicar con issues de normalizacion pendientes.",
        validationSummary: pack.validationSummary,
        reviewIssues: pack.reviewIssues
      });
    }

    pack.status = "published";
    pack.active = true;
    pack.publishedAt = new Date();
    pack.reviewedAt = pack.reviewedAt || new Date();
    await pack.save();
    return res.json({ ok: true, pack: serializeAdminPack(pack.toObject()) });
  } catch (error) {
    return res.status(500).json({ ok: false, error: error.message || "Error al publicar." });
  }
});

router.post("/packs/:packId/status", requireAuth, requireDiod, async (req, res) => {
  try {
    if (!mongoose.isValidObjectId(req.params.packId)) {
      return res.status(404).json({ ok: false, error: "Pack no encontrado." });
    }
    const nextStatus = String(req.body?.status || "").trim();
    if (!["draft", "needs_review", "ready", "published"].includes(nextStatus)) {
      return res.status(400).json({ ok: false, error: "Estado de pack no valido." });
    }

    const pack = await CatalogPack.findById(req.params.packId);
    if (!pack) return res.status(404).json({ ok: false, error: "Pack no encontrado." });

    if (nextStatus === "published") {
      await applyCatalogPackValidation(pack, { autoApply: true });
      if (pack.validationSummary?.unresolvedIssues > 0) {
        await pack.save();
        return res.status(409).json({
          ok: false,
          error: "No se puede publicar con issues de normalizacion pendientes.",
          validationSummary: pack.validationSummary,
          reviewIssues: pack.reviewIssues
        });
      }
      pack.active = true;
      pack.publishedAt = new Date();
      pack.reviewedAt = pack.reviewedAt || new Date();
    }

    if (nextStatus === "ready") {
      await applyCatalogPackValidation(pack, { autoApply: pack.status !== "published" });
      if (pack.validationSummary?.unresolvedIssues > 0) {
        await pack.save();
        return res.status(409).json({
          ok: false,
          error: "No se puede marcar como ready con issues pendientes.",
          validationSummary: pack.validationSummary,
          reviewIssues: pack.reviewIssues
        });
      }
    }

    pack.status = nextStatus;
    if (nextStatus === "needs_review") {
      pack.reviewedAt = null;
    }
    await pack.save();
    return res.json({ ok: true, pack: serializeAdminPack(pack.toObject()) });
  } catch (error) {
    return res.status(500).json({ ok: false, error: error.message || "Error al cambiar estado del pack." });
  }
});

export default router;
