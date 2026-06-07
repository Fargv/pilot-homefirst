/**
 * scripts/migrateIngredientRefs.js
 *
 * Adds ingredientRefs to each structured cooking step in all catalog packs.
 *
 * ingredientRefs answers: "which ingredients from the general list are being
 * physically introduced or first handled in this exact step?"
 *
 * Detection logic (per step, per ingredient):
 *   1. Does the ingredient name (or its primary keyword) appear in the step text?
 *   2. Is it NOT in an exclusion context (retira, saca, quita…)?
 *   3. First mention anywhere → always include.
 *      Already mentioned → only include if there's a clear intro verb (añade,
 *      incorpora, vierte…) immediately before the ingredient in the sentence.
 *   4. Prepositional references ("a la cebolla asada", "con el tomate ya pochado")
 *      for ingredients already introduced → excluded.
 *
 * Usage:
 *   node backend/scripts/migrateIngredientRefs.js --dry-run   # Preview only
 *   node backend/scripts/migrateIngredientRefs.js             # Apply
 *   node backend/scripts/migrateIngredientRefs.js --force     # Overwrite existing refs
 *   node backend/scripts/migrateIngredientRefs.js --verbose   # Show all steps in dry-run
 */

import mongoose from "mongoose";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { resolveMongoUrl } from "./mongo-url.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname  = path.dirname(__filename);

const DRY_RUN = process.argv.includes("--dry-run");
const FORCE   = process.argv.includes("--force");
const VERBOSE = process.argv.includes("--verbose");

if (DRY_RUN) console.log("🔍 MODO DRY-RUN — no se escribirá nada\n");

// ─── Text normalization ───────────────────────────────────────────────────────

