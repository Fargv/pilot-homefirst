import mongoose from "mongoose";
import { resolveMongoUrl } from "./mongo-url.js";
import { KitchenShoppingList } from "../src/kitchen/models/KitchenShoppingList.js";
import { resolveShoppingItemIngredientData } from "../src/kitchen/shoppingService.js";

async function run() {
  const mongoUrl = resolveMongoUrl();
  await mongoose.connect(mongoUrl);

  const lists = await KitchenShoppingList.find({}).sort({ updatedAt: -1 });
  let fixedLists = 0;
  let fixedItems = 0;

  for (const list of lists) {
    const before = list.items.map((item) => item.toObject());
    const { changed, resolvedItems } = await resolveShoppingItemIngredientData(before, list.householdId);
    if (!changed) continue;

    let changedCount = 0;
    resolvedItems.forEach((item, index) => {
      const prev = before[index];
      if (
        String(prev.ingredientId || "") !== String(item.ingredientId || "") ||
        String(prev.categoryId || "") !== String(item.categoryId || "")
      ) {
        changedCount += 1;
      }
    });

    list.items = resolvedItems;
    await list.save();
    fixedLists += 1;
    fixedItems += changedCount;
  }

  console.log("✅ Repair shopping list completado");
  console.log(JSON.stringify({ scannedLists: lists.length, fixedLists, fixedItems }, null, 2));
  await mongoose.disconnect();
}

run().catch(async (error) => {
  console.error("❌ Error en repair-shopping-list-items:", error.message);
  await mongoose.disconnect();
  process.exit(1);
});
