/**
 * 05_add_herb_bbq_categories.js
 * ─────────────────────────────────────────────────────────────────────────────
 * 1. Crea categoría de ingredientes "Hierbas Aromáticas" (scope:master)
 * 2. Crea categoría de ingredientes "Barbacoa y Ahumados" (scope:master)
 * 3. Reasigna todos los ingredientes de hierbas → Hierbas Aromáticas
 * 4. Reasigna carbón / astillas / leña → Barbacoa y Ahumados
 * 5. Fija categoryId de Cilantro (tenía ID roto)
 *
 * USAGE:
 *   node --experimental-vm-modules 05_add_herb_bbq_categories.js           # dry-run
 *   node --experimental-vm-modules 05_add_herb_bbq_categories.js --apply   # ejecuta
 */

import { MongoClient, ObjectId } from "mongodb";
import { resolveMongoUrl } from "../mongo-url.js";

const APPLY = process.argv.includes("--apply");
const NOW   = new Date();

const G = "\x1b[32m", Y = "\x1b[33m", R = "\x1b[31m", C = "\x1b[36m", B = "\x1b[1m", X = "\x1b[0m";

// ─── Definición de las dos categorías nuevas ──────────────────────────────────
// IDs fijos para ser idempotente y que el sync los propague siempre igual
const CAT_HERBS = {
  _id:       new ObjectId("6a6b0001000000000000aa01"),  // ID fijo "hierbas"
  scope:     "master",
  name:      "Hierbas Aromáticas",
  slug:      "hierbas-aromaticas",
  colorBg:   "#D1FAE5",
  colorText: "#065F46",
  order:     32,
  forRecipes: true,
  active:    true,
  isArchived: false,
  createdAt:  NOW,
  updatedAt:  NOW,
};

const CAT_BBQ = {
  _id:       new ObjectId("6a6b0001000000000000aa02"),  // ID fijo "bbq"
  scope:     "master",
  name:      "Barbacoa y Ahumados",
  slug:      "barbacoa-y-ahumados",
  colorBg:   "#FEF3C7",
  colorText: "#92400E",
  order:     33,
  forRecipes: false,
  active:    true,
  isArchived: false,
  createdAt:  NOW,
  updatedAt:  NOW,
};

// ─── Ingredientes → Hierbas Aromáticas ───────────────────────────────────────
// Incluye todos los que son hierbas/especias vegetales (no salsas, no aceites)
const HERB_IDS = [
  "697389abf38758705669ee5f",  // Orégano
  "697389abf38758705669ee60",  // Tomillo
  "697389abf38758705669ee61",  // Romero
  "697389abf38758705669ee62",  // Laurel
  "697389abf38758705669ee63",  // Curry         ← mezcla de especias
  "697389abf38758705669ee64",  // Canela
  "697389abf38758705669ee65",  // Nuez moscada
  "697389abf38758705669ee66",  // Azafrán
  "697389abf38758705669ee67",  // Vainilla
  "6977a71320050cac7394bbf4",  // Eneldo
  "6a01eb415a5e66b2705e2348",  // Cilantro      ← tenía categoryId roto
];
// Nota: Sal, Pimienta, Pimentón y Comino quedan en "Aceites, Salsas y Condimentos"
// porque son condimentos básicos de cocción, no hierbas aromáticas opcionales.

// ─── Ingredientes → Barbacoa y Ahumados ──────────────────────────────────────
const BBQ_IDS = [
  "6a249c0f0aa3fb1ac7250c13",  // Astillas de roble o nogal
  "6a249c190aa3fb1ac7250c1d",  // Carbón de calidad
  "6a249c3e0aa3fb1ac7250c4f",  // Carbón vegetal o leña
  "6a249c7e0aa3fb1ac7250c95",  // Astillas de hickory o manzano
  "6a249ca00aa3fb1ac7250cbe",  // Carbón binchotan
  "6a249cb20aa3fb1ac7250cdc",  // Leña dura
];

