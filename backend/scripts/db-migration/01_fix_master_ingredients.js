/**
 * 01_fix_master_ingredients.js
 * ----------------------------
 * 1. Merge 5 duplicate pairs (master scope) → update cascades in kitchenDishes
 * 2. Add missing canonicalName to 127 original master ingredients
 * 3. Fix quality issues: Queso Fetta → Feta, habaneros casing, Chiles canonicalName
 *
 * Usage:
 *   node --experimental-vm-modules 01_fix_master_ingredients.js          # dry-run
 *   node --experimental-vm-modules 01_fix_master_ingredients.js --apply  # commit
 */

import { MongoClient, ObjectId } from "mongodb";
import { resolveMongoUrl } from "../mongo-url.js";

const APPLY = process.argv.includes("--apply");
const NOW = new Date();

// ─── 1. MERGE MAP ─────────────────────────────────────────────────────────────
// { eliminateId: masterId }  — master = el que SE CONSERVA
const MERGE_MAP = {
  "6a0493713830c23fbc6031cd": "697389abf38758705669ee29", // Judías Verdes dup → original
  "6976317e8764694d965b99f9": "699b81f88deb38b04dd3018d", // Patatas congeladas dup → master
  "69986c2f6a13bb1a6e2f7955": "69979a897235b4707c913481", // Pan Brioche dup → master
  "69986c1e6a13bb1a6e2f7944": "69979aab7235b4707c913495", // Queso en Lonchas dup → master
  "697389abf38758705669edfa": "699b81f88deb38b04dd3017f", // Salchicha → Salchichas (singular→plural)
};

