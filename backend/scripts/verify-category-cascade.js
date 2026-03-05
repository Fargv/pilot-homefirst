import mongoose from "mongoose";
import { config } from "../src/config.js";
import { KitchenIngredient } from "../src/kitchen/models/KitchenIngredient.js";

async function run() {
  const [householdId, masterCategoryId, overrideCategoryId] = process.argv.slice(2);
  if (!householdId || !masterCategoryId || !overrideCategoryId) {
    throw new Error("Uso: node scripts/verify-category-cascade.js <householdId> <masterCategoryId> <overrideCategoryId>");
  }
  if (!config.mongodbUri) {
    throw new Error("MONGODB_URI no configurada.");
  }

  await mongoose.connect(config.mongodbUri);

  const [remainingMasterRefs, reassignedToOverride, masterOverridesForCategory] = await Promise.all([
    KitchenIngredient.countDocuments({
      householdId,
      scope: { $in: ["household", "override"] },
      categoryId: masterCategoryId
    }),
    KitchenIngredient.countDocuments({
      householdId,
      scope: { $in: ["household", "override"] },
      categoryId: overrideCategoryId
    }),
    KitchenIngredient.countDocuments({
      householdId,
      scope: "override",
      masterId: { $exists: true },
      categoryId: overrideCategoryId
    })
  ]);

  console.log(JSON.stringify({
    householdId,
    masterCategoryId,
    overrideCategoryId,
    remainingMasterRefs,
    reassignedToOverride,
    masterOverridesForCategory
  }, null, 2));
}

run()
  .then(() => mongoose.disconnect())
  .catch(async (error) => {
    console.error(error);
    await mongoose.disconnect().catch(() => {});
    process.exit(1);
  });

