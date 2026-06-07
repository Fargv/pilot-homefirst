/**
 * scripts/migrateRecipeQuantities.js
 *
 * Migrates all catalog-packs JSON files to the structured recipe quantity format
 * and updates MongoDB for ALL packs (including published ones) on the dishes field only.
 *
 * Usage:
 *   node backend/scripts/migrateRecipeQuantities.js
 *
 * What it does:
 *   1. Reads every .json file in catalog-packs/
 *   2. Converts recipe.ingredients[].quantity  (string → structured object)
 *   3. Renames recipe.servings → recipe.baseServings
 *   4. Saves updated JSON files in place
 *   5. Pushes the updated dishes array to MongoDB for each pack (by slug),
 *      regardless of published/draft status — only the `dishes` field is touched.
 *
 * Idempotent: running it twice is safe.
 */

import mongoose from "mongoose";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { resolveMongoUrl } from "./mongo-url.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ─── Unit normalisation table ─────────────────────────────────────────────────

const UNIT_NORM = {
  // weight
  g: "g", gr: "g", gramo: "g", gramos: "g",
  kg: "kg", kilo: "kg", kilos: "kg", kilogramo: "kg", kilogramos: "kg",
  // volume
  ml: "ml", mililitro: "ml", mililitros: "ml",
  cl: "ml",   // keep cl separate if desired — converting to ml (1 cl = 10 ml) would need math, skip: store as-is
  l: "l", litro: "l", litros: "l",
  // countable
  ud: "unidad", uds: "unidad",
  unidad: "unidad", unidades: "unidad",
  pieza: "unidad", piezas: "unidad",
  // contextual countable (display stays original plural)
  rebanada: "unidad", rebanadas: "unidad",
  loncha: "unidad", lonchas: "unidad",
  diente: "unidad", dientes: "unidad",
  rama: "unidad", ramas: "unidad",
  hoja: "unidad", hojas: "unidad",
  rodaja: "unidad", rodajas: "unidad",
  tallo: "unidad", tallos: "unidad",
  filete: "unidad", filetes: "unidad",
  muslo: "unidad", muslos: "unidad",
  pechuga: "unidad", pechugas: "unidad",
  lata: "unidad", latas: "unidad",
  bote: "unidad", botes: "unidad",
  sobre: "unidad", sobres: "unidad",
  // spoons / cups / glasses
  cda: "cucharada", cdas: "cucharada",
  cucharada: "cucharada", cucharadas: "cucharada",
  cdita: "cucharadita", cditas: "cucharadita",
  cucharadita: "cucharadita", cucharaditas: "cucharadita",
  taza: "taza", tazas: "taza",
  vaso: "vaso", vasos: "vaso",
  copa: "vaso", copas: "vaso",
  // pinch
  pizca: "pizca", pizcas: "pizca",
  // imperial
  oz: "oz", onza: "oz", onzas: "oz",
  lb: "lb", libra: "lb", libras: "lb",
};

// When storing as the canonical unit the display label might differ from the
// raw word in the recipe text — keep the original word for displayUnit.
// Only needed when rawUnit !== normalised (i.e. the plural / special word).
const DISPLAY_UNIT_OVERRIDE = {
  uds: "unidades",
  rebanadas: "rebanadas", rebanada: "rebanadas",
  lonchas: "lonchas",    loncha: "lonchas",
  dientes: "dientes",   diente: "dientes",
  ramas: "ramas",       rama: "ramas",
  hojas: "hojas",       hoja: "hojas",
  rodajas: "rodajas",   rodaja: "rodajas",
  tallos: "tallos",     tallo: "tallos",
  filetes: "filetes",   filete: "filetes",
  muslos: "muslos",     muslo: "muslos",
  pechugas: "pechugas", pechuga: "pechugas",
  latas: "latas",       lata: "latas",
  botes: "botes",       bote: "botes",
  sobres: "sobres",     sobre: "sobres",
  cucharadas: "cucharadas",
  cucharaditas: "cucharaditas",
  tazas: "tazas",
  vasos: "vasos",
  copas: "copas",
};

// Units that are never scalable regardless of having a numeric amount
const NON_SCALABLE_UNITS = new Set(["pizca", "al gusto", "abundante", "suficiente"]);

