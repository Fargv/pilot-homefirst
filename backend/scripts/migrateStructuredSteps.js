/**
 * scripts/migrateStructuredSteps.js
 *
 * Converts catalog-pack recipe steps from Tiptap JSON (legacy elaboration)
 * to structured cooking steps for Guided Cooking Mode.
 *
 * Usage:
 *   node backend/scripts/migrateStructuredSteps.js --dry-run   # Preview only
 *   node backend/scripts/migrateStructuredSteps.js             # Apply changes
 *   node backend/scripts/migrateStructuredSteps.js --force     # Overwrite already-structured steps
 *
 * What it does:
 *   1. Reads every .json in catalog-packs/
 *   2. For each dish recipe that has a Tiptap doc as `steps`:
 *      - Extracts ordered list items as individual step texts
 *      - Generates a short title per step (first imperative verb phrase)
 *      - Detects timer mentions and adds hasTimer / durationSeconds / timerLabel
 *      - Stores structured steps array in `steps`
 *      - Moves original Tiptap doc to `elaboration` (backward compat)
 *   3. Skips dishes that already have structured `steps` (array) unless --force
 *   4. Saves updated JSON files in place
 *   5. Updates MongoDB (all packs including published — dishes field only)
 *
 * Idempotent: safe to run multiple times.
 */

import mongoose from "mongoose";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { resolveMongoUrl } from "./mongo-url.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const DRY_RUN = process.argv.includes("--dry-run");
const FORCE   = process.argv.includes("--force");

if (DRY_RUN) console.log("🔍 MODO DRY-RUN — no se escribirá nada\n");

// ─── Timer detection (mirrors frontend recipeStepParser.js) ──────────────────

const TIMER_DEFS = [
  { re: /(\d+)\s*hora?s?\s+(?:y\s+)?(\d+)\s*min(?:utos?)?/gi, toSec: (m) => +m[1] * 3600 + +m[2] * 60 },
  { re: /(\d+[-–]\d+)\s*min(?:utos?)?/gi,                      toSec: (m) => Math.round(m[1].split(/[-–]/).reduce((a, b) => (+a + +b) / 2, 0) * 60) },
  { re: /(\d+)\s*min(?:utos?)?/gi,                              toSec: (m) => +m[1] * 60 },
  { re: /(\d+)\s*seg(?:undos?)?/gi,                             toSec: (m) => +m[1] },
  { re: /(\d+)\s*hora?s?/gi,                                    toSec: (m) => +m[1] * 3600 },
];

function detectFirstTimer(text) {
  const results = [];
  for (const { re, toSec } of TIMER_DEFS) {
    re.lastIndex = 0;
    let m;
    while ((m = re.exec(text)) !== null) {
      const sec = toSec(m);
      if (sec >= 10 && sec <= 8 * 3600) {
        results.push({ sec, label: m[0].trim(), offset: m.index });
      }
    }
  }
  if (!results.length) return null;
  results.sort((a, b) => a.offset - b.offset);
  return results[0];
}

// ─── Tiptap text extraction ───────────────────────────────────────────────────

function extractText(node) {
  if (!node) return "";
  if (node.type === "text") return node.text || "";
  if (node.type === "hardBreak") return " ";
  if (Array.isArray(node.content)) return node.content.map(extractText).join("");
  return "";
}

// Steps that have a cooking wait are good timer candidates.
// Chopping/mixing/serving/plating → no timer.
const NO_TIMER_VERBS = /^(Corta|Pica|Pela|Ralla|Lamina|Trocea|Reserva|Emplata|Sirve|Decora|Salpimienta|Sazona|Mezcla rápidamente|Remueve|Retira del fuego|Cuela|Escurre bien)/i;
const TIMER_CONTEXT  = /(?:calienta|cuece|hierve|hornea|asa|marina|sofríe|pocha|reduce|enfría|reposa|descansa|blanquea|cocina|deja|mantén|gratina|fríe|saltea|sella|cocción|ferment)/i;

