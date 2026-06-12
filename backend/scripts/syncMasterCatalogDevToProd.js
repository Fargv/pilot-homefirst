/**
 * syncMasterCatalogDevToProd.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Copies ONLY master/global catalog collections from DEV MongoDB to PROD MongoDB.
 *
 * SAFE DEFAULTS
 *   - Dry-run by default — prints what would happen without touching PROD.
 *   - Real write requires explicit flag: --confirm-overwrite-prod-master
 *   - Refuses to run if DEV and PROD DB names are the same.
 *   - Refuses to run if PROD DB name doesn't contain "prod" (case-insensitive).
 *   - For mixed collections (kitchendishes / kitcheningredients / categories):
 *     only copies scope:"master" documents; leaves all household/override docs untouched.
 *   - Preserves original _id values.
 *
 * NEVER TOUCHES: households, users, overrides, purchases, subscriptions,
 *   progress, Stripe, Clerk, invitations, shopping lists, week plans, swaps,
 *   push subscriptions, pack entitlements, audit logs, personal recipes, etc.
 *
 * REQUIRED ENV VARS (add to backend/.env):
 *   DEV_MONGODB_URI   = mongodb+srv://...atlas.../pilot_dev?...
 *   PROD_MONGODB_URI  = mongodb+srv://...atlas.../pilot_prod?...
 *
 * USAGE:
 *   node backend/scripts/syncMasterCatalogDevToProd.js
 *                                    # dry-run (default)
 *   node backend/scripts/syncMasterCatalogDevToProd.js --confirm-overwrite-prod-master
 *                                    # real overwrite (DESTRUCTIVE for master collections)
 */

import { MongoClient } from "mongodb";
import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";
import readline from "readline";

// ─── Load .env ────────────────────────────────────────────────────────────────
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.resolve(__dirname, "../.env") });

// ─── Config ───────────────────────────────────────────────────────────────────
const APPLY = process.argv.includes("--confirm-overwrite-prod-master");
const NOW = new Date().toISOString();

/**
 * ALLOWLIST — only these collections are touched.
 *
 * Each entry:
 *   collection   : exact MongoDB collection name (lowercase plural)
 *   filter       : optional query filter — only docs matching this are copied from DEV
 *                  and only docs matching this are deleted from PROD before inserting.
 *                  If null → entire collection is replaced.
 *   description  : human-readable label for the log
 */
const MASTER_COLLECTIONS = [
  {
    collection: "catalogpacks",
    filter: null,
    description: "Catalog packs (curated meal packs)",
  },
  {
    collection: "kitchendishcategories",
    filter: null,
    description: "Dish categories (master)",
  },
  {
    collection: "categories",
    filter: { scope: "master" },
    description: "Categories — scope:master only",
  },
  {
    collection: "kitcheningredients",
    filter: { scope: "master" },
    description: "Kitchen ingredients — scope:master only",
  },
  {
    collection: "kitchendishes",
    filter: { scope: "master" },
    description: "Kitchen dishes — scope:master only",
  },
  {
    collection: "onboardingchallenges",
    filter: null,
    description: "Onboarding challenges",
  },
  {
    collection: "onboardingsuggestions",
    filter: null,
    description: "Onboarding suggestions",
  },
  {
    collection: "weeklychallengedefs",
    filter: null,
    description: "Weekly challenge definitions",
  },
  {
    collection: "weeklycycleconfigs",
    filter: null,
    description: "Weekly cycle configs",
  },
  {
    collection: "plansconfigs",
    filter: null,
    description: "Plans config (subscription plans)",
  },
  {
    collection: "stores",
    filter: null,
    description: "Stores (master store list)",
  },
  {
    collection: "bitesconfigs",
    filter: null,
    description: "Bites/gamification global config",
  },
];

// ─── Helpers ──────────────────────────────────────────────────────────────────
function extractDbName(uri) {
  try {
    // mongodb+srv://user:pass@host/dbname?options  OR  mongodb://host1,host2/dbname?options
    const afterAt = uri.includes("@") ? uri.split("@").slice(1).join("@") : uri;
    const pathPart = afterAt.split("/").slice(1).join("/");
    const dbName = pathPart.split("?")[0].split("#")[0].trim();
    return dbName || null;
  } catch {
    return null;
  }
}

