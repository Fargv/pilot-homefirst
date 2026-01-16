import mongoose from "mongoose";
import { config } from "./config.js";

export async function connectDb() {
  if (!config.mongodbUri) return;

  mongoose.set("strictQuery", true);
  await mongoose.connect(config.mongodbUri);
  console.log("✅ MongoDB conectado");
}
