import process from "node:process";
import { MongoClient, ObjectId } from "mongodb";
import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Carga variables desde backend/.env (ESM compatible)
dotenv.config({ path: path.resolve(__dirname, "../.env") });

const MONGODB_URL = process.env.MONGODB_URL;
const ADMIN_EMAIL = (process.env.ADMIN_EMAIL || process.argv[2] || "")
  .trim()
  .toLowerCase();

const COLLECTION_CANDIDATES = {
  kitchenUsers: ["kitchenusers", "kitchenUsers", "users"],
  meals: ["kitchendishes", "kitchenDishes", "meals"],
  weekPlans: ["kitchenweekplans", "kitchenWeekPlans", "weekPlans"],
  ingredients: ["kitchenIngredients", "kitcheningredients", "ingredients"],
  shoppingLists: ["kitchenshoppinglists", "kitchenShoppingLists", "shoppingLists"],
  swaps: ["kitchenswaps", "kitchenSwaps", "swaps"],
  categories: ["categories"],
  auditLogs: ["kitchenauditlogs", "kitchenAuditLogs", "auditLogs"],
};

function buildHouseholdName(adminUser) {
  const preferredName =
    adminUser.firstName ||
    adminUser.displayName ||
    adminUser.name ||
    adminUser.username ||
    adminUser.email;

  return `Casa de ${preferredName}`;
}

async function resolveCollection(db, candidates) {
  for (const name of candidates) {
    const exists = await db
      .listCollections({ name }, { nameOnly: true })
      .hasNext();
    if (exists) return db.collection(name);
  }
  return null;
}

async function updateCollectionHouseholdId({ collection, label, householdId }) {
  if (!collection) {
    console.log(`⚠️  ${label}: colección no encontrada, se omite.`);
    return;
  }

  const result = await collection.updateMany(
    { householdId: { $exists: false } },
    { $set: { householdId } }
  );

  console.log(`✅ ${label}: matched=${result.matchedCount}, modified=${result.modifiedCount}`);
}

async function main() {
  if (!MONGODB_URL) {
    throw new Error("Falta MONGODB_URL en variables de entorno (backend/.env).");
  }

  if (!ADMIN_EMAIL) {
    throw new Error("Falta ADMIN_EMAIL. Defínelo en backend/.env o pásalo como argumento.");
  }

  const client = new MongoClient(MONGODB_URL);

  try {
    await client.connect();
    const db = client.db();

    console.log("🔎 Buscando usuario admin por email...", ADMIN_EMAIL);

    const usersCollection = await resolveCollection(db, COLLECTION_CANDIDATES.kitchenUsers);
    if (!usersCollection) throw new Error("No se encontró la colección de usuarios.");

    // Intento 1: email + role=admin
    let adminUser = await usersCollection.findOne({ email: ADMIN_EMAIL, role: "admin" });

    // Intento 2 (fallback): email a secas (por si el rol es distinto o no existe)
    if (!adminUser) {
      adminUser = await usersCollection.findOne({ email: ADMIN_EMAIL });
    }

    if (!adminUser) {
      throw new Error(`No se encontró usuario con email=${ADMIN_EMAIL} en la colección de usuarios.`);
    }

    console.log(`✅ Usuario encontrado: _id=${adminUser._id}`);

    const householdsCollection = db.collection("households");

    let householdId = adminUser.householdId;

    // Normaliza householdId si existe
    if (householdId) {
      if (!(householdId instanceof ObjectId) && ObjectId.isValid(householdId)) {
        householdId = new ObjectId(householdId);
      }
      console.log(`ℹ️  El usuario ya tiene householdId=${householdId}. No se crea uno nuevo.`);
    } else {
      const householdDoc = {
        name: buildHouseholdName(adminUser),
        ownerUserId: adminUser._id,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      const householdInsert = await householdsCollection.insertOne(householdDoc);
      householdId = householdInsert.insertedId;

      console.log(`✅ Household creado: _id=${householdId}`);

      const adminUpdate = await usersCollection.updateOne(
        { _id: adminUser._id, householdId: { $exists: false } },
        { $set: { householdId } }
      );

      console.log(`✅ Usuario actualizado: matched=${adminUpdate.matchedCount}, modified=${adminUpdate.modifiedCount}`);
    }

    // Primero usuarios
    await updateCollectionHouseholdId({
      collection: usersCollection,
      label: "kitchenUsers",
      householdId,
    });

    // Resto de colecciones candidatas
    for (const [label, candidates] of Object.entries(COLLECTION_CANDIDATES)) {
      if (label === "kitchenUsers") continue;
      const collection = await resolveCollection(db, candidates);
      await updateCollectionHouseholdId({ collection, label, householdId });
    }

    console.log("🎉 Migración finalizada sin borrar ni sobrescribir householdId existentes.");
  } finally {
    await client.close();
    console.log("🔌 Conexión MongoDB cerrada.");
  }
}

main().catch((error) => {
  console.error("❌ Error en migración:", error.message);
  process.exitCode = 1;
});
