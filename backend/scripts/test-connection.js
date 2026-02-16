import mongoose from "mongoose";
import { resolveMongoUrl } from "./mongo-url.js";

async function run() {
  const mongoUrl = resolveMongoUrl();

  await mongoose.connect(mongoUrl);
  console.log("✅ Conexión de prueba MongoDB OK");

  await mongoose.disconnect();
}

run().catch((error) => {
  console.error("❌ Falló test de conexión MongoDB:", error.message);
  process.exit(1);
});
