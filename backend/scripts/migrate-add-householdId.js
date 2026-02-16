import mongoose from "mongoose";
import { resolveMongoUrl } from "./mongo-url.js";
import { KitchenUser } from "../src/kitchen/models/KitchenUser.js";
import { Household } from "../src/kitchen/models/Household.js";
import { Category } from "../src/kitchen/models/Category.js";
import { KitchenIngredient } from "../src/kitchen/models/KitchenIngredient.js";
import { KitchenDish } from "../src/kitchen/models/KitchenDish.js";
import { KitchenWeekPlan } from "../src/kitchen/models/KitchenWeekPlan.js";
import { KitchenShoppingList } from "../src/kitchen/models/KitchenShoppingList.js";
import { KitchenSwap } from "../src/kitchen/models/KitchenSwap.js";
import { KitchenAuditLog } from "../src/kitchen/models/KitchenAuditLog.js";

const COLLECTIONS_TO_MIGRATE = [
  { name: "KitchenUser", model: KitchenUser },
  { name: "Category", model: Category },
  { name: "KitchenIngredient", model: KitchenIngredient },
  { name: "KitchenDish", model: KitchenDish },
  { name: "KitchenWeekPlan", model: KitchenWeekPlan },
  { name: "KitchenShoppingList", model: KitchenShoppingList },
  { name: "KitchenSwap", model: KitchenSwap },
  { name: "KitchenAuditLog", model: KitchenAuditLog }
];

function buildOwnerDisplayName(owner) {
  return (
    owner.displayName ||
    [owner.firstName, owner.lastName].filter(Boolean).join(" ").trim() ||
    owner.username ||
    owner.email ||
    "Owner"
  );
}

async function resolveOwnerUser() {
  const adminEmail = process.env.ADMIN_EMAIL?.trim().toLowerCase();

  if (adminEmail) {
    const ownerByEmail = await KitchenUser.findOne({ email: adminEmail });
    if (ownerByEmail) {
      console.log(`ℹ️ Owner seleccionado por ADMIN_EMAIL: ${ownerByEmail.email}`);
      return ownerByEmail;
    }

    console.log(`⚠️ ADMIN_EMAIL no encontrado (${adminEmail}). Se usará el primer usuario.`);
  }

  const firstUser = await KitchenUser.findOne().sort({ createdAt: 1, _id: 1 });
  if (!firstUser) {
    throw new Error("No hay usuarios para ejecutar la migración.");
  }

  console.log(`ℹ️ Owner seleccionado por fallback: ${firstUser.email}`);
  return firstUser;
}

async function ensureOwnerHousehold(owner) {
  if (owner.householdId) {
    const existing = await Household.findById(owner.householdId);
    if (existing) {
      console.log(`ℹ️ El owner ya tiene householdId (${owner.householdId}).`);
      return existing;
    }

    console.log("⚠️ householdId del owner no existe en Household. Se resolverá uno válido.");
  }

  let household = await Household.findOne({ ownerUserId: owner._id }).sort({ createdAt: 1, _id: 1 });

  if (!household) {
    const ownerName = buildOwnerDisplayName(owner);
    household = await Household.create({
      name: `Casa de ${ownerName}`,
      ownerUserId: owner._id
    });
    console.log(`✅ Household creado: ${household.name} (${household._id})`);
  } else {
    console.log(`ℹ️ Household existente para owner: ${household.name} (${household._id})`);
  }

  if (!owner.householdId || owner.householdId.toString() !== household._id.toString()) {
    owner.householdId = household._id;
    await owner.save();
    console.log(`✅ householdId asignado al owner: ${owner.email} -> ${household._id}`);
  }

  return household;
}

async function migrateCollections(householdId) {
  for (const { name, model } of COLLECTIONS_TO_MIGRATE) {
    const result = await model.updateMany(
      { householdId: { $exists: false } },
      { $set: { householdId } }
    );

    console.log(
      `• ${name} (${model.collection.name}): matched=${result.matchedCount} modified=${result.modifiedCount}`
    );
  }
}

async function run() {
  const mongoUrl = resolveMongoUrl();

  await mongoose.connect(mongoUrl);
  console.log("✅ Conexión MongoDB establecida para migrate-add-householdId");

  const owner = await resolveOwnerUser();
  const household = await ensureOwnerHousehold(owner);

  await migrateCollections(household._id);

  await mongoose.disconnect();
  console.log("✅ Migración completada.");
}

run().catch(async (error) => {
  console.error("❌ Error en migrate-add-householdId:", error.message);
  try {
    await mongoose.disconnect();
  } catch {
    // noop
  }
  process.exit(1);
});
