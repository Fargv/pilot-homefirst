import fs from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";
import mongoose from "mongoose";
import { resolveMongoUrl } from "./mongo-url.js";
import { Category } from "../src/kitchen/models/Category.js";
import { KitchenIngredient } from "../src/kitchen/models/KitchenIngredient.js";
import { KitchenDish } from "../src/kitchen/models/KitchenDish.js";
import { KitchenDishCategory } from "../src/kitchen/models/KitchenDishCategory.js";
import { CatalogPack } from "../src/kitchen/models/CatalogPack.js";
import { slugifyCategory } from "../src/kitchen/utils/categoryMatching.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const REPORT_DIR = path.resolve(__dirname, "../reports");
const OVERRIDES_PATH = path.resolve(__dirname, "normalization-overrides.json");
const APPLY = process.argv.includes("--apply");

const SAFE_PLURAL_VARIANTS = new Map([
  ["huevos", "huevo"],
  ["patatas", "patata"],
  ["tomates", "tomate"],
  ["cebollas", "cebolla"],
  ["aceitunas", "aceituna"],
  ["garbanzos", "garbanzo"],
  ["lentejas", "lenteja"],
  ["tortillas", "tortilla"]
]);

const CANONICAL_VARIANTS = new Map([
  ["queso fetta", "queso feta"],
  ["fetta", "feta"]
]);

const DISPLAY_NAME_CORRECTIONS = new Map([
  ["queso fetta", "Queso feta"]
]);

const CATEGORY_RULES = [
  ["Carnicería", /\b(carne|ternera|cerdo|lomo|solomillo|costilla|chorizo|morcilla|bacon|panceta|salchicha|hamburguesa|cordero)\b/],
  ["Pescadería", /\b(pescado|merluza|bacalao|atun fresco|atún fresco|salmon|salmón|gamba|langostino|mejillon|mejillón|calamar|pulpo|sepia|almeja|marisco)\b/],
  ["Charcutería", /\b(jamon|jamón|serrano|pavo lonchas|fuet|salami|choped|mortadela)\b/],
  ["Lácteos y Huevos", /\b(huevo|leche|queso|yogur|yogurt|nata|mantequilla|crema agria|parmesano|feta|cheddar|mozzarella|ricotta)\b/],
  ["Frutas y Verduras", /\b(tomate|cebolla|patata|pimiento|padron|padrón|lechuga|pepino|zanahoria|calabacin|calabacín|berenjena|ajo|limon|limón|lima|cilantro|albahaca|perejil|manzana|platano|plátano|naranja|fruta|verdura|chile|guindilla|aguacate|espinaca|brócoli|brocoli|coliflor|seta|champiñon|champiñón|aceituna)\b/],
  ["Conservas", /\b(conserva|lata|en lata|atun|atún|maiz dulce|maíz dulce|anchoa|sardin|tomate triturado|tomate frito)\b/],
  ["Pasta, Arroz y Legumbres", /\b(arroz|pasta|macarron|macarrón|espagueti|spaghetti|tallarines|fideo|galet|galets|lenteja|garbanzo|alubia|judia|judía|frijol|frijoles|maiz mote|maíz mote|harina|tortilla de maiz|tortilla de maíz|tortilla de trigo|cuscus|couscous)\b/],
  ["Panadería y Bollería", /\b(pan|pita|baguette|mollete|tostada|brioche|masa de pizza)\b/],
  ["Aceites, Salsas y Condimentos", /\b(aceite|vinagre|sal|pimienta|curry|comino|pimenton|pimentón|oregano|orégano|salsa|soja|mostaza|mayonesa|ketchup|caldo|tahini|especia|condimento|azucar|azúcar|miel)\b/],
  ["Snacks y Aperitivos", /\b(nachos|patatas fritas|cacahuete|almendra|nuez|nueces|pistacho|piñon|piñón|snack|aperitivo)\b/],
  ["Congelados", /\b(congelad[oa]s?|helado|guisantes congelados)\b/]
];

const DISH_CATEGORY_RULES = [
  ["Pollo y aves", /\b(pollo|pavo|ave|aves)\b/],
  ["Pescado", /\b(pescado|merluza|bacalao|atun|atún|salmon|salmón|gamba|langostino|marisco|mejillon|mejillón|pulpo|calamar|sepia)\b/],
  ["Carne", /\b(carne|ternera|cerdo|lomo|costilla|chorizo|salchicha|cordero|albondiga|albóndiga|hamburguesa)\b/],
  ["Legumbres", /\b(lenteja|garbanzo|alubia|judia|judía|frijol|frijoles|hummus)\b/],
  ["Pasta", /\b(pasta|macarron|macarrón|espagueti|spaghetti|tallarines|lasaña|ravioli|noodle)\b/],
  ["Arroz", /\b(arroz|risotto|paella)\b/],
  ["Huevos", /\b(huevo|tortilla|revuelto|frittata)\b/],
  ["Verduras", /\b(ensalada|verdura|tomate|berenjena|calabacin|calabacín|pimiento|patata|bravas|gazpacho|salmorejo)\b/],
  ["Especial", /\b(croqueta|tapa|tapas|navidad|especial|fiesta|nachos)\b/]
];

