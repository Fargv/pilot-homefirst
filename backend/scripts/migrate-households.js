import mongoose from "mongoose";
import { resolveMongoUrl } from "./mongo-url.js";

async function run() {
  const mongoUrl = resolveMongoUrl();

  await mongoose.connect(mongoUrl);
  console.log("✅ Conexión MongoDB establecida para migrate-households");

  // TODO: Agregar pasos de migración de households.
  console.log("ℹ️ No hay migraciones pendientes en este script.");

  await mongoose.disconnect();
}

run().catch((error) => {
  console.error("❌ Error en migrate-households:", error.message);
  process.exit(1);
});
