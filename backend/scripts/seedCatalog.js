import mongoose from "mongoose";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { resolveMongoUrl } from "./mongo-url.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const CatalogPackSchema = new mongoose.Schema(
  {
    slug: { type: String, required: true, unique: true, trim: true, lowercase: true },
    title: { type: String, required: true, trim: true },
    subtitle: { type: String, default: "" },
    description: { type: String, default: "" },
    coverImage: { type: String, default: null },
    tags: { type: [String], default: [] },
    cuisineType: { type: String, default: "" },
    active: { type: Boolean, default: true },
    featured: { type: Boolean, default: false },
    priceBasic: { type: Number, default: 1.99 },
    includedPlans: { type: [String], default: ["pro", "premium"] },
    monthlyCreditCost: { type: Number, default: 1 },
    dishes: { type: mongoose.Schema.Types.Mixed, default: [] },
    releaseDate: { type: Date, default: null },
    sortOrder: { type: Number, default: 0 }
  },
  { timestamps: true }
);

const CatalogPack = mongoose.models.CatalogPack || mongoose.model("CatalogPack", CatalogPackSchema);

function validatePackData(data, filePath) {
  const errors = [];
  if (!data.slug || typeof data.slug !== "string") errors.push("slug es obligatorio y debe ser texto.");
  if (!data.title || typeof data.title !== "string") errors.push("title es obligatorio y debe ser texto.");
  if (!Array.isArray(data.dishes)) errors.push("dishes debe ser un array.");
  else {
    data.dishes.forEach((dish, index) => {
      if (!dish.name || typeof dish.name !== "string") {
        errors.push(`dishes[${index}]: name es obligatorio.`);
      }
      if (!Array.isArray(dish.ingredients)) {
        errors.push(`dishes[${index}]: ingredients debe ser un array.`);
      } else {
        dish.ingredients.forEach((ing, iIdx) => {
          if (!ing.displayName) errors.push(`dishes[${index}].ingredients[${iIdx}]: displayName es obligatorio.`);
          if (!ing.canonicalName) errors.push(`dishes[${index}].ingredients[${iIdx}]: canonicalName es obligatorio.`);
        });
      }
    });
  }

  if (errors.length > 0) {
    console.error(`\n❌ Errores de validación en ${path.basename(filePath)}:`);
    errors.forEach((e) => console.error(`   - ${e}`));
    return false;
  }
  return true;
}

async function upsertPack(data) {
  const update = {
    title: data.title,
    subtitle: data.subtitle || "",
    description: data.description || "",
    coverImage: data.coverImage || null,
    tags: Array.isArray(data.tags) ? data.tags : [],
    cuisineType: data.cuisineType || "",
    active: data.active !== false,
    featured: Boolean(data.featured),
    priceBasic: typeof data.priceBasic === "number" ? data.priceBasic : 1.99,
    includedPlans: Array.isArray(data.includedPlans) ? data.includedPlans : ["pro", "premium"],
    monthlyCreditCost: typeof data.monthlyCreditCost === "number" ? data.monthlyCreditCost : 1,
    dishes: Array.isArray(data.dishes) ? data.dishes : [],
    releaseDate: data.releaseDate ? new Date(data.releaseDate) : null,
    sortOrder: typeof data.sortOrder === "number" ? data.sortOrder : 0
  };

  const result = await CatalogPack.findOneAndUpdate(
    { slug: data.slug },
    { $set: update },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  );

  return result;
}

async function run() {
  const mongoUrl = resolveMongoUrl();
  await mongoose.connect(mongoUrl);
  console.log("✅ Conexión MongoDB establecida para seed:catalog\n");

  const packsDir = path.resolve(__dirname, "../catalog-packs");

  if (!fs.existsSync(packsDir)) {
    console.error(`❌ Directorio catalog-packs no encontrado: ${packsDir}`);
    process.exit(1);
  }

  const files = fs.readdirSync(packsDir).filter((f) => f.endsWith(".json"));

  if (files.length === 0) {
    console.log("ℹ️ No hay archivos JSON en catalog-packs/. Nada que importar.");
    await mongoose.disconnect();
    return;
  }

  console.log(`📦 Procesando ${files.length} pack(s)...\n`);

  let inserted = 0;
  let updated = 0;
  let failed = 0;

  for (const file of files) {
    const filePath = path.join(packsDir, file);
    let data;

    try {
      const raw = fs.readFileSync(filePath, "utf-8");
      data = JSON.parse(raw);
    } catch (parseError) {
      console.error(`❌ Error al parsear ${file}: ${parseError.message}`);
      failed++;
      continue;
    }

    const valid = validatePackData(data, filePath);
    if (!valid) {
      failed++;
      continue;
    }

    try {
      const existing = await CatalogPack.findOne({ slug: data.slug }).lean();
      const result = await upsertPack(data);
      if (existing) {
        console.log(`  ↻  Actualizado: "${result.title}" (${result.slug})`);
        updated++;
      } else {
        console.log(`  ✚  Insertado:   "${result.title}" (${result.slug})`);
        inserted++;
      }
    } catch (dbError) {
      console.error(`❌ Error al importar ${file}: ${dbError.message}`);
      failed++;
    }
  }

  console.log(`\n─────────────────────────────────`);
  console.log(`✅ Insertados: ${inserted}`);
  console.log(`♻  Actualizados: ${updated}`);
  if (failed > 0) console.log(`❌ Fallidos: ${failed}`);
  console.log(`─────────────────────────────────`);

  await mongoose.disconnect();
}

run().catch((error) => {
  console.error("❌ Error en seed:catalog:", error.message);
  process.exit(1);
});
