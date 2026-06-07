/**
 * inflate-bites-economy.js
 *
 * One-time idempotent migration: converts the Bites economy from
 *   1 Bite = 1.99 EUR   →   100 Bites = 1.99 EUR (1 Bite = 0.0199 EUR)
 *
 * What it does (×100 multiplier):
 *   1. Household.freeBitesBalance
 *   2. Household.purchasedBitesBalance
 *   3. Household.totalBitesSpent
 *   4. CatalogPack.monthlyCreditCost  (skips packs where cost === 0 — free packs)
 *   5. BitesConfig bundles bitesAmount
 *   6. BitesConfig monthlyGrantByPlan and maxFreeCarryOverByPlan
 *
 * SAFEGUARD: uses a migration marker document in a MigrationLog collection.
 * Running the script a second time does nothing.
 *
 * Usage:
 *   node scripts/inflate-bites-economy.js
 *
 * Requires MONGODB_URI in environment (same as the main app).
 */

import mongoose from "mongoose";
import dotenv from "dotenv";

dotenv.config();

const MIGRATION_ID = "inflate-bites-economy-v1";
const MULTIPLIER = 100;

// ── Minimal schemas (just the fields we touch) ──────────────────────────────

const MigrationLogSchema = new mongoose.Schema({
  migrationId: { type: String, unique: true },
  appliedAt: { type: Date, default: Date.now },
  summary: mongoose.Schema.Types.Mixed
});
const MigrationLog = mongoose.model("MigrationLog", MigrationLogSchema);

const HouseholdSchema = new mongoose.Schema({
  freeBitesBalance: Number,
  purchasedBitesBalance: Number,
  totalBitesSpent: Number
});
const Household = mongoose.model("Household", HouseholdSchema);

const CatalogPackSchema = new mongoose.Schema({
  slug: String,
  monthlyCreditCost: Number
});
const CatalogPack = mongoose.model("CatalogPack", CatalogPackSchema);

const BitesBundleSchema = new mongoose.Schema({ bitesAmount: Number }, { _id: true });
const BitesConfigSchema = new mongoose.Schema({
  key: String,
  monthlyGrantByPlan: { basic: Number, pro: Number, premium: Number },
  maxFreeCarryOverByPlan: { basic: Number, pro: Number, premium: Number },
  bundles: [BitesBundleSchema]
});
const BitesConfig = mongoose.model("BitesConfig", BitesConfigSchema);

// ── Main ────────────────────────────────────────────────────────────────────

async function run() {
  const uri = process.env.MONGODB_URI;
  if (!uri) {
    console.error("ERROR: MONGODB_URI is not set.");
    process.exit(1);
  }

  await mongoose.connect(uri);
  console.log("Connected to MongoDB.");

  // Idempotency check
  const existing = await MigrationLog.findOne({ migrationId: MIGRATION_ID });
  if (existing) {
    console.log(`Migration "${MIGRATION_ID}" was already applied at ${existing.appliedAt}. Nothing to do.`);
    await mongoose.disconnect();
    return;
  }

  const summary = {};

  // 1. Households — multiply bite balances
  const households = await Household.find({}).lean();
  let hhUpdated = 0;
  for (const hh of households) {
    const free = hh.freeBitesBalance ?? 0;
    const purchased = hh.purchasedBitesBalance ?? 0;
    const spent = hh.totalBitesSpent ?? 0;
    if (free === 0 && purchased === 0 && spent === 0) continue;
    await Household.updateOne(
      { _id: hh._id },
      {
        $set: {
          freeBitesBalance: free * MULTIPLIER,
          purchasedBitesBalance: purchased * MULTIPLIER,
          totalBitesSpent: spent * MULTIPLIER
        }
      }
    );
    hhUpdated++;
  }
  summary.householdsUpdated = hhUpdated;
  console.log(`✓ Households updated: ${hhUpdated}/${households.length}`);

  // 2. CatalogPacks — multiply monthlyCreditCost (skip 0 = free packs)
  const packs = await CatalogPack.find({ monthlyCreditCost: { $gt: 0 } }).lean();
  let packsUpdated = 0;
  for (const pack of packs) {
    await CatalogPack.updateOne(
      { _id: pack._id },
      { $set: { monthlyCreditCost: pack.monthlyCreditCost * MULTIPLIER } }
    );
    packsUpdated++;
    console.log(`  Pack "${pack.slug}": ${pack.monthlyCreditCost} → ${pack.monthlyCreditCost * MULTIPLIER} Bites`);
  }
  summary.packsUpdated = packsUpdated;
  console.log(`✓ CatalogPacks updated: ${packsUpdated}`);

  // 3. BitesConfig — bundles, monthly grants, carry-over limits
  const config = await BitesConfig.findOne({ key: "bitesEconomy" });
  if (config) {
    // Monthly grants
    const mg = config.monthlyGrantByPlan || {};
    const maxCo = config.maxFreeCarryOverByPlan || {};
    await BitesConfig.updateOne(
      { key: "bitesEconomy" },
      {
        $set: {
          "monthlyGrantByPlan.basic": (mg.basic ?? 1) * MULTIPLIER,
          "monthlyGrantByPlan.pro": (mg.pro ?? 3) * MULTIPLIER,
          "monthlyGrantByPlan.premium": (mg.premium ?? 10) * MULTIPLIER,
          "maxFreeCarryOverByPlan.basic": (maxCo.basic ?? 5) * MULTIPLIER,
          "maxFreeCarryOverByPlan.pro": (maxCo.pro ?? 10) * MULTIPLIER,
          "maxFreeCarryOverByPlan.premium": (maxCo.premium ?? 50) * MULTIPLIER
        }
      }
    );
    console.log(`✓ BitesConfig monthly grants and carry-over limits inflated ×${MULTIPLIER}`);

    // Bundles bitesAmount
    let bundlesUpdated = 0;
    for (const bundle of config.bundles || []) {
      await BitesConfig.updateOne(
        { key: "bitesEconomy", "bundles._id": bundle._id },
        { $set: { "bundles.$.bitesAmount": bundle.bitesAmount * MULTIPLIER } }
      );
      bundlesUpdated++;
      console.log(`  Bundle "${bundle.name}": ${bundle.bitesAmount} → ${bundle.bitesAmount * MULTIPLIER} Bites`);
    }
    summary.bundlesUpdated = bundlesUpdated;
    console.log(`✓ BitesConfig bundles updated: ${bundlesUpdated}`);
  } else {
    console.log("ℹ  No BitesConfig found — will be seeded with new defaults on next app start.");
    summary.bitesConfigFound = false;
  }

  // Mark as applied
  await MigrationLog.create({ migrationId: MIGRATION_ID, summary });
  console.log(`\n✅ Migration "${MIGRATION_ID}" complete.`);
  console.log("Summary:", JSON.stringify(summary, null, 2));

  // NOTE: Stripe bundle Price IDs are stored in BitesConfig.bundles[].stripePriceId.
  // The EUR prices on Stripe are NOT changed by this script — they remain correct
  // (e.g. a bundle that was 8.95 EUR is still 8.95 EUR; only the Bite count inflates).
  // No Stripe dashboard changes are needed for existing price IDs.

  await mongoose.disconnect();
}

run().catch((err) => {
  console.error("Migration failed:", err);
  process.exit(1);
});
