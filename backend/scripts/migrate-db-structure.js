/**
 * STAB-001 structural migration CLI.
 * Required: exactly one of --dry-run or --apply.
 * Same-key incompatible index replacement additionally requires
 * --maintenance-window.
 * The full read-only preflight completes before any dropIndex/updateMany.
 * Index DDL is not transactional; see docs/stab-001-validation.md.
 */
import mongoose from "mongoose";
import { pathToFileURL } from "node:url";
import { config } from "../src/config.js";
import {
  applyMigration,
  formatMigrationDiagnosis,
  preflightMigration
} from "../src/dbStructureMigration.js";

export function parseMigrationFlags(argv) {
  const apply = argv.includes("--apply");
  const dryRun = argv.includes("--dry-run");
  const allowNonlocal = argv.includes("--allow-nonlocal");
  const maintenanceWindow = argv.includes("--maintenance-window");
  if (apply === dryRun) {
    throw new Error("Usa exactamente un modo: --dry-run o --apply (son mutuamente excluyentes).");
  }
  return { mode: apply ? "apply" : "dry-run", allowNonlocal, maintenanceWindow };
}

function assertSafeTarget({ mode, allowNonlocal }) {
  if (!config.mongodbUri) throw new Error("MONGODB_URI no configurada.");
  if (mode === "apply" && config.isProduction) throw new Error("Migración bloqueada en producción.");
  if (mode === "apply" && !allowNonlocal && !/^mongodb(?:\+srv)?:\/\/(?:localhost|127\.0\.0\.1|::1)(?:[:/]|$)/i.test(config.mongodbUri)) {
    throw new Error("Migración bloqueada para MongoDB no local. Usa una Mongo aislada local o --allow-nonlocal con autorización explícita.");
  }
}

export async function runMigrationCli(argv = process.argv.slice(2)) {
  const flags = parseMigrationFlags(argv);
  assertSafeTarget(flags);
  // Schema autoIndex must not race this explicit DDL sequence.
  mongoose.set("autoIndex", false);
  await mongoose.connect(config.mongodbUri);
  const plan = await preflightMigration(mongoose.connection.db);
  console.log(formatMigrationDiagnosis(plan));
  if (!plan.ok) throw new Error(plan.diagnosis);
  if (flags.mode === "apply") {
    await applyMigration(mongoose.connection.db, plan, { allowSameKeyReplacement: flags.maintenanceWindow });
  }
  console.log(`[db-structure] ${flags.mode === "apply" ? "Migration complete" : "Dry run complete"}.`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  runMigrationCli()
    .catch((error) => {
      console.error("[db-structure] Failed:", error.message);
      process.exitCode = 1;
    })
    .finally(async () => {
      if (mongoose.connection.readyState !== 0) await mongoose.disconnect();
    });
}