// ─── 2. CANONICAL NAMES PARA LOS 127 SIN VALOR ────────────────────────────────
// Formato: { _id_hex: canonicalName }
const CANONICAL_FIXES = {
  "697389abf38758705669edfb": "morcilla",
  "697389abf38758705669edfc": "huevo",
  "697389abf38758705669edfd": "atun",
  "697389abf38758705669edfe": "sardinas",
  "697389abf38758705669edff": "caballa",
  "697389abf38758705669ee00": "salmon",
  "697389abf38758705669ee01": "merluza",
  "697389abf38758705669ee02": "bacalao",
  "697389abf38758705669ee03": "anchoas",
  "697389abf38758705669ee04": "boquerones",
  "697389abf38758705669ee05": "trucha",
  "697389abf38758705669ee06": "dorada",
  "697389abf38758705669ee07": "lubina",
  "697389abf38758705669ee08": "calamares",
  "697389abf38758705669ee09": "pulpo",
  "697389abf38758705669ee0a": "gambas",
  "697389abf38758705669ee0b": "mejillones",
  "697389abf38758705669ee0c": "almejas",
  "697389abf38758705669ee0d": "berberechos",
  "697389abf38758705669ee0e": "garbanzos",
  "697389abf38758705669ee0f": "lentejas",
  "697389abf38758705669ee10": "alubias",
  "697389abf38758705669ee11": "judias",
  "697389abf38758705669ee12": "guisantes",
  "697389abf38758705669ee13": "habas",
  "697389abf38758705669ee14": "arroz",
  "697389abf38758705669ee15": "pasta",
  "697389abf38758705669ee16": "cuscus",
  "697389abf38758705669ee17": "bulgur",
  "697389abf38758705669ee18": "avena",
  "697389abf38758705669ee19": "harina de trigo",
  "697389abf38758705669ee1a": "pan",
  "697389abf38758705669ee1b": "pan rallado",
  "697389abf38758705669ee1c": "tortillas",
  "697389abf38758705669ee1d": "patata",
  "697389abf38758705669ee1e": "batata",
  "697389abf38758705669ee1f": "cebolla",
  "697389abf38758705669ee20": "ajo",
  "697389abf38758705669ee21": "pimiento",
  "697389abf38758705669ee22": "tomate",
  "697389abf38758705669ee23": "pepino",
  "697389abf38758705669ee24": "calabacin",
  "697389abf38758705669ee25": "berenjena",
  "697389abf38758705669ee26": "zanahoria",
  "697389abf38758705669ee27": "puerro",
  "697389abf38758705669ee28": "apio",
  "697389abf38758705669ee29": "judias verdes",
  "697389abf38758705669ee2a": "espinacas",
  "697389abf38758705669ee2b": "acelgas",
  "697389abf38758705669ee2c": "lechuga",
  "697389abf38758705669ee2d": "col",
  "697389abf38758705669ee2e": "coliflor",
  "697389abf38758705669ee2f": "brocoli",
  "697389abf38758705669ee30": "setas",
  "697389abf38758705669ee31": "champinones",
  "697389abf38758705669ee32": "calabaza",
  "697389abf38758705669ee33": "esparragos",
  "697389abf38758705669ee34": "alcachofas",
  "697389abf38758705669ee35": "remolacha",
  "697389abf38758705669ee36": "maiz",
  "697389abf38758705669ee37": "manzana",
  "697389abf38758705669ee38": "platano",
  "697389abf38758705669ee39": "naranja",
  "697389abf38758705669ee3a": "limon",
  "697389abf38758705669ee3b": "mandarina",
  "697389abf38758705669ee3c": "pera",
  "697389abf38758705669ee3d": "uvas",
  "697389abf38758705669ee3e": "fresas",
  "697389abf38758705669ee3f": "melon",
  "697389abf38758705669ee40": "sandia",
  "697389abf38758705669ee41": "melocoton",
  "697389abf38758705669ee42": "albaricoque",
  "697389abf38758705669ee43": "ciruelas",
  "697389abf38758705669ee44": "cerezas",
  "697389abf38758705669ee45": "pina",
  "697389abf38758705669ee46": "mango",
  "697389abf38758705669ee47": "aguacate",
  "697389abf38758705669ee48": "leche",
  "697389abf38758705669ee49": "leche evaporada",
  "697389abf38758705669ee4a": "yogur",
  "697389abf38758705669ee4b": "queso",
  "697389abf38758705669ee4c": "requeson",
  "697389abf38758705669ee4d": "nata",
  "697389abf38758705669ee4e": "mantequilla",
  "697389abf38758705669ee4f": "aceite de oliva",
  "697389abf38758705669ee50": "aceite de girasol",
  "697389abf38758705669ee51": "aceitunas",
  "697389abf38758705669ee52": "almendras",
  "697389abf38758705669ee53": "nueces",
  "697389abf38758705669ee54": "avellanas",
  "697389abf38758705669ee55": "pistachos",
  "697389abf38758705669ee56": "pinones",
  "697389abf38758705669ee57": "cacahuetes",
  "697389abf38758705669ee58": "semillas de sesamo",
  "697389abf38758705669ee59": "semillas de chia",
  "697389abf38758705669ee5a": "semillas de lino",
  "697389abf38758705669ee5b": "sal",
  "697389abf38758705669ee5c": "pimienta",
  "697389abf38758705669ee5d": "pimenton",
  "697389abf38758705669ee5e": "comino",
  "697389abf38758705669ee5f": "oregano",
  "697389abf38758705669ee60": "tomillo",
  "697389abf38758705669ee61": "romero",
  "697389abf38758705669ee62": "laurel",
  "697389abf38758705669ee63": "curry",
  "697389abf38758705669ee64": "canela",
  "697389abf38758705669ee65": "nuez moscada",
  "697389abf38758705669ee66": "azafran",
  "697389abf38758705669ee67": "vainilla",
  "697389abf38758705669ee68": "vinagre",
  "697389abf38758705669ee69": "vinagre balsamico",
  "697389abf38758705669ee6a": "salsa de soja",
  "697389abf38758705669ee6b": "mostaza",
  "697389abf38758705669ee6c": "mayonesa",
  "697389abf38758705669ee6d": "ketchup",
  "697389abf38758705669ee6e": "tomate triturado",
  "697389abf38758705669ee6f": "tomate frito",
  "697389abf38758705669ee70": "caldo",
  "697389abf38758705669ee71": "azucar",
  "697389abf38758705669ee72": "miel",
  "697389abf38758705669ee73": "harina de maiz",
  "697389abf38758705669ee74": "levadura",
  "697389abf38758705669ee75": "bicarbonato",
  "697389abf38758705669ee76": "chocolate",
  "697389abf38758705669ee77": "agua",
  "697389abf38758705669ee78": "cafe",
  "697389abf38758705669ee79": "te",
};

// ─── 3. QUALITY FIXES (name + canonicalName) ──────────────────────────────────
const QUALITY_FIXES = [
  {
    _id: "6973a118a21172a589f3a887",
    set: { name: "Queso Feta", canonicalName: "queso feta", updatedAt: NOW },
  },
  {
    _id: "6973b44235b74eb3bc1d93cd",
    set: { name: "Habaneros", updatedAt: NOW },
  },
  {
    _id: "6973b42e35b74eb3bc1d93c1",
    set: { canonicalName: "chile", updatedAt: NOW },
  },
];

