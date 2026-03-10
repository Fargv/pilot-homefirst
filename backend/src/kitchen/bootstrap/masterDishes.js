import { KitchenDish } from "../models/KitchenDish.js";
import { KitchenDishCategory } from "../models/KitchenDishCategory.js";
import { CATALOG_SCOPES } from "../utils/catalogScopes.js";
import { normalizeIngredientName } from "../utils/normalize.js";

const GUARNICIONES_FALLBACK_ID = "69ac7016c0755cd97c6a9b63";

const STARTER_MASTER_DISHES = [
  {
    name: "Pollo al horno",
    sidedish: false,
    isDinner: false,
    special: false,
    ingredients: ["Pollo", "Patata", "Cebolla"]
  },
  {
    name: "Pasta boloñesa",
    sidedish: false,
    isDinner: false,
    special: false,
    ingredients: ["Pasta", "Carne picada", "Tomate"]
  },
  {
    name: "Arroz con verduras",
    sidedish: false,
    isDinner: false,
    special: false,
    ingredients: ["Arroz", "Pimiento", "Calabacín"]
  },
  {
    name: "Ensalada mixta",
    sidedish: true,
    isDinner: false,
    special: false,
    ingredients: ["Lechuga", "Tomate", "Cebolla"]
  },
  {
    name: "Verduras salteadas",
    sidedish: true,
    isDinner: false,
    special: false,
    ingredients: ["Brócoli", "Zanahoria", "Calabacín"]
  }
];

function escapeRegex(value) {
  return String(value || "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function normalizeSeedIngredients(ingredients = []) {
  return ingredients.map((name) => {
    const displayName = String(name || "").trim();
    return {
      displayName,
      canonicalName: normalizeIngredientName(displayName)
    };
  });
}

async function resolveGuarnicionesCategoryId() {
  const byCode = await KitchenDishCategory.findOne({ code: "guarniciones", active: { $ne: false } })
    .select("_id")
    .lean();
  if (byCode?._id) return byCode._id;

  const byFallbackId = await KitchenDishCategory.findOne({ _id: GUARNICIONES_FALLBACK_ID, active: { $ne: false } })
    .select("_id")
    .lean();
  return byFallbackId?._id || null;
}

export async function ensureStarterMasterDishes() {
  const guarnicionesCategoryId = await resolveGuarnicionesCategoryId();
  let createdCount = 0;

  for (const seed of STARTER_MASTER_DISHES) {
    const normalizedName = String(seed.name || "").trim();
    if (!normalizedName) continue;

    const existing = await KitchenDish.findOne({
      scope: CATALOG_SCOPES.MASTER,
      sidedish: Boolean(seed.sidedish),
      isDinner: Boolean(seed.isDinner),
      name: new RegExp(`^${escapeRegex(normalizedName)}$`, "i"),
      isArchived: { $ne: true }
    })
      .select("_id")
      .lean();

    if (existing?._id) continue;

    await KitchenDish.create({
      name: normalizedName,
      scope: CATALOG_SCOPES.MASTER,
      ingredients: normalizeSeedIngredients(seed.ingredients),
      sidedish: Boolean(seed.sidedish),
      isDinner: Boolean(seed.isDinner),
      special: Boolean(seed.special),
      active: true,
      isArchived: false,
      deletedAt: null,
      dishCategoryId: seed.sidedish ? guarnicionesCategoryId : null
    });

    createdCount += 1;
  }

  return {
    createdCount,
    totalConfigured: STARTER_MASTER_DISHES.length
  };
}