/** Remove accents and lowercase — all matching is done on normalized strings. */
function norm(s) {
  return String(s || "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .trim();
}

const STOPWORDS = new Set([
  "de","la","el","los","las","en","y","con","por","para","a","al",
  "un","una","e","o","del","le","les","se","su","sus","lo","ni","que",
  "muy","tan","mas","sin","hay","unas","unos","este","esta","estos",
]);

/** Significant words from ingredient name (length ≥ 4, not stopword), longest first. */
function getKeywords(ingName) {
  return norm(ingName)
    .split(/\s+/)
    .filter(w => w.length >= 4 && !STOPWORDS.has(w))
    .sort((a, b) => b.length - a.length);
}

// ─── Ingredient → step text matching ─────────────────────────────────────────

/**
 * Try to match `ingName` inside normalized step text `normText`.
 * Returns { found, index, matchType } where matchType is "full" | "keyword".
 *
 * "full"    — the normalized ingredient name appears as a substring.
 * "keyword" — the most distinctive keyword of the ingredient name appears
 *             as a whole word (singular and plural tolerated).
 */
function findIngredient(ingName, normText) {
  const normName = norm(ingName);

  // 1. Full-name substring (most reliable)
  const fullIdx = normText.indexOf(normName);
  if (fullIdx >= 0) return { found: true, index: fullIdx, matchType: "full" };

  // 2. Keyword word-boundary match (handles "Aceite de oliva" → "aceite")
  const kws = getKeywords(ingName);
  for (const kw of kws) {
    const idx = findKeywordInText(kw, normText);
    if (idx >= 0) return { found: true, index: idx, matchType: "keyword", keyword: kw };
  }

  return { found: false };
}

/**
 * Find keyword as a whole word in normText, tolerating singular/plural.
 * Returns character index of match or -1.
 */
function findKeywordInText(kw, normText) {
  // Escape the keyword for regex
  const esc = kw.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

  // Try exact match first
  let m = new RegExp(`\\b${esc}\\b`).exec(normText);
  if (m) return m.index;

  // Try stripping trailing 's' or 'as' (plural → singular)
  if (kw.endsWith("as") && kw.length > 5) {
    m = new RegExp(`\\b${esc.slice(0, -2)}\\b`).exec(normText);
    if (m) return m.index;
  } else if (kw.endsWith("es") && kw.length > 4) {
    m = new RegExp(`\\b${esc.slice(0, -2)}\\b`).exec(normText);
    if (m) return m.index;
  } else if (kw.endsWith("s") && kw.length > 4) {
    m = new RegExp(`\\b${esc.slice(0, -1)}\\b`).exec(normText);
    if (m) return m.index;
  }

  // Try adding 's' (singular → plural)
  m = new RegExp(`\\b${esc}s\\b`).exec(normText);
  if (m) return m.index;

  return -1;
}

// ─── Context analysis ─────────────────────────────────────────────────────────

/**
 * Verbs that indicate an ingredient is being REMOVED or taken away.
 * "retira la cebolla" → cebolla is not being introduced.
 */
const EXCL_VERB_RE = /\b(retira|saca|quita|elimina|descarta|aparta)\b/;

/**
 * Prepositional phrases that indicate the ingredient is ALREADY PRESENT
 * in the scene: "a la cebolla asada", "con el tomate pochado", etc.
 * Only significant if the ingredient was already introduced in a previous step.
 */
const EXCL_PREP_RE = /\b(a la |al |a los |a las |con la |con el |con los |con las |de la |del |de los |de las |sobre la |sobre el |junto a |junto al )\s*$/;

/**
 * Verbs that clearly signal a NEW ingredient is being added to the dish.
 * Used to decide whether an already-introduced ingredient appears again
 * because it's being added a second time (yes → include) or just referenced
 * as context (no → exclude).
 */
const INTRO_VERB_RE = /\b(añade|incorpora|agrega|pon |coloca|vierte|sofríe|saltea|fríe|cuece|hornea|marina|mezcla|bate|tritura|calienta|tuesta|dora|blanquea|rehoga|pocha|espolvorea|sazona|aliña|ralla|pica|corta|pela|lamina|trocea|parte|dispón|rellena|extiende|sella|cubre|añadir|incorporar|verter)\b/;

/** Extract the text of the current sentence before `matchIndex` in normText. */
function textBeforeMatch(normText, matchIndex) {
  // Look backwards for a sentence-ending character
  let start = 0;
  for (let i = matchIndex - 1; i >= 0; i--) {
    if (normText[i] === "." || normText[i] === ";" || normText[i] === "\n") {
      start = i + 1;
      break;
    }
  }
  return normText.slice(start, matchIndex).trimStart();
}

/**
 * Decide whether to include this ingredient in the step's ingredientRefs.
 *
 * @param {string}  normText     — normalized step text
 * @param {number}  matchIndex   — char position of the ingredient match
 * @param {boolean} alreadyUsed — was this ingredient introduced in an earlier step?
 * @returns {boolean}
 */
function shouldInclude(normText, matchIndex, alreadyUsed) {
  const before = textBeforeMatch(normText, matchIndex);

  // Rule 1: Exclusion verb before the ingredient → never include
  if (EXCL_VERB_RE.test(before)) return false;

  // Rule 2: Prepositional "already there" context + previously used → skip
  // "añade aceite a la cebolla asada" — "cebolla" follows "a la", already used → skip
  if (alreadyUsed && EXCL_PREP_RE.test(before)) return false;

  // Rule 3: Already used elsewhere — only include if there's a clear intro verb
  // "añade más caldo" → include caldo again (re-addition)
  if (alreadyUsed) return INTRO_VERB_RE.test(before);

  // Rule 4: First mention anywhere → include (this is where we first handle it)
  return true;
}

// ─── Ingredient refs computation ──────────────────────────────────────────────

/**
 * Given a recipe with `ingredients[]` (general list) and `steps[]` (structured),
 * compute and inject `ingredientRefs` into each step.
 *
 * Returns { updated: bool, steps?, refsAdded?, reason? }
 */
function computeRefs(recipe, force) {
  const ingredients = recipe.ingredients || [];
  const steps = recipe.steps;

  if (!Array.isArray(steps) || steps.length === 0) {
    return { updated: false, reason: "sin pasos estructurados" };
  }
  if (ingredients.length === 0) {
    return { updated: false, reason: "sin ingredientes en la receta" };
  }

  // Already done? Skip unless --force
  const anyHasRefs = steps.some(s => Array.isArray(s.ingredientRefs));
  if (anyHasRefs && !force) {
    return { updated: false, reason: "ya tiene ingredientRefs (usa --force para sobrescribir)" };
  }

  // Set of normalized ingredient names already introduced in a previous step
  const usedSet = new Set();
  let refsAdded = 0;

  const updatedSteps = steps.map((step) => {
    // Keep existing refs if present and not forcing (update usedSet from them)
    if (Array.isArray(step.ingredientRefs) && !force) {
      step.ingredientRefs.forEach(r => usedSet.add(norm(r.name)));
      return step;
    }

    const normText = norm(step.text || "");
    const refs = [];

    for (const ing of ingredients) {
      const match = findIngredient(ing.name, normText);
      if (!match.found) continue;

      const alreadyUsed = usedSet.has(norm(ing.name));

      if (!shouldInclude(normText, match.index, alreadyUsed)) continue;

      refs.push({ name: ing.name });
      usedSet.add(norm(ing.name));
    }

    refsAdded += refs.length;
    return { ...step, ingredientRefs: refs };
  });

  return { updated: true, steps: updatedSteps, refsAdded };
}

// ─── Dish / Pack helpers ──────────────────────────────────────────────────────

function processDish(dish, force) {
  if (!dish?.recipe) return { dish, changed: false, reason: "sin receta" };
  const result = computeRefs(dish.recipe, force);
  if (!result.updated) return { dish, changed: false, reason: result.reason };
  return {
    dish: { ...dish, recipe: { ...dish.recipe, steps: result.steps } },
    changed: true,
    refsAdded: result.refsAdded,
  };
}

function processPack(data, force) {
  if (!Array.isArray(data.dishes)) return { data, dishesChanged: 0, refsAdded: 0 };
  let dishesChanged = 0, refsAdded = 0;
  const dishes = data.dishes.map((dish) => {
    const { dish: updated, changed, refsAdded: r } = processDish(dish, force);
    if (changed) { dishesChanged++; refsAdded += r || 0; }
    return updated;
  });
  return { data: { ...data, dishes }, dishesChanged, refsAdded };
}

// ─── Logging helpers ──────────────────────────────────────────────────────────

function logDishExample(dish) {
  if (!Array.isArray(dish.recipe?.steps)) return;
  console.log(`      "${dish.name}":`);
  for (const step of dish.recipe.steps.slice(0, 4)) {
    const refs = (step.ingredientRefs || []).map(r => r.name).join(", ");
    const title = (step.title || `Paso ${step.order}`).slice(0, 40);
    console.log(`        [${step.order}] ${title}`);
    console.log(`             refs: ${refs || "(ninguno)"}`);
  }
}

// ─── MongoDB ──────────────────────────────────────────────────────────────────

const CatalogPackSchema = new mongoose.Schema(
  { slug: String, dishes: mongoose.Schema.Types.Mixed },
  { strict: false, timestamps: true }
);
const CatalogPack =
  mongoose.models.CatalogPack ||
  mongoose.model("CatalogPack", CatalogPackSchema, "catalogpacks");

// ─── Main ─────────────────────────────────────────────────────────────────────

async function run() {
  if (!DRY_RUN) {
    const mongoUrl = resolveMongoUrl();
    await mongoose.connect(mongoUrl);
    console.log("Conexión MongoDB establecida\n");
  }

  const packsDir = path.resolve(__dirname, "../catalog-packs");
  const files = fs.readdirSync(packsDir).filter(f => f.endsWith(".json"));

  let totalDishes = 0, totalRefs = 0, packsChanged = 0, packErrors = 0;

  for (const file of files) {
    const filePath = path.join(packsDir, file);
    let data;
    try {
      data = JSON.parse(fs.readFileSync(filePath, "utf-8"));
    } catch (e) {
      console.error(`  ✗ Error leyendo ${file}: ${e.message}`);
      packErrors++;
      continue;
    }

    if (!Array.isArray(data.dishes) || data.dishes.length === 0) {
      console.log(`  – ${file}: sin platos, omitido`);
      continue;
    }

    const { data: converted, dishesChanged, refsAdded } = processPack(data, FORCE);

    if (dishesChanged === 0) {
      console.log(`  – ${file}: sin cambios (${data.dishes.length} platos)`);
      continue;
    }

    console.log(`  ✓ ${file}`);
    console.log(`    ${dishesChanged} platos actualizados · ${refsAdded} ingredientRefs añadidas`);

    // Show examples of the assignment in dry-run or verbose mode
    if (DRY_RUN || VERBOSE) {
      const examples = converted.dishes
        .filter(d => Array.isArray(d.recipe?.steps) && d.recipe.steps.some(s => (s.ingredientRefs || []).length > 0))
        .slice(0, 2);
      for (const ex of examples) logDishExample(ex);
    }

    if (!DRY_RUN) {
      // Write JSON in place
      fs.writeFileSync(filePath, JSON.stringify(converted, null, 2) + "\n", "utf-8");

      // Update MongoDB
      if (data.slug) {
        try {
          const result = await CatalogPack.updateOne(
            { slug: data.slug },
            { $set: { dishes: converted.dishes } }
          );
          if (result.matchedCount === 0) {
            console.log(`    ℹ DB: pack "${data.slug}" no encontrado (aún no seeded).`);
          } else {
            console.log(`    ✓ DB actualizada: ${data.slug}`);
          }
        } catch (dbErr) {
          console.error(`    ✗ Error DB para ${data.slug}: ${dbErr.message}`);
          packErrors++;
        }
      }
    }

    totalDishes += dishesChanged;
    totalRefs   += refsAdded;
    packsChanged++;
    console.log("");
  }

  // ── Summary ──────────────────────────────────────────────────────────────────
  console.log("─────────────────────────────────────────");
  console.log(`Modo                     : ${DRY_RUN ? "DRY-RUN (sin cambios)" : "REAL"}`);
  console.log(`Packs actualizados       : ${packsChanged} / ${files.length}`);
  console.log(`Platos procesados        : ${totalDishes}`);
  console.log(`ingredientRefs añadidas  : ${totalRefs}`);
  if (packErrors) console.log(`Errores                  : ${packErrors}`);
  if (DRY_RUN) console.log("\nEjecuta sin --dry-run para aplicar los cambios.");

  if (!DRY_RUN) await mongoose.disconnect();
}

run().catch((e) => {
  console.error("Error fatal:", e.message);
  process.exit(1);
});
