import mongoose from "mongoose";
import { config } from "./config.js";

export async function connectDb() {
  if (!config.mongodbUri) return;

  mongoose.set("strictQuery", true);
  await mongoose.connect(config.mongodbUri);
  const match = config.mongodbUri.match(/\/([^/?]+)(\?|$)/);
  const dbName = match ? match[1] : "desconocida";
  console.log("✅ MongoDB conectado");
  if (config.nodeEnv === "development") {
    console.log(`🔎 MongoDB DB: ${dbName}`);
  }
}