// ─── Unicode / text fraction helpers ─────────────────────────────────────────

const UNICODE_FRACTIONS = {
  "½": 0.5, "⅓": 1 / 3, "⅔": 2 / 3,
  "¼": 0.25, "¾": 0.75,
  "⅛": 0.125, "⅜": 0.375, "⅝": 0.625, "⅞": 0.875,
};

function parseFraction(str) {
  // Replace unicode fraction chars
  let s = str;
  for (const [char, val] of Object.entries(UNICODE_FRACTIONS)) {
    s = s.replace(char, val);
  }
  // "1/2"
  s = s.replace(/(\d+)\/(\d+)/, (_, a, b) => String(Number(a) / Number(b)));
  // "1 ½"  → "1 0.5" → 1.5
  s = s.replace(/(\d+)\s+([\d.]+)/, (_, a, b) => String(Number(a) + Number(b)));
  const n = parseFloat(s.replace(",", "."));
  return isNaN(n) ? null : n;
}

// ─── Core parser ─────────────────────────────────────────────────────────────

/**
 * Convert a free-text quantity string to a structured quantity object.
 * Already-structured objects pass through unchanged.
 */
function parseQuantityString(raw) {
  // Already structured
  if (raw && typeof raw === "object") return raw;

  if (!raw || typeof raw !== "string") {
    return { amount: null, unit: "al gusto", scalable: false, originalText: String(raw ?? "") };
  }

  const s = raw.trim();
  const sl = s.toLowerCase();

  // ── "al gusto" ────────────────────────────────────────────────────────────
  if (sl.includes("al gusto")) {
    const note = sl
      .replace(/al gusto/i, "")
      .replace(/[,;]\s*$/, "")
      .trim();
    return {
      amount: null,
      unit: "al gusto",
      ...(note ? { note } : {}),
      scalable: false,
      originalText: s,
    };
  }

  // ── "abundante …" ─────────────────────────────────────────────────────────
  if (sl.startsWith("abundante")) {
    const note = s.slice("abundante".length).trim().replace(/^[,;]\s*/, "") || undefined;
    return { amount: null, unit: "abundante", ...(note ? { note } : {}), scalable: false, originalText: s };
  }

  // ── "para …" (para freír, para hornear, para rebozar) ────────────────────
  if (sl.startsWith("para ")) {
    return { amount: null, unit: "suficiente", note: s, scalable: false, originalText: s };
  }

  // ── "según el paquete" / "según paquete" ─────────────────────────────────
  if (sl.startsWith("según")) {
    return { amount: null, unit: "según el paquete", scalable: false, originalText: s };
  }

  // ── "una pizca …" / "un chorrito …" ──────────────────────────────────────
  const pizca = sl.match(/^una?\s+(pizca|chorrito)(.*)/i);
  if (pizca) {
    const note = pizca[2].trim().replace(/^de\s+/, "") || undefined;
    return { amount: 1, unit: "pizca", ...(note ? { note } : {}), scalable: false, originalText: s };
  }

  // ── Numeric prefix + unit + optional note ────────────────────────────────
  // Handles: "400 g", "2 ud", "½ unidad", "1/2 unidad", "3 cucharadas de aceite"
  const numPart = /^([\d.,½⅓⅔¼¾⅛⅜⅝⅞\/\s]+?)\s+([a-záéíóúüñA-ZÁÉÍÓÚÜÑ]+\.?)(.*)?$/;
  const m = s.match(numPart);
  if (m) {
    const amount = parseFraction(m[1].trim());
    const rawUnit = m[2].toLowerCase().replace(/\.$/, "");
    const rest = (m[3] || "").trim().replace(/^de\s+/, "") || undefined;

    if (amount !== null) {
      const unit = UNIT_NORM[rawUnit] || rawUnit;
      const displayUnit = DISPLAY_UNIT_OVERRIDE[rawUnit] || undefined;
      const scalable = !NON_SCALABLE_UNITS.has(unit);

      return {
        amount,
        unit,
        ...(displayUnit ? { displayUnit } : {}),
        ...(rest ? { note: rest } : {}),
        scalable,
        originalText: s,
      };
    }
  }

  // ── Fallback: can't parse ─────────────────────────────────────────────────
  return { amount: null, unit: s, scalable: false, originalText: s };
}