// ─── MAIN ─────────────────────────────────────────────────────────────────────
async function main() {
  const url = resolveMongoUrl();
  const client = new MongoClient(url);
  await client.connect();
  const db = client.db();
  const ingredients = db.collection("kitcheningredients");
  const dishes = db.collection("kitchendishes");

  let totalOps = 0;

  // ── PHASE 1: Cascades in kitchendishes first, then delete duplicates ─────────
  console.log("\n── PHASE 1: Merge duplicates ──────────────────────────────────");
  for (const [elimId, masterId] of Object.entries(MERGE_MAP)) {
    // Find dishes that reference the eliminated ingredient
    const affected = await dishes.find({
      "ingredients.ingredientId": new ObjectId(elimId),
    }).toArray();

    if (affected.length > 0) {
      console.log(`  ↪ CASCADE: ${elimId} → ${masterId} | ${affected.length} dish(es) affected`);
      for (const d of affected) {
        console.log(`    - ${d.name} [${d._id}]`);
      }
      if (APPLY) {
        // Update all ingredientId references in the ingredients array
        const result = await dishes.updateMany(
          { "ingredients.ingredientId": new ObjectId(elimId) },
          { $set: { "ingredients.$[elem].ingredientId": new ObjectId(masterId), updatedAt: NOW } },
          { arrayFilters: [{ "elem.ingredientId": new ObjectId(elimId) }] }
        );
        console.log(`    ✓ Updated ${result.modifiedCount} dish document(s)`);
        totalOps += result.modifiedCount;
      }
    } else {
      console.log(`  ✓ No cascades needed for ${elimId}`);
    }

    // Delete the duplicate ingredient
    const elimDoc = await ingredients.findOne({ _id: new ObjectId(elimId) });
    if (elimDoc) {
      console.log(`  🗑  Delete: "${elimDoc.name}" [${elimId}]`);
      if (APPLY) {
        await ingredients.deleteOne({ _id: new ObjectId(elimId) });
        totalOps++;
      }
    } else {
      console.log(`  ⚠  Not found: ${elimId} (already deleted?)`);
    }
  }

  // ── PHASE 2: Add missing canonicalNames ──────────────────────────────────────
  console.log("\n── PHASE 2: Add missing canonicalNames (127 ingredients) ──────");
  let canonical_count = 0;
  for (const [id, canonical] of Object.entries(CANONICAL_FIXES)) {
    const doc = await ingredients.findOne({ _id: new ObjectId(id) });
    if (!doc) { console.log(`  ⚠  Not found: ${id}`); continue; }
    if (doc.canonicalName) {
      // Already has one — skip (may have been set after export)
      continue;
    }
    console.log(`  + ${doc.name} → canonicalName: "${canonical}"`);
    if (APPLY) {
      await ingredients.updateOne(
        { _id: new ObjectId(id) },
        { $set: { canonicalName: canonical, isArchived: false, updatedAt: NOW } }
      );
    }
    canonical_count++;
    totalOps++;
  }
  console.log(`  → ${canonical_count} canonicalNames to set`);

  // ── PHASE 3: Quality fixes ────────────────────────────────────────────────────
  console.log("\n── PHASE 3: Quality fixes ──────────────────────────────────────");
  for (const fix of QUALITY_FIXES) {
    const doc = await ingredients.findOne({ _id: new ObjectId(fix._id) });
    if (!doc) { console.log(`  ⚠  Not found: ${fix._id}`); continue; }
    console.log(`  ✎ "${doc.name}" [${fix._id}] → ${JSON.stringify(fix.set)}`);
    if (APPLY) {
      await ingredients.updateOne({ _id: new ObjectId(fix._id) }, { $set: fix.set });
    }
    totalOps++;
  }

  console.log(`\n${"─".repeat(60)}`);
  console.log(`Total operations planned: ${totalOps}`);
  if (!APPLY) {
    console.log("DRY-RUN — nada aplicado. Usa --apply para ejecutar.");
  } else {
    console.log("✅ APLICADO correctamente.");
  }

  await client.close();
}

main().catch((err) => { console.error(err); process.exit(1); });
