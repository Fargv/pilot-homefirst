/**
 * seedIngredientsFromJson.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Importa los ingredientes master desde un JSON exportado de MongoDB
 * (formato MongoDB Extended JSON con $oid / $date) al Atlas DEV.
 *
 * Usa upsert por _id → seguro de ejecutar múltiples veces.
 *
 * USAGE:
 *   node backend/scripts/seedIngredientsFromJson.js <ruta-al-json>
 *   node backend/scripts/seedIngredientsFromJson.js <ruta-al-json> --apply
 *
 * EJEMPLO:
 *   node backend/scripts/seedIngredientsFromJson.js "C:/Users/faced/Downloads/pilot_dev.kitchenIngredients.json"
 *   node backend/scripts/seedIngredientsFromJson.js "C:/Users/faced/Downloads/pilot_dev.kitchenIngredients.json" --apply
 */

import { MongoClient, ObjectId } from "mongodb";
import { readFileSync } from "fs";
import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname  = path.dirname(__filename);
dotenv.config({ path: path.resolve(__dirname, "../.env") });

const APPLY    = process.argv.includes("--apply");
const jsonPath = process.argv.find(a => a.endsWith(".json"));

if (!jsonPath) {
  console.error("✗  Debes pasar la ruta al JSON como primer argumento.");
  console.error("   Ejemplo: node backend/scripts/seedIngredientsFromJson.js \"C:/ruta/archivo.json\"");
  process.exit(1);
}

// ── Parsear MongoDB Extended JSON → documentos planos ─────────────────────────
function parseExtendedJson(raw) {
  return JSON.parse(raw, (key, value) => {
    if (value && typeof value === "object") {
      if ("$oid" in value)  return new ObjectId(value.$oid);
      if ("$date" in value) return new Date(value.$date);
    }
    return value;
  });
}

// ─── MAIN ──────────────────────────────────────────────────────────────────────
async function main() {
  const GREEN  = "\x1b[32m";
  const YELLOW = "\x1b[33m";
  const RED    = "\x1b[31m";
  const BOLD   = "\x1b[1m";
  const RESET  = "\x1b[0m";

  console.log(`\n${BOLD}Leyendo JSON: ${jsonPath}${RESET}`);
  const raw  = readFileSync(jsonPath, "utf-8");
  const docs = parseExtendedJson(raw);

  if (!Array.isArray(docs)) {
    console.error(`${RED}✗  El JSON no es un array de documentos.${RESET}`);
    process.exit(1);
  }

  console.log(`  → ${docs.length} docs en total`);

  // Filtrar: solo scope:"master"
  const masterDocs = docs.filter(d => d.scope === "master");
  const skipped    = docs.filter(d => d.scope !== "master");

  if (skipped.length > 0) {
    console.warn(`${YELLOW}  ⚠  ${skipped.length} docs SIN scope:"master" — se omiten (basura/test):${RESET}`);
    skipped.forEach(d => console.warn(`${YELLOW}     - "${d.name}" (scope: ${d.scope ?? "undefined"})${RESET}`));
  }
  console.log(`${GREEN}  ✓ ${masterDocs.length} ingredientes con scope:"master" → se importarán${RESET}`);

  const DEV_URI = process.env.DEV_MONGODB_URI;
  if (!DEV_URI) {
    console.error(`${RED}✗  DEV_MONGODB_URI no está definida en backend/.env${RESET}`);
    process.exit(1);
  }

  const client = new MongoClient(DEV_URI, { serverSelectionTimeoutMS: 10000 });
  await client.connect();
  console.log(`${GREEN}✓ Conectado a DEV${RESET}`);

  const col = client.db().collection("kitcheningredients");

  // Count existing
  const before = await col.countDocuments({ scope: "master" });
  console.log(`  PROD antes: ${before} ingredientes con scope:master`);

  if (!APPLY) {
    console.log(`\n${YELLOW}DRY-RUN — sin cambios. Añade --apply para ejecutar.${RESET}`);
    console.log(`  Haría upsert de ${masterDocs.length} ingredientes en DEV (omitiendo ${skipped.length} sin scope:master).`);
    await client.close();
    return;
  }

  // Upsert each document
  let upserted = 0, modified = 0, errors = 0;
  for (const doc of masterDocs) {
    try {
      const result = await col.replaceOne(
        { _id: doc._id },
        doc,
        { upsert: true }
      );
      if (result.upsertedCount) upserted++;
      if (result.modifiedCount) modified++;
    } catch (err) {
      console.error(`  ${RED}✗ Error en "${doc.name}" [${doc._id}]: ${err.message}${RESET}`);
      errors++;
    }
  }

  const after = await col.countDocuments({ scope: "master" });

  console.log(`\n${BOLD}Resultado:${RESET}`);
  console.log(`  Nuevos (upserted): ${upserted}`);
  console.log(`  Actualizados     : ${modified}`);
  console.log(`  Errores          : ${errors}`);
  console.log(`  Total en DEV ahora (scope:master): ${after}`);

  if (errors === 0) {
    console.log(`\n${GREEN}${BOLD}✅ Seed completado. Ahora puedes ejecutar el sync DEV→PROD.${RESET}`);
  } else {
    console.log(`\n${YELLOW}⚠  Completado con ${errors} errores. Revisa arriba.${RESET}`);
  }

  await client.close();
}

main().catch(err => {
  console.error("\nERROR:", err.message || err);
  process.exit(1);
});
