import mongoose from "mongoose";
import { resolveMongoUrl } from "./mongo-url.js";
import { Category } from "../src/kitchen/models/Category.js";
import { KitchenIngredient } from "../src/kitchen/models/KitchenIngredient.js";
import { CATALOG_SCOPES } from "../src/kitchen/utils/catalogScopes.js";
import {
  ensureDefaultCategory,
  normalizeCategoryKey,
  slugifyCategory
} from "../src/kitchen/utils/categoryMatching.js";

function categoryScopeKey(category) {
  return `${category.scope}:${category.householdId ? String(category.householdId) : "master"}`;
}

async function dedupeCategories() {
  const categories = await Category.find({ isArchived: { $ne: true } }).sort({ createdAt: 1, _id: 1 });
  const byScopeAndName = new Map();
  const duplicateMap = new Map();

  categories.forEach((category) => {
    const scopeKey = categoryScopeKey(category);
    const normalizedName = normalizeCategoryKey(category.name || category.slug || "");
    const normalizedSlug = normalizeCategoryKey(category.slug || category.name || "");
    const dedupeKey = `${scopeKey}:${normalizedSlug || normalizedName}`;

    if (!byScopeAndName.has(dedupeKey)) {
      byScopeAndName.set(dedupeKey, category);
      return;
    }

    duplicateMap.set(String(category._id), byScopeAndName.get(dedupeKey));
  });

  let updatedIngredients = 0;
  for (const [duplicateId, canonicalCategory] of duplicateMap.entries()) {
    const result = await KitchenIngredient.updateMany(
      { categoryId: duplicateId },
      { $set: { categoryId: canonicalCategory._id } }
    );
    updatedIngredients += result.modifiedCount;
  }

  return {
    duplicateCount: duplicateMap.size,
    remappedIngredientCount: updatedIngredients
  };
}

async function assignCategoryIds() {
  const categories = await Category.find({ isArchived: { $ne: true } });
  const byScope = new Map();

  categories.forEach((category) => {
    const scopeKey = categoryScopeKey(category);
    if (!byScope.has(scopeKey)) {
      byScope.set(scopeKey, new Map());
    }

    const map = byScope.get(scopeKey);
    const keys = [
      normalizeCategoryKey(category.name),
      normalizeCategoryKey(category.slug),
      slugifyCategory(category.name),
      slugifyCategory(category.slug)
    ].filter(Boolean);

    keys.forEach((key) => {
      if (!map.has(key)) map.set(key, category);
    });
  });

  const ingredients = await KitchenIngredient.find({
    $or: [{ categoryId: { $exists: false } }, { categoryId: null }, { category: { $type: "string" } }]
  }).lean();

  let migrated = 0;
  let fallbackToOtros = 0;

  for (const ingredient of ingredients) {
    const scopeKey = `${ingredient.scope || CATALOG_SCOPES.HOUSEHOLD}:${ingredient.householdId ? String(ingredient.householdId) : "master"}`;
    const categoryMap = byScope.get(scopeKey) || new Map();
    const legacyRaw = String(ingredient.category || "").trim();
    const legacyKeys = [
      normalizeCategoryKey(legacyRaw),
      slugifyCategory(legacyRaw)
    ].filter(Boolean);

    let category = null;
    for (const key of legacyKeys) {
      if (categoryMap.has(key)) {
        category = categoryMap.get(key);
        break;
      }
    }

    if (!category) {
      category = await ensureDefaultCategory({
        Category,
        householdId: ingredient.householdId,
        scope: ingredient.scope === CATALOG_SCOPES.MASTER ? CATALOG_SCOPES.MASTER : CATALOG_SCOPES.HOUSEHOLD
      });
      fallbackToOtros += 1;
    }

    await KitchenIngredient.updateOne(
      { _id: ingredient._id },
      {
        $set: { categoryId: category._id },
        $unset: { category: "" }
      }
    );
    migrated += 1;
  }

  return { migrated, fallbackToOtros };
}

async function run() {
  const mongoUrl = resolveMongoUrl();
  await mongoose.connect(mongoUrl);

  const dedupe = await dedupeCategories();
  const migration = await assignCategoryIds();

  console.log("✅ Migración categoryId completada");
  console.log(JSON.stringify({ dedupe, migration }, null, 2));

  await mongoose.disconnect();
}

run().catch(async (error) => {
  console.error("❌ Error en migrate-ingredient-category-id:", error.message);
  await mongoose.disconnect();
  process.exit(1);
});
