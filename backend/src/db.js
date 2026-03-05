import mongoose from "mongoose";
import { config } from "./config.js";

async function ensureScopedWeekStartIndex(collectionName) {
  const collection = mongoose.connection.collection(collectionName);
  const indexes = await collection.indexes();
  const legacyWeekStartIndex = indexes.find(
    (index) => index.unique && index.key && Object.keys(index.key).length === 1 && index.key.weekStart === 1
  );

  if (legacyWeekStartIndex) {
    await collection.dropIndex(legacyWeekStartIndex.name);
    console.log(`Index legado eliminado en ${collectionName}: ${legacyWeekStartIndex.name}`);
  }

  await collection.createIndex(
    { householdId: 1, weekStart: 1 },
    { unique: true, partialFilterExpression: { householdId: { $exists: true } } }
  );
}

async function ensureWeekPlanIndexes() {
  await ensureScopedWeekStartIndex("kitchenweekplans");
}

async function ensureShoppingListIndexes() {
  await ensureScopedWeekStartIndex("kitchenshoppinglists");
}

export async function connectDb() {
  if (!config.mongodbUri) return;

  mongoose.set("strictQuery", true);
  await mongoose.connect(config.mongodbUri);
  await ensureWeekPlanIndexes();
  await ensureShoppingListIndexes();
  const match = config.mongodbUri.match(/\/([^/?]+)(\?|$)/);
  const dbName = match ? match[1] : "desconocida";
  console.log("MongoDB conectado");
  if (config.nodeEnv === "development") {
    console.log(`MongoDB DB: ${dbName}`);
  }
}
