import mongoose from "mongoose";
import { resolveMongoUrl } from "./mongo-url.js";

async function run() {
  const mongoUrl = resolveMongoUrl();

  await mongoose.connect(mongoUrl);
  console.log("✅ Conexión MongoDB establecida para create-diod");

  // TODO: Agregar lógica create-diod.
  console.log("ℹ️ Script create-diod listo para ejecutar operaciones.");

  await mongoose.disconnect();
}

run().catch((error) => {
  console.error("❌ Error en create-diod:", error.message);
  process.exit(1);
});
