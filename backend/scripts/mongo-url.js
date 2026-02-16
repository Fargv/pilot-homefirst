import dotenv from "dotenv";

dotenv.config({ path: new URL("../.env", import.meta.url).pathname });

export function resolveMongoUrl() {
  const directUrl = process.env.MONGODB_URL || process.env.MONGODB_URI;
  if (directUrl) {
    logMongoTarget(directUrl, "MONGODB_URL/MONGODB_URI");
    return directUrl;
  }

  const user = process.env.MONGO_USER;
  const pass = process.env.MONGO_PASS;
  const host = process.env.MONGO_HOST;
  const db = process.env.MONGO_DB;

  if (!user || !pass || !host || !db) {
    throw new Error(
      "Faltan variables para construir MongoDB URL. Requiere MONGO_USER, MONGO_PASS, MONGO_HOST y MONGO_DB."
    );
  }

  const encodedPass = encodeURIComponent(pass);
  const runtimeUrl = `mongodb+srv://${user}:${encodedPass}@${host}/${db}?retryWrites=true&w=majority`;
  logMongoTarget(runtimeUrl, "variables separadas");
  return runtimeUrl;
}

function logMongoTarget(uri, source) {
  const hostMatch = uri.match(/@([^/?]+)|^mongodb(?:\+srv)?:\/\/([^:/?]+)/i);
  const host = hostMatch?.[1] || hostMatch?.[2] || "desconocido";
  const isSrv = uri.startsWith("mongodb+srv://");

  console.log(`ℹ️ Mongo URI source: ${source}`);
  console.log(`ℹ️ Mongo host: ${host}`);
  console.log(`ℹ️ Mongo SRV: ${isSrv ? "sí" : "no"}`);
}
