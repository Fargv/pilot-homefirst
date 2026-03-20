import mongoose from "mongoose";
import { resolveMongoUrl } from "./mongo-url.js";
import { Household } from "../src/kitchen/models/Household.js";
import { PurchaseSession } from "../src/kitchen/models/PurchaseSession.js";

async function run() {
  const mongoUrl = resolveMongoUrl();
  await mongoose.connect(mongoUrl);
  console.log("✅ Conexión MongoDB establecida para migrate-purchase-sessions");

  await Household.updateMany(
    { cycleStartDay: { $exists: false } },
    { $set: { cycleStartDay: 1 } }
  );

  await Household.updateMany(
    { monthlyBudget: { $exists: false } },
    { $set: { monthlyBudget: null } }
  );

  await PurchaseSession.syncIndexes();
  console.log("✅ Índices de purchase sessions sincronizados");
  await mongoose.disconnect();
}

run().catch(async (error) => {
  console.error("❌ Falló migrate-purchase-sessions:", error.message);
  await mongoose.disconnect().catch(() => {});
  process.exit(1);
});
