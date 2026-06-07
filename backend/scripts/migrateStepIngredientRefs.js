/**
 * migrateStepIngredientRefs.js
 *
 * Auto-populate stepIngredients on recipe steps that are missing them,
 * by matching step text against the dish's recipe ingredients.
 *
 * Usage:
 *   node scripts/migrateStepIngredientRefs.js --dry-run   (preview, no writes)
 *   node scripts/migrateStepIngredientRefs.js --apply     (apply safe changes)
 *   node scripts/migrateStepIngredientRefs.js --apply --force  (overwrite existing refs too)
 */

import path from "path";
import { fileURLToPath } from "url";
import dotenv from "dotenv";
import mongoose from "mongoose";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, "../.env") });

// ── Inline detectStepIngredients (no frontend import) ───────────────────────

const STOPWORDS = new Set([
  "de", "del", "la", "el", "los", "las", "un", "una", "unos", "unas",
  "y", "o", "e", "u", "con", "sin", "en", "a", "al", "por",
]);

function normalize(str) {
  return String(str || "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .trim();
}

function tokenize(str) {
  return normalize(str)
    .split(/[\s,]+/)
    .map((w) => w.replace(/[^a-z0-9]/g, ""))
    .filter((w) => w.length >= 3 && !STOPWORDS.has(w));
}

function reEscape(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function wordBoundaryMatch(stepNorm, token) {
  const re = new RegExp(`(?:^|[^a-z])${reEscape(token)}s?(?:[^a-z]|$)`);
  return re.test(stepNorm);
}

function detectStepIngredients(stepText, recipeIngredients) {
  if (!stepText || !Array.isArray(recipeIngredients) || recipeIngredients.length === 0) {
    return [];
  }
  const stepNorm = normalize(stepText);
  const results = [];

  for (const ing of recipeIngredients) {
    const ingName = String(ing.name || "").trim();
    if (!ingName) continue;
    const tokens = tokenize(ingName);
    if (tokens.length === 0) continue;

    let matched = false;
    if (tokens.length === 1) {
      matched = wordBoundaryMatch(stepNorm, tokens[0]);
    } else {
      const fullNorm = normalize(ingName).replace(/\s+/g, " ");
      if (stepNorm.includes(fullNorm)) {
        matched = true;
      } else {
        const significantTokens = tokens.filter((t) => t.length >= 4);
        if (significantTokens.length === 0) {
          matched = tokens.every((t) => wordBoundaryMatch(stepNorm, t));
        } else {
          const matchingCount = significantTokens.filter((t) => wordBoundaryMatch(stepNorm, t)).length;
          const required = significantTokens.length >= 2 ? Math.max(2, Math.ceil(significantTokens.length * 0.6)) : 1;
          matched = matchingCount >= required;
        }
      }
    }

    if (matched) {
      results.push({
        name: ingName,
        ingredientId: ing.ingredientId || null,
      });
    }
  }

  return results;
}

// ── Helper: extract text from step (supports structured and legacy) ──────────

function getStepText(step) {
  if (typeof step === "string") return step;
  if (step && typeof step === "object") return String(step.text || step.description || "");
  return "";
}

function getStepIngredients(step) {
  if (typeof step !== "object" || !step) return [];
  if (Array.isArray(step.stepIngredients)) return step.stepIngredients;
  if (Array.isArray(step.ingredients)) return step.ingredients;
  return [];
}

function isStructuredStepsArray(steps) {
  return Array.isArray(steps) && steps.length > 0 && typeof steps[0] === "object";
}

// ── Main ─────────────────────────────────────────────────────────────────────

const isDryRun = process.argv.includes("--dry-run");
const isApply  = process.argv.includes("--apply");
const isForce  = process.argv.includes("--force");

if (!isDryRun && !isApply) {
  console.log("Usage:");
  console.log("  node scripts/migrateStepIngredientRefs.js --dry-run");
  console.log("  node scripts/migrateStepIngredientRefs.js --apply [--force]");
  process.exit(0);
}

const mode = isDryRun ? "DRY-RUN" : isForce ? "APPLY (force)" : "APPLY";
console.log(`\n=== migrateStepIngredientRefs — ${mode} ===\n`);

async function run() {
  await mongoose.connect(process.env.MONGODB_URI, { serverSelectionTimeoutMS: 10000 });
  console.log("Connected to MongoDB\n");

  const KitchenDish = mongoose.model(
    "KitchenDish",
    new mongoose.Schema({ name: String, recipe: mongoose.Schema.Types.Mixed }, { strict: false }),
    "kitchendishes"
  );

  const dishes = await KitchenDish.find({
    "recipe.steps": { $exists: true, $ne: null },
    "recipe.ingredients": { $exists: true, $not: { $size: 0 } },
  }).lean();

  console.log(`Found ${dishes.length} dishes with recipe steps and ingredients.\n`);

  let totalDishes = 0, totalSteps = 0, totalDetected = 0, totalSkipped = 0, totalSaved = 0;

  for (const dish of dishes) {
    const steps = dish.recipe?.steps;
    const recipeIngredients = dish.recipe?.ingredients || [];

    if (!isStructuredStepsArray(steps)) continue;
    if (recipeIngredients.length === 0) continue;

    let dishChanged = false;
    const updatedSteps = steps.map((step) => {
      totalSteps++;

      const existingRefs = getStepIngredients(step);
      if (existingRefs.length > 0 && !isForce) {
        totalSkipped++;
        return step;
      }

      const text = getStepText(step);
      if (!text.trim()) {
        totalSkipped++;
        return step;
      }

      const detected = detectStepIngredients(text, recipeIngredients);
      if (detected.length === 0) {
        totalSkipped++;
        return step;
      }

      totalDetected++;
      dishChanged = true;

      const stepLabel = step.title || text.slice(0, 40);
      const names = detected.map((r) => r.name).join(", ");
      console.log(`  [DETECT] "${dish.name}" / paso ${step.order || "?"}: ${stepLabel}`);
      console.log(`           → ${names}\n`);

      return { ...step, stepIngredients: detected };
    });

    if (dishChanged) {
      totalDishes++;
      if (isApply) {
        await KitchenDish.updateOne(
          { _id: dish._id },
          { $set: { "recipe.steps": updatedSteps } }
        );
        totalSaved++;
      }
    }
  }

  console.log("─────────────────────────────────────────────");
  console.log(`Steps scanned:          ${totalSteps}`);
  console.log(`Steps with detections:  ${totalDetected}`);
  console.log(`Steps skipped:          ${totalSkipped}`);
  console.log(`Dishes modified:        ${totalDishes}`);
  if (isApply) console.log(`Dishes saved:           ${totalSaved}`);
  if (isDryRun) console.log("\nDry-run complete — no changes written.");
  console.log("");

  await mongoose.disconnect();
}

run().catch((err) => {
  console.error("Migration failed:", err);
  process.exit(1);
});
