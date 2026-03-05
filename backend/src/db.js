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

async function ensureKitchenUserEmailIndex() {
  const collection = mongoose.connection.collection("kitchenusers");
  const indexes = await collection.indexes();
  const emailIndexes = indexes.filter((index) => index.key && index.key.email === 1);

  await collection.updateMany({ email: { $in: ["", null] } }, { $unset: { email: 1 } });

  for (const index of emailIndexes) {
    const isDesiredPartial =
      index.unique === true &&
      index.partialFilterExpression &&
      index.partialFilterExpression.email &&
      index.partialFilterExpression.email.$exists === true;

    if (!isDesiredPartial) {
      await collection.dropIndex(index.name);
      console.log(`Index email legado eliminado en kitchenusers: ${index.name}`);
    }
  }

  try {
    await collection.createIndex(
      { email: 1 },
      { unique: true, partialFilterExpression: { email: { $exists: true } } }
    );
  } catch (error) {
    const safeMessage = String(error?.message || "");
    const alreadyOk =
      error?.codeName === "IndexOptionsConflict" ||
      error?.codeName === "IndexKeySpecsConflict" ||
      safeMessage.includes("already exists");
    if (!alreadyOk) throw error;
  }
}

export async function connectDb() {
  if (!config.mongodbUri) return;

  mongoose.set("strictQuery", true);
  await mongoose.connect(config.mongodbUri);
  await ensureWeekPlanIndexes();
  await ensureShoppingListIndexes();
  await ensureKitchenUserEmailIndex();
  const match = config.mongodbUri.match(/\/([^/?]+)(\?|$)/);
  const dbName = match ? match[1] : "desconocida";
  console.log("MongoDB conectado");
  if (config.nodeEnv === "development") {
    console.log(`MongoDB DB: ${dbName}`);
  }
}
