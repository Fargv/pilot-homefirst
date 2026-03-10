import mongoose from "mongoose";
import { config } from "./config.js";
import { ensureStarterMasterDishes } from "./kitchen/bootstrap/masterDishes.js";

function isNamespaceNotFoundError(error) {
  return error?.codeName === "NamespaceNotFound" || error?.code === 26;
}

async function getCollectionIndexesSafe(collection, collectionName) {
  try {
    return await collection.indexes();
  } catch (error) {
    if (!isNamespaceNotFoundError(error)) throw error;

    console.warn(`[db] Collection ${collectionName} does not exist yet. Skipping legacy index inspection.`);
    return [];
  }
}

async function createIndexSafe(collection, collectionName, keys, options) {
  try {
    await collection.createIndex(keys, options);
  } catch (error) {
    const safeMessage = String(error?.message || "");
    const alreadyOk =
      error?.codeName === "IndexOptionsConflict" ||
      error?.codeName === "IndexKeySpecsConflict" ||
      safeMessage.includes("already exists");

    if (alreadyOk) return;
    throw error;
  }
}

async function ensureScopedWeekStartIndex(collectionName) {
  const collection = mongoose.connection.collection(collectionName);
  const indexes = await getCollectionIndexesSafe(collection, collectionName);
  const legacyWeekStartIndex = indexes.find(
    (index) => index.unique && index.key && Object.keys(index.key).length === 1 && index.key.weekStart === 1
  );

  if (legacyWeekStartIndex) {
    await collection.dropIndex(legacyWeekStartIndex.name);
    console.log(`Index legado eliminado en ${collectionName}: ${legacyWeekStartIndex.name}`);
  }

  await createIndexSafe(
    collection,
    collectionName,
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
  const indexes = await getCollectionIndexesSafe(collection, "kitchenusers");
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

  await createIndexSafe(
    collection,
    "kitchenusers",
    { email: 1 },
    { unique: true, partialFilterExpression: { email: { $exists: true } } }
  );
}

export async function connectDb() {
  if (!config.mongodbUri) return;

  mongoose.set("strictQuery", true);
  await mongoose.connect(config.mongodbUri);
  await ensureWeekPlanIndexes();
  await ensureShoppingListIndexes();
  await ensureKitchenUserEmailIndex();
  const masterDishSeed = await ensureStarterMasterDishes();
  const match = config.mongodbUri.match(/\/([^/?]+)(\?|$)/);
  const dbName = match ? match[1] : "desconocida";
  console.log("MongoDB conectado");
  if (masterDishSeed.createdCount > 0) {
    console.log(`[db] Seeded ${masterDishSeed.createdCount} starter master dishes.`);
  }
  if (config.nodeEnv === "development") {
    console.log(`MongoDB DB: ${dbName}`);
  }
}
