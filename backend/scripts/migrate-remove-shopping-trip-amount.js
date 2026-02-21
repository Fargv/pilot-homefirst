import mongoose from "mongoose";
import { resolveMongoUrl } from "./mongo-url.js";
import { ShoppingTrip } from "../src/kitchen/models/ShoppingTrip.js";

async function run() {
  const mongoUrl = resolveMongoUrl();
  await mongoose.connect(mongoUrl);

  const result = await ShoppingTrip.updateMany(
    {
      $or: [
        { totalAmount: { $exists: true } },
        { currency: { $exists: true } }
      ]
    },
    {
      $unset: {
        totalAmount: "",
        currency: ""
      }
    }
  );

  console.log("✅ ShoppingTrip amount fields eliminados");
  console.log(
    JSON.stringify(
      {
        matched: result.matchedCount,
        modified: result.modifiedCount
      },
      null,
      2
    )
  );

  await mongoose.disconnect();
}

run().catch(async (error) => {
  console.error("❌ Error en migrate-remove-shopping-trip-amount:", error.message);
  await mongoose.disconnect();
  process.exit(1);
});