function shouldAddTimer(text, detectedTimer) {
  if (!detectedTimer) return false;
  if (NO_TIMER_VERBS.test(text.trim())) return false;
  // Only add timer if there's a cooking context verb or the time is ≥ 2 min
  return detectedTimer.sec >= 120 || TIMER_CONTEXT.test(text);
}

// ─── Title generation ─────────────────────────────────────────────────────────

const IMPERATIVE_OPENERS = [
  "Sofríe","Añade","Corta","Calienta","Mezcla","Vierte","Hornea","Cuece",
  "Pon","Retira","Tritura","Sirve","Prepara","Deja","Incorpora","Sella",
  "Emplata","Decora","Tuesta","Bate","Pela","Pica","Escurre","Marina",
  "Cuela","Deshuesa","Ralla","Fríe","Saltea","Pocha","Hierve","Asa",
  "Gratina","Espolvorea","Cubre","Condimenta","Sazona","Salpiment","Dora",
  "Cuela","Remueve","Reduce","Enfría","Blanquea","Lamina","Forma",
  "Enrolla","Rellena","Sella","Reserva","Parte","Dispón","Extiende",
];

function generateTitle(text) {
  const clean = text.trim().replace(/^[-•*\d.)\s]+/, "");

  // Try to find a key imperative verb phrase at the start
  for (const verb of IMPERATIVE_OPENERS) {
    if (new RegExp(`^${verb}\\b`, "i").test(clean)) {
      // Take verb + up to 3 more words
      const words = clean.split(/\s+/).slice(0, 4);
      let title = words.join(" ");
      if (title.length > 42) title = title.slice(0, 39) + "…";
      return title.replace(/[.,;]$/, "");
    }
  }

  // Fallback: first 4-5 words
  const words = clean.split(/\s+/);
  let title = "";
  for (const w of words) {
    if ((title + " " + w).trim().length > 38) break;
    title = (title + " " + w).trim();
  }
  return title.replace(/[.,;]$/, "") || clean.slice(0, 40);
}

// ─── Tiptap → structured steps ────────────────────────────────────────────────

function parseTiptapSteps(doc) {
  if (!doc || doc.type !== "doc" || !Array.isArray(doc.content)) return null;

  // Strategy 1: top-level ordered or bullet list
  for (const node of doc.content) {
    if (node.type === "orderedList" || node.type === "bulletList") {
      const items = (node.content || []).filter((n) => n.type === "listItem");
      if (items.length > 0) {
        return items.map((item) => extractText(item).trim()).filter(Boolean);
      }
    }
  }

  // Strategy 2: numbered paragraphs
  const NUMBERED = /^\d+[.)]\s+/;
  const paragraphs = doc.content.filter((n) => n.type === "paragraph");
  const numberedParas = paragraphs.filter((n) => NUMBERED.test(extractText(n)));
  if (numberedParas.length >= 2) {
    return numberedParas
      .map((n) => extractText(n).replace(NUMBERED, "").trim())
      .filter(Boolean);
  }

  // Strategy 3: all non-empty top-level paragraphs (skip headings)
  const texts = doc.content
    .filter((n) => n.type === "paragraph" || n.type === "listItem")
    .map((n) => extractText(n).trim())
    .filter(Boolean);
  return texts.length > 0 ? texts : null;
}

function buildStructuredStep(order, text) {
  const timer = detectFirstTimer(text);
  const useTimer = shouldAddTimer(text, timer);

  const step = {
    order,
    title: generateTitle(text),
    text,
    hasTimer: useTimer,
    durationMinutes: useTimer ? Math.round(timer.sec / 60) || null : null,
    durationSeconds: useTimer ? timer.sec : null,
    timerLabel: useTimer ? timer.label : null,
  };

  return step;
}

// ─── Recipe converter ─────────────────────────────────────────────────────────

