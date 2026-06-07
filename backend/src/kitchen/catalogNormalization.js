import mongoose from "mongoose";
import { KitchenIngredient } from "./models/KitchenIngredient.js";
import { Category } from "./models/Category.js";
import { KitchenDishCategory } from "./models/KitchenDishCategory.js";
import { normalizeIngredientName } from "./utils/normalize.js";

const EMPTY_SUMMARY = {
  missingIngredientMappings: 0,
  missingIngredientCategories: 0,
  missingDishCategories: 0,
  ambiguousMatches: 0,
  invalidMappings: 0,
  duplicateIngredientNames: 0,
  unresolvedIssues: 0,
  normalizedIngredients: 0,
  totalIngredients: 0,
  totalDishes: 0
};

function asId(value) {
  if (!value) return null;
  const raw = value?._id || value;
  return mongoose.isValidObjectId(raw) ? String(raw) : null;
}

function suggestionFromIngredient(ingredient) {
  return {
    id: String(ingredient._id),
    name: ingredient.name,
    canonicalName: ingredient.canonicalName,
    categoryId: ingredient.categoryId ? String(ingredient.categoryId) : null
  };
}

async function loadNormalizationContext() {
  const [ingredients, categories, dishCategories] = await Promise.all([
    KitchenIngredient.find({ scope: "master", active: { $ne: false } })
      .select("_id name canonicalName categoryId")
      .lean(),
    Category.find({ scope: "master", active: { $ne: false } })
      .select("_id")
      .lean(),
    KitchenDishCategory.find({ active: { $ne: false } })
      .select("_id")
      .lean()
  ]);

  const ingredientsById = new Map(ingredients.map((ingredient) => [String(ingredient._id), ingredient]));
  const categoriesById = new Set(categories.map((category) => String(category._id)));
  const dishCategoriesById = new Set(dishCategories.map((category) => String(category._id)));
  const ingredientsByNormalizedName = new Map();

  for (const ingredient of ingredients) {
    const key = normalizeIngredientName(ingredient.canonicalName || ingredient.name);
    if (!key) continue;
    const list = ingredientsByNormalizedName.get(key) || [];
    list.push(ingredient);
    ingredientsByNormalizedName.set(key, list);
  }

  return { ingredientsById, categoriesById, dishCategoriesById, ingredientsByNormalizedName };
}

