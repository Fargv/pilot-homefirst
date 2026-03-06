import mongoose from "mongoose";
import { resolveMongoUrl } from "./mongo-url.js";
import { KitchenUser } from "../src/kitchen/models/KitchenUser.js";

function missingBoolean(field) {
  return {
    $or: [
      { [field]: { $exists: false } },
      { [field]: null }
    ]
  };
}

async function run() {
  const mongoUrl = resolveMongoUrl();
  await mongoose.connect(mongoUrl);
  console.log("Connected to MongoDB for migrate-user-flags");

  const activeResult = await KitchenUser.updateMany(
    missingBoolean("active"),
    { $set: { active: true } }
  );

  const placeholderCanCookResult = await KitchenUser.updateMany(
    {
      $and: [
        { $or: [{ isPlaceholder: true }, { type: "placeholder" }] },
        missingBoolean("canCook")
      ]
    },
    { $set: { canCook: false } }
  );

  const realUserCanCookResult = await KitchenUser.updateMany(
    {
      $and: [
        { $nor: [{ isPlaceholder: true }, { type: "placeholder" }] },
        missingBoolean("canCook")
      ]
    },
    { $set: { canCook: true } }
  );

  console.log(
    `active -> matched=${activeResult.matchedCount} modified=${activeResult.modifiedCount}`
  );
  console.log(
    `canCook placeholders -> matched=${placeholderCanCookResult.matchedCount} modified=${placeholderCanCookResult.modifiedCount}`
  );
  console.log(
    `canCook real users -> matched=${realUserCanCookResult.matchedCount} modified=${realUserCanCookResult.modifiedCount}`
  );

  await mongoose.disconnect();
  console.log("Migration finished.");
}

run().catch(async (error) => {
  console.error("Migration failed:", error.message);
  try {
    await mongoose.disconnect();
  } catch {
    // noop
  }
  process.exit(1);
});