function prompt(question) {
  return new Promise((resolve) => {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    rl.question(question, (answer) => { rl.close(); resolve(answer.trim()); });
  });
}

const GREEN  = "\x1b[32m";
const YELLOW = "\x1b[33m";
const RED    = "\x1b[31m";
const CYAN   = "\x1b[36m";
const BOLD   = "\x1b[1m";
const RESET  = "\x1b[0m";

// ─── MAIN ─────────────────────────────────────────────────────────────────────
async function main() {
  console.log("");
  console.log(`${BOLD}╔══════════════════════════════════════════════════════════════╗${RESET}`);
  console.log(`${BOLD}║    HomeFirst — Master Catalog Sync: DEV → PROD              ║${RESET}`);
  console.log(`${BOLD}╚══════════════════════════════════════════════════════════════╝${RESET}`);
  console.log("");

  // ── 1. Read env vars ────────────────────────────────────────────────────────
  const DEV_URI  = process.env.DEV_MONGODB_URI;
  const PROD_URI = process.env.PROD_MONGODB_URI;

  if (!DEV_URI) {
    console.error(`${RED}✗  DEV_MONGODB_URI not set in backend/.env${RESET}`);
    process.exit(1);
  }
  if (!PROD_URI) {
    console.error(`${RED}✗  PROD_MONGODB_URI not set in backend/.env${RESET}`);
    process.exit(1);
  }

  const devDb   = extractDbName(DEV_URI);
  const prodDb  = extractDbName(PROD_URI);

  console.log(`${CYAN}  DEV  DB: ${devDb  || "(could not parse)"}${RESET}`);
  console.log(`${CYAN}  PROD DB: ${prodDb || "(could not parse)"}${RESET}`);
  console.log("");

  // ── 2. Safety checks ────────────────────────────────────────────────────────
  if (!devDb || !prodDb) {
    console.error(`${RED}✗  Could not extract DB name from one of the URIs. Check your env vars.${RESET}`);
    process.exit(1);
  }

  if (devDb.toLowerCase() === prodDb.toLowerCase()) {
    console.error(`${RED}✗  DEV and PROD point to the SAME database ("${devDb}"). Aborting.${RESET}`);
    process.exit(1);
  }

  if (!prodDb.toLowerCase().includes("prod")) {
    console.error(`${RED}✗  PROD DB name ("${prodDb}") does not contain "prod".`);
    console.error(`   This safety check prevents accidental writes to a non-production DB.`);
    console.error(`   If your PROD DB name is intentionally different, edit this script.${RESET}`);
    process.exit(1);
  }

  // ── 3. Mode announcement ────────────────────────────────────────────────────
  if (APPLY) {
    console.log(`${RED}${BOLD}⚠  APPLY MODE — Master collections will be OVERWRITTEN in PROD.${RESET}`);
    console.log(`${RED}   Collections in PROD matching the allowlist filter will be DELETED and re-inserted.${RESET}`);
    console.log(`${RED}   User data, household data, overrides, progress, etc. are NOT touched.${RESET}`);
    console.log("");

    const answer = await prompt(`¿Confirmas que quieres sobreescribir los master de PROD ("${prodDb}")? Escribe 'si-sobreescribir-prod' para confirmar: `);
    if (answer !== "si-sobreescribir-prod") {
      console.log("Cancelado por el usuario.");
      process.exit(0);
    }
    console.log("");
  } else {
    console.log(`${YELLOW}▸ DRY-RUN — Solo se muestra lo que haría. Sin cambios en PROD.${RESET}`);
    console.log(`${YELLOW}  Añade --confirm-overwrite-prod-master para ejecutar de verdad.${RESET}`);
    console.log("");
  }

  // ── 4. Connect ──────────────────────────────────────────────────────────────
  console.log("Conectando a DEV...");
  const devClient  = new MongoClient(DEV_URI,  { serverSelectionTimeoutMS: 10000 });
  const prodClient = new MongoClient(PROD_URI, { serverSelectionTimeoutMS: 10000 });

  await devClient.connect();
  console.log(`${GREEN}✓ DEV conectado${RESET}`);
  await prodClient.connect();
  console.log(`${GREEN}✓ PROD conectado${RESET}`);
  console.log("");

  const devDatabase  = devClient.db();
  const prodDatabase = prodClient.db();

  // ── 5. Sync each collection ─────────────────────────────────────────────────
  const summary = [];

  for (const entry of MASTER_COLLECTIONS) {
    const { collection, filter, description } = entry;
    const devCol  = devDatabase.collection(collection);
    const prodCol = prodDatabase.collection(collection);

    console.log(`${BOLD}── ${description} (${collection})${RESET}`);

    // Count in DEV (source)
    const devCount  = await devCol.countDocuments(filter || {});
    // Count in PROD (target) before sync
    const prodBefore = await prodCol.countDocuments(filter || {});

    console.log(`   DEV  docs to copy : ${devCount}`);
    console.log(`   PROD docs before  : ${prodBefore}`);

    if (devCount === 0) {
      console.log(`   ${YELLOW}⚠  0 docs in DEV — skipping (nothing to copy)${RESET}`);
      summary.push({ collection, description, devCount, prodBefore, prodAfter: prodBefore, status: "SKIP (empty in DEV)" });
      console.log("");
      continue;
    }

    if (!APPLY) {
      console.log(`   ${YELLOW}→ DRY-RUN: would delete ${prodBefore} from PROD, insert ${devCount} from DEV${RESET}`);
      summary.push({ collection, description, devCount, prodBefore, prodAfter: "?", status: "DRY-RUN" });
      console.log("");
      continue;
    }

    // Read all docs from DEV
    const docs = await devCol.find(filter || {}).toArray();

    // Delete matching docs from PROD
    const deleteResult = await prodCol.deleteMany(filter || {});
    console.log(`   🗑  Deleted ${deleteResult.deletedCount} docs from PROD`);

    // Insert into PROD (preserving _id)
    const insertResult = await prodCol.insertMany(docs, { ordered: false });
    const prodAfter = await prodCol.countDocuments(filter || {});

    console.log(`   ${GREEN}✓  Inserted ${insertResult.insertedCount} docs into PROD${RESET}`);
    console.log(`   PROD docs after   : ${prodAfter}`);

    summary.push({
      collection,
      description,
      devCount,
      prodBefore,
      prodAfter,
      deleted: deleteResult.deletedCount,
      inserted: insertResult.insertedCount,
      status: prodAfter === devCount ? "✅ OK" : "⚠ COUNT MISMATCH",
    });

    console.log("");
  }

  // ── 6. Summary ──────────────────────────────────────────────────────────────
  console.log(`${BOLD}╔══════════════════════════════════════════════════════════════╗${RESET}`);
  console.log(`${BOLD}║  RESUMEN${RESET}${BOLD}                                                     ║${RESET}`);
  console.log(`${BOLD}╚══════════════════════════════════════════════════════════════╝${RESET}`);
  console.log("");

  for (const s of summary) {
    const status = s.status.startsWith("✅") ? `${GREEN}${s.status}${RESET}` :
                   s.status.startsWith("⚠")  ? `${YELLOW}${s.status}${RESET}` :
                   s.status.includes("DRY")  ? `${YELLOW}${s.status}${RESET}` :
                   `${CYAN}${s.status}${RESET}`;
    console.log(`  ${status}  ${s.collection}`);
    if (APPLY && s.inserted !== undefined) {
      console.log(`         deleted: ${s.deleted}, inserted: ${s.inserted}, prod_after: ${s.prodAfter}`);
    } else if (!APPLY) {
      console.log(`         dev: ${s.devCount}, prod_before: ${s.prodBefore}`);
    }
  }

  console.log("");
  if (!APPLY) {
    console.log(`${YELLOW}DRY-RUN completado. Nada ha cambiado en PROD.${RESET}`);
    console.log(`${YELLOW}Ejecuta con --confirm-overwrite-prod-master para aplicar.${RESET}`);
  } else {
    console.log(`${GREEN}${BOLD}✅ Sync DEV → PROD completado a las ${NOW}${RESET}`);
    console.log(`${GREEN}   Sólo se han tocado las colecciones del allowlist de master.${RESET}`);
    console.log(`${GREEN}   Datos de usuarios, households y overrides intactos.${RESET}`);
  }
  console.log("");

  await devClient.close();
  await prodClient.close();
}

main().catch((err) => {
  console.error(`\n${RED}ERROR:${RESET}`, err.message || err);
  process.exit(1);
});