function convertRecipe(recipe, force) {
  if (!recipe) return { recipe, changed: false };

  const currentSteps = recipe.steps;
  const alreadyStructured = Array.isArray(currentSteps);

  if (alreadyStructured && !force) {
    return { recipe, changed: false, reason: "ya estructurado" };
  }

  // Only convert if we have a Tiptap doc
  const hasTiptap =
    currentSteps &&
    typeof currentSteps === "object" &&
    !Array.isArray(currentSteps) &&
    currentSteps.type === "doc";

  if (!hasTiptap && !alreadyStructured) {
    return { recipe, changed: false, reason: "sin pasos Tiptap" };
  }

  const tiptapDoc = alreadyStructured ? recipe.elaboration : currentSteps;
  if (!tiptapDoc) return { recipe, changed: false, reason: "sin doc Tiptap" };

  const rawTexts = parseTiptapSteps(tiptapDoc);
  if (!rawTexts || rawTexts.length === 0) {
    return { recipe, changed: false, reason: "sin pasos extraíbles" };
  }

  const structuredSteps = rawTexts.map((text, i) =>
    buildStructuredStep(i + 1, text)
  );

  const updated = {
    ...recipe,
    steps: structuredSteps,
    elaboration: tiptapDoc, // keep Tiptap for backward compat
    baseServings: recipe.baseServings ?? recipe.servings ?? 4,
  };
  delete updated.servings; // normalise field name

  return { recipe: updated, changed: true, stepCount: structuredSteps.length };
}

// ─── Dish converter ───────────────────────────────────────────────────────────

function convertDish(dish, force) {
  if (!dish?.recipe) return { dish, changed: false };
  const { recipe: updatedRecipe, changed, ...meta } = convertRecipe(dish.recipe, force);
  if (!changed) return { dish, changed: false, ...meta };
  return { dish: { ...dish, recipe: updatedRecipe }, changed: true, ...meta };
}

// ─── Pack converter ───────────────────────────────────────────────────────────

function convertPack(data, force) {
  if (!Array.isArray(data.dishes)) return { data, dishesChanged: 0 };
  let dishesChanged = 0;
  const dishes = data.dishes.map((dish) => {
    const { dish: updatedDish, changed } = convertDish(dish, force);
    if (changed) dishesChanged++;
    return updatedDish;
  });
  return { data: { ...data, dishes }, dishesChanged };
}

// ─── MongoDB (minimal) ────────────────────────────────────────────────────────

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
  const files = fs.readdirSync(packsDir).filter((f) => f.endsWith(".json"));

  let totalDishesConverted = 0;
  let packsChanged = 0;
  let packErrors = 0;

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

    const { data: converted, dishesChanged } = convertPack(data, FORCE);

    if (dishesChanged === 0) {
      console.log(`  – ${file}: sin cambios (${data.dishes?.length ?? 0} platos)`);
      continue;
    }

    console.log(`  ✓ ${file}: ${dishesChanged} platos convertidos`);

    // Show example step from first converted dish in dry-run
    if (DRY_RUN) {
      const example = converted.dishes.find((d) => Array.isArray(d.recipe?.steps));
      if (example) {
        const step = example.recipe.steps[0];
        console.log(`    Ejemplo — "${example.name}", paso 1:`);
        console.log(`      title: "${step.title}"`);
        console.log(`      text:  "${step.text.slice(0, 70)}${step.text.length > 70 ? "…" : ""}"`);
        console.log(`      hasTimer: ${step.hasTimer}${step.hasTimer ? ` (${step.durationSeconds}s — "${step.timerLabel}")` : ""}`);
      }
    }

    if (!DRY_RUN) {
      // Write JSON
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

    totalDishesConverted += dishesChanged;
    packsChanged++;
    console.log("");
  }

  const mode = DRY_RUN ? "DRY-RUN" : "REAL";
  console.log(`─────────────────────────────────────────`);
  console.log(`Modo                     : ${mode}`);
  console.log(`Packs con cambios        : ${packsChanged}`);
  console.log(`Platos convertidos       : ${totalDishesConverted}`);
  if (packErrors) console.log(`Errores                  : ${packErrors}`);
  console.log(`─────────────────────────────────────────`);

  if (DRY_RUN) {
    console.log("\nEjecuta sin --dry-run para aplicar los cambios.");
  }

  if (!DRY_RUN) await mongoose.disconnect();
}

run().catch((e) => {
  console.error("Error fatal:", e.message);
  process.exit(1);
});
