/**
 * One-time repair: backfill source:"catalog" on household dishes that were
 * installed from a catalog pack but are missing the source field.
 *
 * Safe criteria: scope:"household" AND sourcePackId exists (non-null/non-empty)
 *                AND (source is null/undefined/missing OR source !== "catalog")
 *
 * Run dry-run (default):
 *   node backend/scripts/repair-catalog-source.js
 *
 * Run with actual writes:
 *   node backend/scripts/repair-catalog-source.js --apply
 */

import mongoose from "mongoose";
import { resolveMongoUrl } from "./mongo-url.js";
import { KitchenDish } from "../src/kitchen/models/KitchenDish.js";

const apply = process.argv.includes("--apply");

async function run() {
  const mongoUrl = resolveMongoUrl();
  await mongoose.connect(mongoUrl);

  const candidates = await KitchenDish.find({
    scope: "household",
    sourcePackId: { $exists: true, $ne: null },
    $or: [
      { source: { $exists: false } },
      { source: null },
      { source: { $nin: ["catalog"] } }
    ]
  }).select("_id name householdId sourcePackId sourcePackSlug source").lean();

  console.log(`Found ${candidates.length} dish(es) to repair.`);
  if (candidates.length === 0) {
    console.log("Nothing to do.");
    await mongoose.disconnect();
    return;
  }

  if (!apply) {
    console.log("DRY RUN — pass --apply to write changes.");
    candidates.slice(0, 20).forEach((d) => {
      console.log(`  [${String(d._id)}] "${d.name}"  source=${JSON.stringify(d.source)}  packId=${d.sourcePackId}  packSlug=${d.sourcePackSlug || "-"}`);
    });
    if (candidates.length > 20) console.log(`  ... and ${candidates.length - 20} more.`);
    await mongoose.disconnect();
    return;
  }

  const ids = candidates.map((d) => d._id);
  const result = await KitchenDish.updateMany(
    { _id: { $in: ids } },
    { $set: { source: "catalog" } }
  );

  console.log(`✅ Repair complete. Modified: ${result.modifiedCount}`);
  await mongoose.disconnect();
}

run().catch((err) => {
  console.error("repair-catalog-source failed:", err);
  process.exit(1);
});