// ─── MAIN ──────────────────────────────────────────────────────────────────────
async function main() {
  console.log(`\n${B}╔══════════════════════════════════════════════════════════════╗${X}`);
  console.log(`${B}║   05 — Hierbas Aromáticas + Barbacoa y Ahumados              ║${X}`);
  console.log(`${B}╚══════════════════════════════════════════════════════════════╝${X}\n`);

  const url    = resolveMongoUrl();
  const client = new MongoClient(url);
  await client.connect();
  const db = client.db();

  const catCol = db.collection("categories");
  const ingCol = db.collection("kitcheningredients");

  let ops = 0;

  // ── 1. Crear / upsert las dos categorías ────────────────────────────────────
  for (const cat of [CAT_HERBS, CAT_BBQ]) {
    const existing = await catCol.findOne({ _id: cat._id });
    if (existing) {
      console.log(`${Y}  ↷ Categoría "${cat.name}" ya existe [${cat._id}] — se actualiza${X}`);
      if (APPLY) {
        await catCol.replaceOne({ _id: cat._id }, { ...cat, updatedAt: NOW });
        console.log(`  ${G}✓ Actualizada${X}`);
      }
    } else {
      console.log(`  ${C}+ Crear categoría "${cat.name}"${X}`);
      console.log(`    _id: ${cat._id}`);
      console.log(`    slug: ${cat.slug} | order: ${cat.order} | colorBg: ${cat.colorBg}`);
      if (APPLY) {
        await catCol.insertOne(cat);
        console.log(`  ${G}✓ Creada${X}`);
        ops++;
      }
    }
  }

  // ── 2. Reasignar hierbas → CAT_HERBS ───────────────────────────────────────
  console.log(`\n${B}── Hierbas Aromáticas (${HERB_IDS.length} ingredientes) ─────────────────────${X}`);
  for (const id of HERB_IDS) {
    const ing = await ingCol.findOne({ _id: new ObjectId(id) });
    if (!ing) {
      console.log(`  ${Y}⚠ No encontrado: ${id}${X}`);
      continue;
    }
    const oldCatId = ing.categoryId?.toString() ?? "null";
    if (oldCatId === CAT_HERBS._id.toString()) {
      console.log(`  ✓ "${ing.name}" ya está en Hierbas`);
      continue;
    }
    console.log(`  ↻ "${ing.name}" [${id}]  ${oldCatId} → Hierbas`);
    if (APPLY) {
      await ingCol.updateOne(
        { _id: new ObjectId(id) },
        { $set: { categoryId: CAT_HERBS._id, updatedAt: NOW } }
      );
      ops++;
    }
  }

  // ── 3. Reasignar BBQ → CAT_BBQ ─────────────────────────────────────────────
  console.log(`\n${B}── Barbacoa y Ahumados (${BBQ_IDS.length} ingredientes) ──────────────────────${X}`);
  for (const id of BBQ_IDS) {
    const ing = await ingCol.findOne({ _id: new ObjectId(id) });
    if (!ing) {
      console.log(`  ${Y}⚠ No encontrado: ${id}${X}`);
      continue;
    }
    const oldCatId = ing.categoryId?.toString() ?? "null";
    if (oldCatId === CAT_BBQ._id.toString()) {
      console.log(`  ✓ "${ing.name}" ya está en Barbacoa`);
      continue;
    }
    console.log(`  ↻ "${ing.name}" [${id}]  ${oldCatId} → Barbacoa y Ahumados`);
    if (APPLY) {
      await ingCol.updateOne(
        { _id: new ObjectId(id) },
        { $set: { categoryId: CAT_BBQ._id, updatedAt: NOW } }
      );
      ops++;
    }
  }

  // ── RESUMEN ─────────────────────────────────────────────────────────────────
  console.log(`\n${B}${"─".repeat(64)}${X}`);
  if (!APPLY) {
    console.log(`${Y}DRY-RUN — nada modificado. Ejecuta con --apply para aplicar.${X}`);
    console.log(`  Categorías nuevas : ${CAT_HERBS.name} [${CAT_HERBS._id}]`);
    console.log(`                      ${CAT_BBQ.name} [${CAT_BBQ._id}]`);
    console.log(`  Herbs a mover     : ${HERB_IDS.length} ingredientes`);
    console.log(`  BBQ a mover       : ${BBQ_IDS.length} ingredientes`);
  } else {
    console.log(`${G}${B}✅ Completado — ${ops} operaciones aplicadas${X}`);
    console.log(`  Recuerda: vuelve a ejecutar seedIngredientsFromJson + syncMasterCatalogDevToProd`);
    console.log(`  para que estas categorías se propaguen a PROD.`);
  }
  console.log("");

  await client.close();
}

main().catch(err => { console.error(R + "ERROR:" + X, err.message || err); process.exit(1); });