function timestamp() {
  const now = new Date();
  const pad = (value) => String(value).padStart(2, "0");
  return `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}-${pad(now.getHours())}${pad(now.getMinutes())}`;
}

function normalizeName(value = "") {
  const base = String(value || "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .replace(/[.,;:!?¡¿()[\]{}"'`´]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (!base) return "";

  const variant = CANONICAL_VARIANTS.get(base);
  if (variant) return variant;

  return base
    .split(" ")
    .map((token) => SAFE_PLURAL_VARIANTS.get(token) || token)
    .join(" ")
    .replace(/\s+/g, " ")
    .trim();
}

function displayName(value = "") {
  return String(value || "")
    .trim()
    .replace(/\s+/g, " ");
}

function asId(value) {
  const raw = value?._id || value;
  return raw && mongoose.isValidObjectId(raw) ? String(raw) : null;
}

function idEquals(a, b) {
  const left = asId(a);
  const right = asId(b);
  return Boolean(left && right && left === right);
}

function toPlain(doc) {
  return typeof doc?.toObject === "function" ? doc.toObject() : doc;
}

function cleanIngredientName(ingredient) {
  const raw = displayName(ingredient?.name || ingredient?.displayName || ingredient?.canonicalName || "");
  return DISPLAY_NAME_CORRECTIONS.get(normalizeName(raw)) || raw;
}

async function loadOverrides() {
  try {
    const raw = await fs.readFile(OVERRIDES_PATH, "utf8");
    const parsed = JSON.parse(raw);
    return {
      ingredientMappings: normalizeObjectKeys(parsed.ingredientMappings),
      ingredientCategories: normalizeObjectKeys(parsed.ingredientCategories),
      dishCategories: normalizeObjectKeys(parsed.dishCategories)
    };
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
    return { ingredientMappings: {}, ingredientCategories: {}, dishCategories: {} };
  }
}

function normalizeObjectKeys(object = {}) {
  return Object.fromEntries(
    Object.entries(object || {}).map(([key, value]) => [normalizeName(key), value])
  );
}

function categoryKey(category) {
  return normalizeName(category?.name || category?.slug || "");
}

function buildCategoryLookup(categories) {
  const lookup = new Map();
  for (const category of categories) {
    const keys = [
      categoryKey(category),
      normalizeName(category.slug),
      normalizeName(slugifyCategory(category.name || "")),
      normalizeName(category.name)
    ].filter(Boolean);
    for (const key of keys) {
      if (!lookup.has(key)) lookup.set(key, category);
    }
  }
  return lookup;
}

function buildDishCategoryLookup(categories) {
  const lookup = new Map();
  for (const category of categories) {
    for (const key of [normalizeName(category.name), normalizeName(category.code), normalizeName(category.slug)].filter(Boolean)) {
      if (!lookup.has(key)) lookup.set(key, category);
    }
  }
  return lookup;
}

function findCategoryByName(name, categoryLookup) {
  return categoryLookup.get(normalizeName(name)) || null;
}

function inferCategory(name, { categoryLookup, overrides, similarIngredients = [] }) {
  const key = normalizeName(name);
  const overrideName = overrides.ingredientCategories[key];
  if (overrideName) {
    const category = findCategoryByName(overrideName, categoryLookup);
    if (category) return { category, reason: `override:${overrideName}` };
  }

  const exactWithCategory = similarIngredients.find((ingredient) => ingredient.categoryId);
  if (exactWithCategory) {
    return { category: { _id: exactWithCategory.categoryId }, reason: `similar:${exactWithCategory.name}` };
  }

  for (const [categoryName, pattern] of CATEGORY_RULES) {
    if (pattern.test(key)) {
      const category = findCategoryByName(categoryName, categoryLookup);
      if (category) return { category, reason: `taxonomy:${categoryName}` };
    }
  }

  return { category: null, reason: "no safe category inference" };
}

function inferDishCategory(dish, { dishCategoryLookup, overrides }) {
  const dishName = displayName(dish?.name || "");
  const key = normalizeName(dishName);
  const overrideName = overrides.dishCategories[key];
  if (overrideName) {
    const category = findCategoryByName(overrideName, dishCategoryLookup);
    if (category) return { category, reason: `override:${overrideName}` };
  }

  const ingredientText = (dish?.ingredients || [])
    .map((ingredient) => ingredient?.displayName || ingredient?.canonicalName || "")
    .join(" ");
  const haystack = normalizeName(`${dishName} ${ingredientText}`);
  for (const [categoryName, pattern] of DISH_CATEGORY_RULES) {
    if (pattern.test(haystack)) {
      const category = findCategoryByName(categoryName, dishCategoryLookup);
      if (category) return { category, reason: `taxonomy:${categoryName}` };
    }
  }

  return { category: null, reason: "no safe dish category inference" };
}

function ingredientSuggestion(ingredient) {
  return {
    id: String(ingredient._id),
    name: cleanIngredientName(ingredient),
    canonicalName: ingredient.canonicalName || normalizeName(ingredient.name),
    categoryId: ingredient.categoryId ? String(ingredient.categoryId) : null,
    scope: ingredient.scope,
    active: ingredient.active !== false
  };
}

function choosePreferredIngredient(group, usageCounts) {
  const scored = [...group].sort((a, b) => {
    const score = (ingredient) => {
      let value = 0;
      if (ingredient.scope === "master") value += 1000;
      if (ingredient.active !== false) value += 300;
      if (ingredient.categoryId) value += 200;
      if (!ingredient.deletedAt && !ingredient.isArchived) value += 100;
      value += (usageCounts.get(String(ingredient._id)) || 0) * 10;
      const clean = cleanIngredientName(ingredient);
      if (clean && clean === displayName(clean)) value += 5;
      value -= clean.length / 100;
      return value;
    };
    return score(b) - score(a) || String(a._id).localeCompare(String(b._id));
  });
  return scored[0];
}

function groupIngredients(ingredients) {
  const groups = new Map();
  for (const ingredient of ingredients) {
    const keys = [
      normalizeName(ingredient.canonicalName),
      normalizeName(ingredient.name)
    ].filter(Boolean);
    for (const key of new Set(keys)) {
      const list = groups.get(key) || [];
      list.push(ingredient);
      groups.set(key, list);
    }
  }
  return groups;
}

function dedupeDuplicateGroups(groups) {
  const seen = new Set();
  const deduped = [];
  for (const group of groups) {
    const signature = group.ingredients.map((ingredient) => ingredient.id).sort().join("|");
    if (seen.has(signature)) continue;
    seen.add(signature);
    deduped.push(group);
  }
  return deduped;
}

function buildIngredientIndexes(ingredients, duplicatePreferredById) {
  const byId = new Map(ingredients.map((ingredient) => [String(ingredient._id), ingredient]));
  const byName = new Map();
  for (const ingredient of ingredients) {
    for (const key of [normalizeName(ingredient.canonicalName), normalizeName(ingredient.name)].filter(Boolean)) {
      const list = byName.get(key) || [];
      list.push(ingredient);
      byName.set(key, list);
    }
  }

  const preferredByName = new Map();
  for (const [key, list] of byName.entries()) {
    const preferred = list.find((ingredient) => !duplicatePreferredById.has(String(ingredient._id))) || list[0];
    if (list.length === 1 || preferred) preferredByName.set(key, preferred);
  }

  return { byId, byName, preferredByName };
}

function calculateUsageCounts(dishes, packs) {
  const usageCounts = new Map();
  const bump = (id) => {
    const safeId = asId(id);
    if (safeId) usageCounts.set(safeId, (usageCounts.get(safeId) || 0) + 1);
  };

  for (const dish of dishes) {
    for (const ingredient of dish.ingredients || []) bump(ingredient.ingredientId);
  }
  for (const pack of packs) {
    for (const dish of pack.dishes || []) {
      for (const ingredient of dish.ingredients || []) bump(ingredient.ingredientId);
    }
  }
  return usageCounts;
}

function pushManualReview(manualReview, item) {
  manualReview.push({
    type: item.type,
    collection: item.collection,
    documentId: item.documentId ? String(item.documentId) : null,
    documentName: item.documentName || null,
    fieldPath: item.fieldPath || null,
    currentValue: item.currentValue ?? null,
    suggestedCandidates: item.suggestedCandidates || [],
    reason: item.reason,
    recommendedAction: item.recommendedAction || "Review and add an explicit override if this should be auto-normalized."
  });
}

function findExactIngredient(name, indexes, overrides) {
  const rawKey = normalizeName(name);
  const overrideTarget = overrides.ingredientMappings[rawKey];
  const key = normalizeName(overrideTarget || rawKey);
  const matches = indexes.byName.get(key) || [];
  const masterActive = matches.filter((ingredient) => ingredient.scope === "master" && ingredient.active !== false && !ingredient.deletedAt && !ingredient.isArchived);
  const candidates = masterActive;
  if (candidates.length === 1) return { ingredient: candidates[0], reason: overrideTarget ? `override:${overrideTarget}` : "exact normalized match" };
  if (candidates.length > 1) {
    const preferred = candidates.find((ingredient) => indexes.preferredByName.get(key) && idEquals(indexes.preferredByName.get(key)._id, ingredient._id));
    if (preferred) return { ingredient: preferred, reason: "duplicate preferred exact match" };
    return { ambiguous: candidates, reason: "multiple exact normalized matches" };
  }
  return { ingredient: null, reason: "no exact match" };
}

function resolveIngredientReference(rawIngredient, context) {
  const { indexes, duplicatePreferredById, categoryLookup, overrides, ingredientsToCreate, manualReview, source } = context;
  const currentId = asId(rawIngredient.ingredientId);
  const currentName = displayName(rawIngredient.displayName || rawIngredient.name || rawIngredient.canonicalName || "");
  const sourceLabel = `${source.collection}:${source.documentName}:${source.fieldPath}`;

  if (currentId && indexes.byId.has(currentId)) {
    const existing = indexes.byId.get(currentId);
    const preferredId = duplicatePreferredById.get(currentId);
    const ingredient = preferredId ? indexes.byId.get(preferredId) : existing;
    return {
      status: "matched",
      ingredient,
      reason: preferredId ? "duplicate remap" : "valid existing ingredientId"
    };
  }

  const match = findExactIngredient(currentName, indexes, overrides);
  if (match.ingredient) {
    return {
      status: "matched",
      ingredient: match.ingredient,
      reason: currentId ? `invalid ingredientId replaced by ${match.reason}` : match.reason
    };
  }

  if (match.ambiguous) {
    pushManualReview(manualReview, {
      ...source,
      type: "ambiguous_ingredient_match",
      currentValue: currentName,
      suggestedCandidates: match.ambiguous.slice(0, 10).map(ingredientSuggestion),
      reason: currentId ? `ingredientId ${currentId} is invalid and ${match.reason}` : match.reason
    });
    return { status: "manual", reason: match.reason };
  }

  const key = normalizeName(currentName);
  if (!key) {
    pushManualReview(manualReview, {
      ...source,
      type: "missing_ingredient_name",
      currentValue: rawIngredient,
      reason: "Ingredient reference has no usable name."
    });
    return { status: "manual", reason: "missing name" };
  }

  const similarIngredients = indexes.byName.get(key) || [];
  const inferred = inferCategory(currentName, { categoryLookup, overrides, similarIngredients });
  if (!inferred.category) {
    pushManualReview(manualReview, {
      ...source,
      type: "missing_master_ingredient",
      currentValue: currentName,
      suggestedCandidates: [],
      reason: currentId
        ? `ingredientId ${currentId} is invalid, no existing master ingredient by name, and ${inferred.reason}.`
        : `No existing master ingredient and ${inferred.reason}.`,
      recommendedAction: "Create a master ingredient with categoryId or add ingredientCategories override."
    });
    return { status: "manual", reason: inferred.reason };
  }

  if (!ingredientsToCreate.has(key)) {
    ingredientsToCreate.set(key, {
      key,
      name: currentName,
      canonicalName: key,
      categoryId: String(inferred.category._id),
      categoryName: inferred.category.name || null,
      reason: inferred.reason,
      occurrences: []
    });
  }
  ingredientsToCreate.get(key).occurrences.push(sourceLabel);
  return {
    status: "create",
    createKey: key,
    ingredient: null,
    reason: inferred.reason
  };
}

function maybeIngredientPatch(rawIngredient, resolved, createPlan = null) {
  const ingredient = resolved.ingredient || createPlan;
  if (!ingredient) return null;

  const next = {
    ingredientId: ingredient._id || ingredient.id || null,
    displayName: cleanIngredientName(ingredient),
    canonicalName: normalizeName(ingredient.canonicalName || ingredient.name),
    categoryId: ingredient.categoryId || null
  };

  const changes = {};
  if (!idEquals(rawIngredient.ingredientId, next.ingredientId)) changes.ingredientId = next.ingredientId;
  if (displayName(rawIngredient.displayName) !== next.displayName) changes.displayName = next.displayName;
  if (normalizeName(rawIngredient.canonicalName) !== next.canonicalName) changes.canonicalName = next.canonicalName;
  if ("categoryId" in rawIngredient && next.categoryId && !idEquals(rawIngredient.categoryId, next.categoryId)) {
    changes.categoryId = next.categoryId;
  }
  return Object.keys(changes).length ? changes : null;
}

function hasValidId(value, validIds) {
  const id = asId(value);
  return Boolean(id && validIds.has(id));
}

function setObjectId(value) {
  const id = asId(value);
  return id ? new mongoose.Types.ObjectId(id) : value;
}

async function createBackup({ stamp }) {
  const [categories, dishCategories, ingredients, dishes, packs] = await Promise.all([
    Category.find({}).lean(),
    KitchenDishCategory.find({}).lean(),
    KitchenIngredient.find({}).lean(),
    KitchenDish.find({}).lean(),
    CatalogPack.find({}).lean()
  ]);
  const backupPath = path.join(REPORT_DIR, `normalization-backup-${stamp}.json`);
  await fs.writeFile(
    backupPath,
    JSON.stringify({ categories, dishCategories, kitchenIngredients: ingredients, kitchenDishes: dishes, catalogPacks: packs }, null, 2)
  );
  return backupPath;
}

function buildMarkdownReport(report) {
  const lines = [
    `# Lunchfy normalization report ${report.timestamp}`,
    "",
    `Mode: ${report.mode}`,
    "",
    "## Summary",
    "",
    `- Ingredients analyzed: ${report.summary.ingredientsAnalyzed}`,
    `- Duplicate ingredient groups: ${report.summary.duplicateIngredientGroups}`,
    `- Ingredients missing categoryId: ${report.summary.ingredientsMissingCategoryId}`,
    `- Dish ingredient refs to update: ${report.summary.dishIngredientRefsToUpdate}`,
    `- Catalog ingredient refs to update: ${report.summary.catalogIngredientRefsToUpdate}`,
    `- Ingredients to create: ${report.summary.ingredientsToCreate}`,
    `- Dish categories to assign: ${report.summary.dishCategoriesToAssign}`,
    `- Manual review items: ${report.summary.manualReviewCount}`,
    `- Skipped unsafe items: ${report.summary.skippedUnsafeItems}`,
    "",
    "## Duplicate ingredient groups",
    ""
  ];

  if (!report.duplicateIngredientGroups.length) {
    lines.push("- None");
  } else {
    for (const group of report.duplicateIngredientGroups.slice(0, 80)) {
      lines.push(`- ${group.normalizedName}: preferred ${group.preferred?.name || "n/a"} (${group.preferred?.id || "n/a"})`);
      for (const item of group.ingredients) {
        lines.push(`  - ${item.name} (${item.id}) category=${item.categoryId || "missing"} usage=${item.usageCount}`);
      }
    }
  }

  lines.push("", "## Ingredients to create", "");
  if (!report.ingredientsToCreate.length) {
    lines.push("- None");
  } else {
    for (const item of report.ingredientsToCreate) {
      lines.push(`- ${item.name} -> ${item.categoryName || item.categoryId} (${item.reason})`);
    }
  }

  lines.push("", "## Manual review", "");
  if (!report.manualReview.length) {
    lines.push("- None");
  } else {
    for (const item of report.manualReview.slice(0, 120)) {
      lines.push(`- ${item.type} in ${item.collection} ${item.documentName || item.documentId || ""} at ${item.fieldPath || "n/a"}: ${item.reason}`);
    }
    if (report.manualReview.length > 120) lines.push(`- ... ${report.manualReview.length - 120} more items in JSON report`);
  }

  lines.push("", "## Safety notes", "");
  lines.push("- No records are deleted, archived, or published by this script.");
  lines.push("- Apply mode writes only planned ID/category/display metadata updates and creates safe master ingredients.");
  lines.push("- Ambiguous or unsafe items remain untouched and are written to the manual review file.");
  return `${lines.join("\n")}\n`;
}

async function writeReports({ stamp, report, manualReview }) {
  await fs.mkdir(REPORT_DIR, { recursive: true });
  const jsonPath = path.join(REPORT_DIR, `normalization-report-${stamp}.json`);
  const mdPath = path.join(REPORT_DIR, `normalization-report-${stamp}.md`);
  const manualPath = path.join(REPORT_DIR, `normalization-manual-review-${stamp}.json`);
  await fs.writeFile(jsonPath, JSON.stringify(report, null, 2));
  await fs.writeFile(mdPath, buildMarkdownReport(report));
  await fs.writeFile(manualPath, JSON.stringify(manualReview, null, 2));
  return { jsonPath, mdPath, manualPath };
}

async function main() {
  const stamp = timestamp();
  const overrides = await loadOverrides();
  await fs.mkdir(REPORT_DIR, { recursive: true });
  await mongoose.connect(resolveMongoUrl());

  const [categories, dishCategories, ingredients, dishes, packs] = await Promise.all([
    Category.find({ scope: "master", active: { $ne: false }, isArchived: { $ne: true } }).lean(),
    KitchenDishCategory.find({ active: { $ne: false } }).lean(),
    KitchenIngredient.find({ $or: [{ deletedAt: null }, { deletedAt: { $exists: false } }], isArchived: { $ne: true } }).lean(),
    KitchenDish.find({ $or: [{ deletedAt: null }, { deletedAt: { $exists: false } }], isArchived: { $ne: true } }).lean(),
    CatalogPack.find({ active: { $ne: false } }).lean()
  ]);

  const categoryLookup = buildCategoryLookup(categories);
  const dishCategoryLookup = buildDishCategoryLookup(dishCategories);
  const validIngredientIds = new Set(ingredients.map((ingredient) => String(ingredient._id)));
  const validDishCategoryIds = new Set(dishCategories.map((category) => String(category._id)));
  const usageCounts = calculateUsageCounts(dishes, packs);
  const ingredientGroups = groupIngredients(ingredients);
  const duplicatePreferredById = new Map();
  const duplicateIngredientGroups = [];
  const manualReview = [];

  for (const [key, group] of ingredientGroups.entries()) {
    const uniqueIds = [...new Map(group.map((ingredient) => [String(ingredient._id), ingredient])).values()];
    if (uniqueIds.length < 2) continue;
    const preferred = choosePreferredIngredient(uniqueIds, usageCounts);
    for (const ingredient of uniqueIds) {
      if (ingredient.scope !== "household" && !idEquals(ingredient._id, preferred._id)) {
        duplicatePreferredById.set(String(ingredient._id), String(preferred._id));
      }
    }
    duplicateIngredientGroups.push({
      normalizedName: key,
      preferred: ingredientSuggestion(preferred),
      ingredients: uniqueIds.map((ingredient) => ({
        ...ingredientSuggestion(ingredient),
        usageCount: usageCounts.get(String(ingredient._id)) || 0,
        preferred: idEquals(ingredient._id, preferred._id)
      }))
    });
  }
  duplicateIngredientGroups.splice(0, duplicateIngredientGroups.length, ...dedupeDuplicateGroups(duplicateIngredientGroups));

  let indexes = buildIngredientIndexes(ingredients, duplicatePreferredById);
  const ingredientsToCreate = new Map();
  const ingredientCategoryUpdates = [];
  const inconsistentCanonicalNames = [];
  const dishCategoryUpdates = [];
  const dishIngredientUpdates = [];
  const catalogDishCategoryUpdates = [];
  const catalogIngredientUpdates = [];
  const skippedUnsafeItems = [];

  for (const ingredient of ingredients) {
    const expectedCanonicalName = normalizeName(ingredient.name || ingredient.canonicalName);
    if (expectedCanonicalName && normalizeName(ingredient.canonicalName) !== expectedCanonicalName) {
      inconsistentCanonicalNames.push({
        ingredientId: String(ingredient._id),
        name: ingredient.name,
        currentCanonicalName: ingredient.canonicalName || null,
        suggestedCanonicalName: expectedCanonicalName,
        reason: "canonicalName differs from robust normalized display name; not auto-updated by this script."
      });
    }

    if (ingredient.categoryId) continue;
    const inferred = inferCategory(ingredient.name || ingredient.canonicalName, {
      categoryLookup,
      overrides,
      similarIngredients: (indexes.byName.get(normalizeName(ingredient.name || ingredient.canonicalName)) || []).filter((candidate) => !idEquals(candidate._id, ingredient._id))
    });
    if (inferred.category) {
      ingredientCategoryUpdates.push({
        ingredientId: String(ingredient._id),
        name: ingredient.name,
        categoryId: String(inferred.category._id),
        categoryName: inferred.category.name || null,
        reason: inferred.reason
      });
    } else {
      pushManualReview(manualReview, {
        type: "missing_ingredient_category",
        collection: "kitchenIngredients",
        documentId: ingredient._id,
        documentName: ingredient.name,
        fieldPath: "categoryId",
        currentValue: null,
        reason: inferred.reason,
        recommendedAction: "Assign a safe master category or add ingredientCategories override."
      });
    }
  }

  for (const dish of dishes) {
    if (!hasValidId(dish.dishCategoryId, validDishCategoryIds)) {
      const inferred = inferDishCategory(dish, { dishCategoryLookup, overrides });
      if (inferred.category) {
        dishCategoryUpdates.push({
          dishId: String(dish._id),
          dishName: dish.name,
          dishCategoryId: String(inferred.category._id),
          dishCategoryName: inferred.category.name,
          reason: inferred.reason
        });
      } else {
        pushManualReview(manualReview, {
          type: "missing_dish_category",
          collection: "kitchenDishes",
          documentId: dish._id,
          documentName: dish.name,
          fieldPath: "dishCategoryId",
          currentValue: dish.dishCategoryId || null,
          reason: inferred.reason,
          recommendedAction: "Choose a dish category or add dishCategories override."
        });
      }
    }

    (dish.ingredients || []).forEach((ingredient, index) => {
      const resolved = resolveIngredientReference(ingredient, {
        indexes,
        duplicatePreferredById,
        categoryLookup,
        overrides,
        ingredientsToCreate,
        manualReview,
        source: {
          collection: "kitchenDishes",
          documentId: dish._id,
          documentName: dish.name,
          fieldPath: `ingredients.${index}`
        }
      });
      if (resolved.status === "manual") return;

      const patch = maybeIngredientPatch(ingredient, resolved);
      if (patch || resolved.status === "create") {
        dishIngredientUpdates.push({
          dishId: String(dish._id),
          dishName: dish.name,
          ingredientIndex: index,
          current: ingredient,
          changes: patch,
          createKey: resolved.createKey || null,
          reason: resolved.reason
        });
      }
    });
  }

  for (const pack of packs) {
    (pack.dishes || []).forEach((dish, dishIndex) => {
      if (!hasValidId(dish.dishCategoryId, validDishCategoryIds)) {
        const inferred = inferDishCategory(dish, { dishCategoryLookup, overrides });
        if (inferred.category) {
          catalogDishCategoryUpdates.push({
            packId: String(pack._id),
            packSlug: pack.slug,
            dishIndex,
            dishName: dish.name,
            dishCategoryId: String(inferred.category._id),
            dishCategoryName: inferred.category.name,
            reason: inferred.reason
          });
        } else {
          pushManualReview(manualReview, {
            type: "missing_catalog_dish_category",
            collection: "catalogPacks",
            documentId: pack._id,
            documentName: `${pack.slug} / ${dish.name}`,
            fieldPath: `dishes.${dishIndex}.dishCategoryId`,
            currentValue: dish.dishCategoryId || null,
            reason: inferred.reason,
            recommendedAction: "Choose a dish category or add dishCategories override."
          });
        }
      }

      (dish.ingredients || []).forEach((ingredient, ingredientIndex) => {
        const resolved = resolveIngredientReference(ingredient, {
          indexes,
          duplicatePreferredById,
          categoryLookup,
          overrides,
          ingredientsToCreate,
          manualReview,
          source: {
            collection: "catalogPacks",
            documentId: pack._id,
            documentName: `${pack.slug} / ${dish.name}`,
            fieldPath: `dishes.${dishIndex}.ingredients.${ingredientIndex}`
          }
        });
        if (resolved.status === "manual") return;

        const patch = maybeIngredientPatch(ingredient, resolved);
        const existingCategoryId = resolved.ingredient?.categoryId || null;
        if (existingCategoryId && !idEquals(ingredient.categoryId, existingCategoryId)) {
          const changes = { ...(patch || {}), categoryId: String(existingCategoryId) };
          catalogIngredientUpdates.push({
            packId: String(pack._id),
            packSlug: pack.slug,
            dishIndex,
            dishName: dish.name,
            ingredientIndex,
            current: ingredient,
            changes,
            createKey: resolved.createKey || null,
            reason: resolved.reason
          });
          return;
        }

        if (patch || resolved.status === "create") {
          catalogIngredientUpdates.push({
            packId: String(pack._id),
            packSlug: pack.slug,
            dishIndex,
            dishName: dish.name,
            ingredientIndex,
            current: ingredient,
            changes: patch,
            createKey: resolved.createKey || null,
            reason: resolved.reason
          });
        }
      });
    });
  }

  const report = {
    timestamp: stamp,
    mode: APPLY ? "apply" : "dry-run",
    generatedAt: new Date().toISOString(),
    summary: {
      ingredientsAnalyzed: ingredients.length,
      duplicateIngredientGroups: duplicateIngredientGroups.length,
      ingredientsMissingCategoryId: ingredientCategoryUpdates.length + manualReview.filter((item) => item.type === "missing_ingredient_category").length,
      dishIngredientRefsToUpdate: dishIngredientUpdates.length,
      catalogIngredientRefsToUpdate: catalogIngredientUpdates.length,
      ingredientsToCreate: ingredientsToCreate.size,
      dishCategoriesToAssign: dishCategoryUpdates.length + catalogDishCategoryUpdates.length,
      manualReviewCount: manualReview.length,
      skippedUnsafeItems: skippedUnsafeItems.length
    },
    duplicateIngredientGroups,
    ingredientsMissingCategoryId: ingredientCategoryUpdates,
    dishesMissingDishCategoryId: dishCategoryUpdates,
    dishIngredientsMissingIngredientId: dishIngredientUpdates.filter((item) => !item.current?.ingredientId),
    catalogPackDishesMissingDishCategoryId: catalogDishCategoryUpdates,
    catalogPackIngredientsMissingIngredientId: catalogIngredientUpdates.filter((item) => !item.current?.ingredientId),
    ingredientsToCreate: [...ingredientsToCreate.values()],
    inconsistentCanonicalNames,
    mappingsToApply: {
      duplicateIngredientIdMappings: [...duplicatePreferredById.entries()].map(([from, to]) => ({ from, to })),
      dishIngredientUpdates,
      catalogIngredientUpdates,
      ingredientCategoryUpdates,
      dishCategoryUpdates,
      catalogDishCategoryUpdates
    },
    ambiguousMatchesRequiringManualReview: manualReview.filter((item) => item.type.includes("ambiguous")),
    skippedUnsafeItems,
    manualReview
  };

  let backupPath = null;
  const createdByKey = new Map();
  const applyStats = {
    createdIngredients: 0,
    updatedIngredientCategories: 0,
    updatedDishIngredientRefs: 0,
    updatedDishCategories: 0,
    updatedCatalogRefs: 0,
    updatedCatalogDishCategories: 0,
    skippedUnsafe: skippedUnsafeItems.length
  };

  if (APPLY) {
    backupPath = await createBackup({ stamp });

    for (const plan of ingredientsToCreate.values()) {
      const existing = await KitchenIngredient.findOne({ scope: "master", canonicalName: plan.canonicalName });
      const created = existing || await KitchenIngredient.create({
        scope: "master",
        name: plan.name,
        canonicalName: plan.canonicalName,
        categoryId: setObjectId(plan.categoryId),
        active: true
      });
      createdByKey.set(plan.key, {
        id: String(created._id),
        _id: created._id,
        name: created.name,
        canonicalName: created.canonicalName,
        categoryId: created.categoryId
      });
      if (!existing) applyStats.createdIngredients += 1;
    }

    for (const plan of ingredientCategoryUpdates) {
      const result = await KitchenIngredient.updateOne(
        { _id: plan.ingredientId, $or: [{ categoryId: { $exists: false } }, { categoryId: null }] },
        { $set: { categoryId: setObjectId(plan.categoryId) } }
      );
      applyStats.updatedIngredientCategories += result.modifiedCount;
    }

    for (const plan of dishCategoryUpdates) {
      const result = await KitchenDish.updateOne(
        { _id: plan.dishId },
        { $set: { dishCategoryId: setObjectId(plan.dishCategoryId) } }
      );
      applyStats.updatedDishCategories += result.modifiedCount;
    }

    const dishUpdatesById = new Map();
    for (const plan of dishIngredientUpdates) {
      const list = dishUpdatesById.get(plan.dishId) || [];
      list.push(plan);
      dishUpdatesById.set(plan.dishId, list);
    }
    for (const [dishId, plans] of dishUpdatesById.entries()) {
      const dish = await KitchenDish.findById(dishId);
      if (!dish) continue;
      for (const plan of plans) {
        const target = dish.ingredients?.[plan.ingredientIndex];
        if (!target) continue;
        const created = plan.createKey ? createdByKey.get(plan.createKey) : null;
        const changes = plan.changes || maybeIngredientPatch(target, { ingredient: created });
        if (!changes) continue;
        if (changes.ingredientId) target.ingredientId = setObjectId(changes.ingredientId);
        if (changes.displayName) target.displayName = changes.displayName;
        if (changes.canonicalName) target.canonicalName = changes.canonicalName;
        applyStats.updatedDishIngredientRefs += 1;
      }
      await dish.save();
    }

    const packUpdatesById = new Map();
    for (const plan of [...catalogDishCategoryUpdates, ...catalogIngredientUpdates]) {
      const list = packUpdatesById.get(plan.packId) || [];
      list.push(plan);
      packUpdatesById.set(plan.packId, list);
    }
    for (const [packId, plans] of packUpdatesById.entries()) {
      const pack = await CatalogPack.findById(packId);
      if (!pack) continue;
      for (const plan of plans) {
        const dish = pack.dishes?.[plan.dishIndex];
        if (!dish) continue;
        if ("dishCategoryId" in plan) {
          dish.dishCategoryId = setObjectId(plan.dishCategoryId);
          applyStats.updatedCatalogDishCategories += 1;
          continue;
        }
        const target = dish.ingredients?.[plan.ingredientIndex];
        if (!target) continue;
        const created = plan.createKey ? createdByKey.get(plan.createKey) : null;
        const changes = plan.changes || maybeIngredientPatch(target, { ingredient: created });
        if (!changes) continue;
        if (changes.ingredientId) target.ingredientId = setObjectId(changes.ingredientId);
        if (changes.categoryId) target.categoryId = setObjectId(changes.categoryId);
        if (changes.displayName) target.displayName = changes.displayName;
        if (changes.canonicalName) target.canonicalName = changes.canonicalName;
        applyStats.updatedCatalogRefs += 1;
      }
      const unresolved = manualReview.filter((item) => item.collection === "catalogPacks" && item.documentId === String(pack._id)).length;
      pack.validationSummary = {
        ...(toPlain(pack).validationSummary || {}),
        missingIngredientMappings: manualReview.filter((item) => item.collection === "catalogPacks" && item.type === "missing_master_ingredient").length,
        missingIngredientCategories: manualReview.filter((item) => item.collection === "catalogPacks" && item.type === "missing_ingredient_category").length,
        missingDishCategories: manualReview.filter((item) => item.collection === "catalogPacks" && item.type === "missing_catalog_dish_category").length,
        ambiguousMatches: manualReview.filter((item) => item.collection === "catalogPacks" && item.type.includes("ambiguous")).length,
        invalidMappings: manualReview.filter((item) => item.collection === "catalogPacks" && item.type === "invalid_ingredient_id").length,
        unresolvedIssues: unresolved,
        normalizedIngredients: applyStats.updatedCatalogRefs,
        totalIngredients: pack.dishes.reduce((sum, dish) => sum + (dish.ingredients?.length || 0), 0),
        totalDishes: pack.dishes.length
      };
      pack.reviewIssues = manualReview.filter((item) => item.collection === "catalogPacks" && item.documentId === String(pack._id));
      pack.normalizedAt = new Date();
      if (pack.status !== "published") pack.status = unresolved === 0 ? "ready" : "needs_review";
      await pack.save();
    }
  }

  report.applyStats = applyStats;
  report.backupPath = backupPath;

  const paths = await writeReports({ stamp, report, manualReview });

  console.log(`Mode: ${APPLY ? "apply" : "dry-run"}`);
  console.log(`Ingredients analyzed: ${report.summary.ingredientsAnalyzed}`);
  console.log(`Duplicate groups found: ${report.summary.duplicateIngredientGroups}`);
  console.log(`Missing ingredient categories: ${report.summary.ingredientsMissingCategoryId}`);
  console.log(`Dish ingredient refs to update: ${report.summary.dishIngredientRefsToUpdate}`);
  console.log(`Catalog ingredient refs to update: ${report.summary.catalogIngredientRefsToUpdate}`);
  console.log(`Ingredients to create: ${report.summary.ingredientsToCreate}`);
  console.log(`Dish categories to assign: ${report.summary.dishCategoriesToAssign}`);
  console.log(`Manual review count: ${report.summary.manualReviewCount}`);
  console.log(`Skipped unsafe items: ${report.summary.skippedUnsafeItems}`);
  if (APPLY) {
    console.log(`Created ingredients: ${applyStats.createdIngredients}`);
    console.log(`Updated dish ingredient refs: ${applyStats.updatedDishIngredientRefs}`);
    console.log(`Updated dish categories: ${applyStats.updatedDishCategories}`);
    console.log(`Updated catalog refs: ${applyStats.updatedCatalogRefs}`);
    console.log(`Skipped unsafe: ${applyStats.skippedUnsafe}`);
    console.log(`Backup: ${backupPath}`);
  }
  console.log(`Report JSON: ${paths.jsonPath}`);
  console.log(`Report Markdown: ${paths.mdPath}`);
  console.log(`Manual review: ${paths.manualPath}`);

  await mongoose.disconnect();
}

main().catch(async (error) => {
  console.error("Normalization failed:", error);
  await mongoose.disconnect();
  process.exit(1);
});