// ─── Converters ──────────────────────────────────────────────────────────────

function convertRecipeIngredient(ing) {
  if (!ing || typeof ing !== "object") return ing;
  const q = ing.quantity;
  // Skip already-structured quantities
  if (q && typeof q === "object" && "scalable" in q) return ing;
  return { ...ing, quantity: parseQuantityString(q) };
}

function convertRecipe(recipe) {
  if (!recipe || typeof recipe !== "object") return recipe;
  const baseServings = recipe.baseServings ?? recipe.servings ?? 4;
  const ingredients = Array.isArray(recipe.ingredients)
    ? recipe.ingredients.map(convertRecipeIngredient)
    : recipe.ingredients;
  const { servings: _dropped, ...rest } = recipe; // drop legacy 'servings'
  return { ...rest, baseServings, ingredients };
}

function convertDish(dish) {
  if (!dish || typeof dish !== "object") return dish;
  if (!dish.recipe) return dish;
  return { ...dish, recipe: convertRecipe(dish.recipe) };
}

function convertPack(data) {
  if (!Array.isArray(data.dishes)) return data;
  return { ...data, dishes: data.dishes.map(convertDish) };
}

// ─── MongoDB (minimal schema — only what we need) ────────────────────────────

const CatalogPackSchema = new mongoose.Schema(
  { slug: String, dishes: mongoose.Schema.Types.Mixed },
  { strict: false, timestamps: true }
);
const CatalogPack =
  mongoose.models.CatalogPack ||
  mongoose.model("CatalogPack", CatalogPackSchema, "catalogpacks");

// ─── Main ────────────────────────────────────────────────────────────────────

async function run() {
  const mongoUrl = resolveMongoUrl();
  await mongoose.connect(mongoUrl);
  console.log("Conexión MongoDB establecida\n");

  const packsDir = path.resolve(__dirname, "../catalog-packs");
  const files = fs.readdirSync(packsDir).filter((f) => f.endsWith(".json"));

  let jsonUpdated = 0;
  let dbUpdated = 0;
  let skipped = 0;
  let errors = 0;

  for (const file of files) {
    const filePath = path.join(packsDir, file);
    let data;

    try {
      data = JSON.parse(fs.readFileSync(filePath, "utf-8"));
    } catch (e) {
      console.error(`  ✗ Error leyendo ${file}: ${e.message}`);
      errors++;
      continue;
    }

    const converted = convertPack(data);

    // ── 1. Update JSON file ───────────────────────────────────────────────
    const originalJson = JSON.stringify(data, null, 2);
    const convertedJson = JSON.stringify(converted, null, 2);

    if (originalJson !== convertedJson) {
      fs.writeFileSync(filePath, convertedJson + "\n", "utf-8");
      console.log(`  ✓ JSON actualizado: ${file}`);
      jsonUpdated++;
    } else {
      console.log(`  – Sin cambios en JSON: ${file}`);
    }

    // ── 2. Update MongoDB (dishes only, regardless of status) ────────────
    if (!data.slug) {
      console.warn(`    ⚠ Sin slug en ${file}, omitiendo DB update.`);
      skipped++;
      continue;
    }

    try {
      const result = await CatalogPack.updateOne(
        { slug: data.slug },
        { $set: { dishes: converted.dishes } }
      );

      if (result.matchedCount === 0) {
        console.log(`    ℹ Pack "${data.slug}" no encontrado en DB (aún no seeded).`);
        skipped++;
      } else {
        console.log(`    ✓ DB actualizada: ${data.slug}`);
        dbUpdated++;
      }
    } catch (dbErr) {
      console.error(`    ✗ Error DB para ${data.slug}: ${dbErr.message}`);
      errors++;
    }

    console.log("");
  }

  console.log("─────────────────────────────────────────");
  console.log(`JSON files actualizados : ${jsonUpdated}`);
  console.log(`Packs actualizados en DB: ${dbUpdated}`);
  if (skipped) console.log(`Omitidos (sin cambios/slug): ${skipped}`);
  if (errors)  console.log(`Errores                    : ${errors}`);
  console.log("─────────────────────────────────────────");

  await mongoose.disconnect();
}

run().catch((e) => {
  console.error("Error fatal:", e.message);
  process.exit(1);
});
