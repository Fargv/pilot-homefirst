import mongoose from "mongoose";
import { config } from "../src/config.js";
import { KitchenUser } from "../src/kitchen/models/KitchenUser.js";

async function run() {
  if (!config.mongodbUri) {
    throw new Error("MONGODB_URI no configurada.");
  }

  await mongoose.connect(config.mongodbUri);
  console.log("Conectado a MongoDB.");

  const cleanResult = await KitchenUser.updateMany(
    { email: { $in: ["", null] } },
    { $unset: { email: 1 } }
  );
  console.log(`Emails vacíos/null limpiados: ${cleanResult.modifiedCount}`);

  const collection = mongoose.connection.collection("kitchenusers");
  const indexes = await collection.indexes();
  const emailIndexes = indexes.filter((index) => index.key && index.key.email === 1);

  for (const index of emailIndexes) {
    if (index.name !== "email_1") continue;
    await collection.dropIndex(index.name);
    console.log(`Índice eliminado: ${index.name}`);
  }

  await collection.createIndex(
    { email: 1 },
    { unique: true, partialFilterExpression: { email: { $type: "string", $ne: "" } } }
  );
  console.log("Índice parcial único de email creado.");
}

run()
  .then(() => {
    console.log("Migración completada.");
    return mongoose.disconnect();
  })
  .catch(async (error) => {
    console.error("Error en migración:", error);
    await mongoose.disconnect().catch(() => {});
    process.exit(1);
  });

