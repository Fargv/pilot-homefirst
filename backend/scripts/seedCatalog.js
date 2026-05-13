import mongoose from "mongoose";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { resolveMongoUrl } from "./mongo-url.js";
import { applyCatalogPackValidation } from "../src/kitchen/catalogNormalization.js";

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
    status: {
      type: String,
      enum: ["draft", "needs_review", "ready", "published"],
      default: "needs_review",
      index: true
    },
    active: { type: Boolean, default: true },
    featured: { type: Boolean, default: false },
    priceBasic: { type: Number, default: 1.99 },
    includedPlans: { type: [String], default: ["pro", "premium"] },
    monthlyCreditCost: { type: Number, default: 1 },
    dishes: { type: mongoose.Schema.Types.Mixed, default: [] },
    releaseDate: { type: Date, default: null },
    freeUntil: { type: Date, default: null },
    activeFrom: { type: Date, default: null },
    activeUntil: { type: Date, default: null },
    color: { type: String, default: null },
    defaultSpecial: { type: Boolean, default: false },
    defaultAllowRandom: { type: Boolean, default: true },
    sortOrder: { type: Number, default: 0 },
    validationSummary: { type: mongoose.Schema.Types.Mixed, default: null },
    reviewIssues: { type: [mongoose.Schema.Types.Mixed], default: [] },
    normalizedAt: { type: Date, default: null },
    reviewedAt: { type: Date, default: null },
    publishedAt: { type: Date, default: null }
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
    console.error(`\nErrores de validacion en ${path.basename(filePath)}:`);
    errors.forEach((e) => console.error(`   - ${e}`));
    return false;
  }
  return true;
}

async function upsertPack(data) {
  const existing = await CatalogPack.findOne({ slug: data.slug });

  if (existing && existing.status === "published") {
    return { pack: existing, created: false, skippedPublished: true };
  }

  const result = existing || new CatalogPack({ slug: data.slug });

  // ── Campos de contenido: siempre se sincronizan desde el JSON ────────────
  // Añade aquí campos nuevos cuando los definas en el JSON del pack.
  result.title = data.title;
  result.subtitle = data.subtitle || "";
  result.description = data.description || "";
  result.tags = Array.isArray(data.tags) ? data.tags : [];
  result.cuisineType = data.cuisineType || "";
  result.dishes = Array.isArray(data.dishes) ? data.dishes : [];
  result.priceBasic = typeof data.priceBasic === "number" ? data.priceBasic : 1.99;
  result.includedPlans = Array.isArray(data.includedPlans) ? data.includedPlans : ["pro", "premium"];
  result.monthlyCreditCost = typeof data.monthlyCreditCost === "number" ? data.monthlyCreditCost : 1;
  result.defaultSpecial = Boolean(data.defaultSpecial);
  result.defaultAllowRandom = data.defaultAllowRandom !== false;
  result.sortOrder = typeof data.sortOrder === "number" ? data.sortOrder : 0;
  if (data.disclaimer !== undefined) result.disclaimer = data.disclaimer || "";
  if (data.isDietPack !== undefined) result.isDietPack = Boolean(data.isDietPack);
  if (data.dietLabel !== undefined) result.dietLabel = String(data.dietLabel || "").trim();

  // ── Campos gestionados por el admin: SOLO se aplican al crear el pack ────
  // Nunca se sobrescriben en packs ya existentes, aunque cambien en el JSON.
  // Para modificarlos usa el panel de administración.
  if (!existing) {
    result.active = data.active !== false;
    result.featured = Boolean(data.featured);
    if (data.coverImage != null) result.coverImage = data.coverImage;
    if (data.color != null) result.color = data.color;
    if (data.releaseDate) result.releaseDate = new Date(data.releaseDate);
    if (data.freeUntil) result.freeUntil = new Date(data.freeUntil);
    if (data.activeFrom) result.activeFrom = new Date(data.activeFrom);
    if (data.activeUntil) result.activeUntil = new Date(data.activeUntil);
  }

  await applyCatalogPackValidation(result, { autoApply: true });
  await result.save();

  return { pack: result, created: !existing, skippedPublished: false };
}

async function run() {
  const mongoUrl = resolveMongoUrl();
  await mongoose.connect(mongoUrl);
  console.log("Conexion MongoDB establecida para seed:catalog\n");

  const packsDir = path.resolve(__dirname, "../catalog-packs");

  if (!fs.existsSync(packsDir)) {
    console.error(`Directorio catalog-packs no encontrado: ${packsDir}`);
    process.exit(1);
  }

  const files = fs.readdirSync(packsDir).filter((f) => f.endsWith(".json"));

  if (files.length === 0) {
    console.log("No hay archivos JSON en catalog-packs/. Nada que importar.");
    await mongoose.disconnect();
    return;
  }

  console.log(`Procesando ${files.length} pack(s)...\n`);

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
      console.error(`Error al parsear ${file}: ${parseError.message}`);
      failed++;
      continue;
    }

    const valid = validatePackData(data, filePath);
    if (!valid) {
      failed++;
      continue;
    }

    try {
      const result = await upsertPack(data);
      if (result.skippedPublished) {
        console.log(`  Omitido: "${result.pack.title}" (${result.pack.slug}) ya esta publicado`);
        updated++;
      } else if (!result.created) {
        console.log(`  Actualizado: "${result.pack.title}" (${result.pack.slug}) [${result.pack.status}]`);
        updated++;
      } else {
        console.log(`  Insertado:   "${result.pack.title}" (${result.pack.slug}) [${result.pack.status}]`);
        inserted++;
      }
    } catch (dbError) {
      console.error(`Error al importar ${file}: ${dbError.message}`);
      failed++;
    }
  }

  console.log(`\n---------------------------------`);
  console.log(`Insertados: ${inserted}`);
  console.log(`Actualizados: ${updated}`);
  if (failed > 0) console.log(`Fallidos: ${failed}`);
  console.log(`---------------------------------`);

  await mongoose.disconnect();
}

run().catch((error) => {
  console.error("Error en seed:catalog:", error.message);
  process.exit(1);
});
