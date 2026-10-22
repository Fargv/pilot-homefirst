import mongoose from "mongoose";
import { config } from "./config.js";
import { ensureStarterMasterDishes } from "./kitchen/bootstrap/masterDishes.js";

export async function connectDb() {
  if (!config.mongodbUri) return;

  mongoose.set("strictQuery", true);
  await mongoose.connect(config.mongodbUri);
  const masterDishSeed = await ensureStarterMasterDishes();
  const match = config.mongodbUri.match(/\/([^/?]+)(\?|$)/);
  const dbName = match ? match[1] : "desconocida";
  console.log(`[db] Conectado — db: ${dbName}`);
  if (masterDishSeed.createdCount > 0) {
    console.log(`[db] Seeded ${masterDishSeed.createdCount} starter master dishes.`);
  }
}
