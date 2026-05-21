import { KitchenDish } from "../models/KitchenDish.js";
import { CATALOG_SCOPES } from "../utils/catalogScopes.js";
import { normalizeIngredientName } from "../utils/normalize.js";

const STARTER_MASTER_DISHES = [
  {
    name: "Pollo al horno",
    isDinner: false,
    special: false,
    ingredients: ["Pollo", "Patata", "Cebolla"]
  },
  {
    name: "Pasta boloñesa",
    isDinner: false,
    special: false,
    ingredients: ["Pasta", "Carne picada", "Tomate"]
  },
  {
    name: "Arroz con verduras",
    isDinner: false,
    special: false,
    ingredients: ["Arroz", "Pimiento", "Calabacín"]
  },
  {
    name: "Ensalada mixta",
    isDinner: false,
    special: false,
    ingredients: ["Lechuga", "Tomate", "Cebolla"]
  },
  {
    name: "Verduras salteadas",
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

export async function ensureStarterMasterDishes() {
  let createdCount = 0;

  for (const seed of STARTER_MASTER_DISHES) {
    const normalizedName = String(seed.name || "").trim();
    if (!normalizedName) continue;

    const existing = await KitchenDish.findOne({
      scope: CATALOG_SCOPES.MASTER,
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
      isDinner: Boolean(seed.isDinner),
      special: Boolean(seed.special),
      allowRandom: true,
      active: true,
      isArchived: false,
      deletedAt: null,
      dishCategoryId: null
    });

    createdCount += 1;
  }

  return {
    createdCount,
    totalConfigured: STARTER_MASTER_DISHES.length
  };
}
