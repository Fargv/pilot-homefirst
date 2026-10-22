/** Explicit STAB-001 onboarding cleanup; never part of application startup. */
import mongoose from "mongoose";
import { pathToFileURL } from "node:url";
import { config } from "../src/config.js";
import { parseCleanupFlags } from "../src/cleanupCommand.js";
import { cleanupOldChallenges } from "../src/kitchen/onboardingEngine.js";

function assertSafeTarget(mode, argv) {
  if (!config.mongodbUri) throw new Error("MONGODB_URI no configurada.");
  if (mode === "apply" && config.isProduction) throw new Error("Cleanup bloqueado en producción.");
  if (mode === "apply" && !argv.includes("--allow-nonlocal") && !/^mongodb(?:\+srv)?:\/\/(?:localhost|127\.0\.0\.1|::1)(?:[:/]|$)/i.test(config.mongodbUri)) {
    throw new Error("Cleanup bloqueado para MongoDB no local. Usa una Mongo aislada local o --allow-nonlocal con autorización explícita.");
  }
}

export async function runCleanupCli(argv = process.argv.slice(2)) {
  const flags = parseCleanupFlags(argv);
  assertSafeTarget(flags.mode, argv);
  mongoose.set("autoIndex", false);
  await mongoose.connect(config.mongodbUri);
  if (flags.mode === "dry-run") {
    const result = await mongoose.connection.collection("onboardingchallenges").countDocuments({
      key: { $in: ["visit_week", "visit_dishes", "visit_ingredients", "visit_shopping", "visit_catalog"] },
      active: true
    });
    console.log(`[onboarding] Dry run: ${result} legacy challenge(s) would be deactivated.`);
  } else {
    await cleanupOldChallenges();
    console.log("[onboarding] Legacy challenge cleanup complete.");
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  runCleanupCli()
    .catch((error) => {
      console.error("[onboarding] Cleanup failed:", error.message);
      process.exitCode = 1;
    })
    .finally(async () => {
      if (mongoose.connection.readyState !== 0) await mongoose.disconnect();
    });
}