export async function validateCatalogPackData(packLike, { autoApply = false } = {}) {
  const context = await loadNormalizationContext();
  const summary = { ...EMPTY_SUMMARY };
  const issues = [];
  const duplicateNames = new Map();
  let changed = false;

  const dishes = (Array.isArray(packLike?.dishes) ? packLike.dishes : []).map((rawDish, dishIndex) => {
    const dish = typeof rawDish?.toObject === "function" ? rawDish.toObject() : { ...rawDish };
    const dishName = String(dish.name || `Plato ${dishIndex + 1}`);
    summary.totalDishes += 1;

    const dishCategoryId = asId(dish.dishCategoryId);
    if (!dishCategoryId || !context.dishCategoriesById.has(dishCategoryId)) {
      summary.missingDishCategories += 1;
      issues.push({
        type: "missing_dish_category",
        key: `dish:${dishIndex}`,
        dishIndex,
        dishName,
        message: "El plato no tiene una categoria de plato valida."
      });
    }

    const ingredients = (Array.isArray(dish.ingredients) ? dish.ingredients : []).map((rawIngredient, ingredientIndex) => {
      const ingredient = typeof rawIngredient?.toObject === "function" ? rawIngredient.toObject() : { ...rawIngredient };
      const originalName = String(ingredient.displayName || ingredient.canonicalName || "").trim();
      const normalizedName = normalizeIngredientName(ingredient.canonicalName || ingredient.displayName || "");
      const existing = asId(ingredient.ingredientId)
        ? context.ingredientsById.get(asId(ingredient.ingredientId))
        : null;
      const matches = normalizedName ? context.ingredientsByNormalizedName.get(normalizedName) || [] : [];
      const issueBase = {
        key: `ingredient:${normalizedName || dishIndex + ":" + ingredientIndex}`,
        dishIndex,
        ingredientIndex,
        dishName,
        originalName,
        normalizedName
      };

      summary.totalIngredients += 1;
      if (normalizedName) {
        const entry = duplicateNames.get(normalizedName) || { normalizedName, names: new Set(), occurrences: 0 };
        entry.names.add(originalName || normalizedName);
        entry.occurrences += 1;
        duplicateNames.set(normalizedName, entry);
      }

      if (existing) {
        const categoryId = asId(existing.categoryId);
        if (autoApply) {
          if (String(ingredient.ingredientId || "") !== String(existing._id)) {
            ingredient.ingredientId = existing._id;
            changed = true;
          }
          if (categoryId && String(ingredient.categoryId || "") !== categoryId) {
            ingredient.categoryId = existing.categoryId;
            changed = true;
          }
          const canonicalName = normalizeIngredientName(existing.canonicalName || existing.name);
          if (canonicalName && ingredient.canonicalName !== canonicalName) {
            ingredient.canonicalName = canonicalName;
            changed = true;
          }
        }
        if (!categoryId || !context.categoriesById.has(categoryId)) {
          summary.missingIngredientCategories += 1;
          issues.push({
            ...issueBase,
            type: "missing_ingredient_category",
            ingredientId: String(existing._id),
            message: "El ingrediente master no tiene una categoria valida."
          });
        } else {
          summary.normalizedIngredients += 1;
        }
        return ingredient;
      }

      const ingredientId = asId(ingredient.ingredientId);
      if (ingredientId) {
        summary.invalidMappings += 1;
        issues.push({
          ...issueBase,
          type: "invalid_ingredient_mapping",
          ingredientId,
          message: "El ingredientId no existe en ingredientes master activos."
        });
        return ingredient;
      }

      if (matches.length === 1) {
        const match = matches[0];
        const categoryId = asId(match.categoryId);
        if (autoApply) {
          ingredient.ingredientId = match._id;
          ingredient.categoryId = match.categoryId || null;
          ingredient.displayName = ingredient.displayName || match.name;
          ingredient.canonicalName = normalizeIngredientName(match.canonicalName || match.name);
          changed = true;
        }
        if (!categoryId || !context.categoriesById.has(categoryId)) {
          summary.missingIngredientCategories += 1;
          issues.push({
            ...issueBase,
            type: "missing_ingredient_category",
            ingredientId: String(match._id),
            suggestedMatches: [suggestionFromIngredient(match)],
            message: "El ingrediente encontrado no tiene una categoria valida."
          });
        } else {
          summary.normalizedIngredients += 1;
        }
        return ingredient;
      }

      if (matches.length > 1) {
        summary.ambiguousMatches += 1;
        issues.push({
          ...issueBase,
          type: "ambiguous_ingredient_match",
          suggestedMatches: matches.slice(0, 8).map(suggestionFromIngredient),
          message: "Hay varios ingredientes master posibles. Requiere decision manual."
        });
        return ingredient;
      }

      summary.missingIngredientMappings += 1;
      issues.push({
        ...issueBase,
        type: "missing_ingredient_mapping",
        suggestedMatches: [],
        message: "No hay ingredientId ni coincidencia master segura."
      });
      return ingredient;
    });

    return { ...dish, ingredients };
  });

  for (const duplicate of duplicateNames.values()) {
    if (duplicate.occurrences > 1 && duplicate.names.size > 1) {
      summary.duplicateIngredientNames += 1;
      issues.push({
        type: "duplicate_ingredient_name",
        key: `duplicate:${duplicate.normalizedName}`,
        normalizedName: duplicate.normalizedName,
        names: [...duplicate.names],
        occurrences: duplicate.occurrences,
        message: "El mismo ingrediente aparece con nombres distintos dentro del pack."
      });
    }
  }

  summary.unresolvedIssues =
    summary.missingIngredientMappings +
    summary.missingIngredientCategories +
    summary.missingDishCategories +
    summary.ambiguousMatches +
    summary.invalidMappings;

  return {
    dishes,
    summary,
    issues,
    changed,
    isFullyNormalized: summary.unresolvedIssues === 0
  };
}

export async function applyCatalogPackValidation(pack, { autoApply = true } = {}) {
  const validation = await validateCatalogPackData(pack, { autoApply });
  if (autoApply && validation.changed && pack.status !== "published") {
    pack.dishes = validation.dishes;
  }
  pack.validationSummary = validation.summary;
  pack.reviewIssues = validation.issues;
  pack.normalizedAt = new Date();
  if (pack.status !== "published") {
    pack.status = validation.isFullyNormalized ? "ready" : "needs_review";
  }
  return validation;
}

export async function assertIngredientCanBeCreated({ name, categoryId }) {
  const trimmedName = String(name || "").trim();
  if (!trimmedName) {
    const error = new Error("El nombre del ingrediente es obligatorio.");
    error.statusCode = 400;
    throw error;
  }
  if (!categoryId || !mongoose.isValidObjectId(categoryId)) {
    const error = new Error("categoryId valido es obligatorio.");
    error.statusCode = 400;
    throw error;
  }
  const category = await Category.findOne({ _id: categoryId, scope: "master", active: { $ne: false } }).lean();
  if (!category) {
    const error = new Error("La categoria de ingrediente no existe o no es master.");
    error.statusCode = 400;
    throw error;
  }
  const canonicalName = normalizeIngredientName(trimmedName);
  const existing = await KitchenIngredient.findOne({ scope: "master", canonicalName }).lean();
  if (existing) {
    const error = new Error("Ya existe un ingrediente master con ese nombre normalizado.");
    error.statusCode = 409;
    error.existing = existing;
    throw error;
  }
  return { name: trimmedName, canonicalName, category };
}
