import express from "express";
import mongoose from "mongoose";
import { requireAuth, requireDiod } from "../middleware.js";
import { getEffectiveHouseholdId, handleHouseholdError } from "../householdScope.js";
import { Household } from "../models/Household.js";
import { KitchenDish } from "../models/KitchenDish.js";
import { CatalogPack } from "../models/CatalogPack.js";
import { HouseholdCatalogPack } from "../models/HouseholdCatalogPack.js";
import { normalizeSubscriptionPlan } from "../subscriptionService.js";
import {
  getCatalogMonthlyCredits,
  getCurrentClaimMonth,
  getMonthlyCreditsRemaining,
  resolvePackEntitlement
} from "../catalogService.js";

const router = express.Router();

router.get("/packs", requireAuth, async (req, res) => {
  try {
    const householdId = getEffectiveHouseholdId(req.user);
    const household = await Household.findById(householdId).select("subscriptionPlan").lean();
    const subscriptionPlan = normalizeSubscriptionPlan(household?.subscriptionPlan);

    const filter = { active: true };
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
      const isFree = !pack.priceBasic || pack.priceBasic <= 0;
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
        releaseDate: pack.releaseDate,
        entitlement: {
          owned,
          installed,
          isFree,
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

    const pack = await CatalogPack.findOne({ _id: req.params.packId, active: true }).lean();
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
        dishes: pack.dishes,
        dishCount: pack.dishes?.length ?? 0,
        releaseDate: pack.releaseDate
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

    const pack = await CatalogPack.findOne({ _id: req.params.packId, active: true }).lean();
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

    const pack = await CatalogPack.findOne({ _id: req.params.packId, active: true }).lean();
    if (!pack) return res.status(404).json({ ok: false, error: "Pack no encontrado." });

    const existing = await HouseholdCatalogPack.findOne({ householdId, packId: pack._id }).lean();

    if (existing?.status === "installed") {
      return res.json({
        ok: true,
        alreadyInstalled: true,
        message: "Este pack ya está instalado en tu hogar."
      });
    }

    const isFree = !pack.priceBasic || pack.priceBasic <= 0;
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
        ingredients: Array.isArray(template.ingredients) ? template.ingredients : [],
        active: true,
        createdBy: userId,
        source: "catalog",
        sourcePackId: pack._id,
        sourcePackSlug: pack.slug,
        sourcePackTitle: pack.title,
        importedAt: now,
        importedBy: userId,
        recipe: {
          ingredients: Array.isArray(template.recipe?.ingredients) ? template.recipe.ingredients : [],
          steps: template.recipe?.steps || null,
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

    const pack = await CatalogPack.findById(req.params.packId).lean();
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
      active, featured, priceBasic, includedPlans, monthlyCreditCost, dishes, releaseDate, sortOrder
    } = req.body;

    if (!slug || !title) {
      return res.status(400).json({ ok: false, error: "slug y title son obligatorios." });
    }

    const pack = await CatalogPack.create({
      slug, title, subtitle, description, coverImage, tags, cuisineType,
      active: active !== false, featured: Boolean(featured),
      priceBasic, includedPlans, monthlyCreditCost, dishes: dishes || [],
      releaseDate: releaseDate ? new Date(releaseDate) : null,
      sortOrder: sortOrder ?? 0
    });

    return res.status(201).json({ ok: true, pack: { id: pack._id, slug: pack.slug, title: pack.title } });
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
      "dishes", "releaseDate", "sortOrder"
    ];

    const update = {};
    for (const field of allowedFields) {
      if (Object.prototype.hasOwnProperty.call(req.body, field)) {
        update[field] = req.body[field];
      }
    }

    const pack = await CatalogPack.findByIdAndUpdate(req.params.packId, update, { new: true }).lean();
    if (!pack) return res.status(404).json({ ok: false, error: "Pack no encontrado." });

    return res.json({ ok: true, pack: { id: pack._id, slug: pack.slug, title: pack.title, active: pack.active } });
  } catch (error) {
    return res.status(500).json({ ok: false, error: error.message || "Error al actualizar el pack." });
  }
});

export default router;
