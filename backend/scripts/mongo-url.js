import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Carga backend/.env de forma robusta (Windows-safe)
dotenv.config({ path: path.resolve(__dirname, "../.env") });

// Debug útil (temporal)
console.log("ℹ️ dotenv path:", path.resolve(__dirname, "../.env"));
console.log("ℹ️ MONGODB_URL present:", Boolean(process.env.MONGODB_URL));
console.log("ℹ️ MONGODB_URI present:", Boolean(process.env.MONGODB_URI));


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
  const isSrv = uri.startsWith("mongodb+srv://");
  let host = "desconocido";

  try {
    if (isSrv) {
      // URL() no soporta mongodb+srv, parse manual suave
      const at = uri.split("@")[1];
      host = at ? at.split("/")[0] : "desconocido";
    } else {
      const u = new URL(uri);
      host = u.host; // si hay lista de hosts, u.host puede no ser perfecto, pero vale para log
    }
  } catch {
    const at = uri.split("@")[1];
    host = at ? at.split("/")[0] : "desconocido";
  }

  console.log(`ℹ️ Mongo URI source: ${source}`);
  console.log(`ℹ️ Mongo host(s): ${host}`);
  console.log(`ℹ️ Mongo SRV: ${isSrv ? "sí" : "no"}`);
}

