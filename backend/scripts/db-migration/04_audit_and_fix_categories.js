/**
 * 04_audit_and_fix_categories.js
 * ─────────────────────────────────────────────────────────────────────────────
 * AUDITORÍA + FIX de categorías en el catálogo master.
 *
 * Detecta y corrige:
 *   1. kitchendishcategories sin scope:"master"  (Especial, Marisco, etc.)
 *   2. kitchendishes (scope:master) sin dishCategoryId o con ID inválido
 *   3. kitcheningredients (scope:master) sin categoryId o con ID inválido
 *   4. kitcheningredients en la categoría "Otros" → sugerencia de reasignación
 *
 * USAGE:
 *   node --experimental-vm-modules 04_audit_and_fix_categories.js           # dry-run / audit
 *   node --experimental-vm-modules 04_audit_and_fix_categories.js --apply   # aplica los fixes
 */

import { MongoClient, ObjectId } from "mongodb";
import { resolveMongoUrl } from "../mongo-url.js";

const APPLY = process.argv.includes("--apply");
const NOW   = new Date();

// ─── Colores ─────────────────────────────────────────────────────────────────
const G = "\x1b[32m", Y = "\x1b[33m", R = "\x1b[31m", C = "\x1b[36m", B = "\x1b[1m", X = "\x1b[0m";

// ─── Categorías de ingredientes (shopping categories) ─────────────────────────
// ID → nombre para logging
const INGREDIENT_CATS = {
  "699b7eec8deb38b04dd3015e": "Frutas y Verduras",
  "699b7eec8deb38b04dd3015f": "Carnicería",
  "699b7eec8deb38b04dd30160": "Pescadería",
  "699b7eec8deb38b04dd30161": "Charcutería",
  "699b7eec8deb38b04dd30162": "Lácteos y Huevos",
  "699b7eec8deb38b04dd30163": "Panadería y Bollería",
  "699b7eec8deb38b04dd30164": "Platos Preparados",
  "699b7eec8deb38b04dd30165": "Congelados",
  "699b7eec8deb38b04dd30166": "Conservas",
  "699b7eec8deb38b04dd30167": "Pasta, Arroz y Legumbres",
  "699b7eec8deb38b04dd30168": "Aceites, Salsas y Condimentos",
  "699b7eec8deb38b04dd30169": "Desayuno y Cereales",
  "699b7eec8deb38b04dd3016a": "Galletas y Dulces",
  "699b7eec8deb38b04dd3016b": "Snacks y Aperitivos",
  "699b7eec8deb38b04dd3016c": "Bebidas",
  "699b7eec8deb38b04dd3016d": "Bodega",
  "699b7eec8deb38b04dd3016e": "Internacional",
  "699b7eec8deb38b04dd3016f": "Bio / Dietética",
  "699b7eec8deb38b04dd30170": "Limpieza del Hogar",
  "699b7eec8deb38b04dd30171": "Papel y Celulosa",
  "699b7eec8deb38b04dd30172": "Higiene Personal",
  "699b7eec8deb38b04dd30173": "Parafarmacia",
  "699b7eec8deb38b04dd30174": "Bebé",
  "699b7eec8deb38b04dd30175": "Mascotas",
  "699b7eec8deb38b04dd30176": "Menaje y Conservación",
  "699b7eec8deb38b04dd30177": "Textil Hogar",
  "699b7eec8deb38b04dd30178": "Papelería",
  "699b7eec8deb38b04dd30179": "Pilas y Bombillas",
  "699b7eec8deb38b04dd3017a": "Temporada / Promociones",
  "699b7eec8deb38b04dd3017b": "Otros",
  // Categorías añadidas en migración 05
  "6a6b0001000000000000aa01": "Hierbas Aromáticas",
  "6a6b0001000000000000aa02": "Barbacoa y Ahumados",
  // Categorías nuevas presentes en DEV (Frescos, Conservas Vegetales, Conservas de Pescado)
  "6a0d6ba46bc1c78cef0bffca": "Frescos",
  "6a1463590020972675cc5ce5": "Conservas Vegetales",
  "6a1463820020972675cc5ce9": "Conservas de Pescado",
};
const CAT_OTROS_ID = "699b7eec8deb38b04dd3017b";

// ─── Reglas de re-categorización de ingredientes ─────────────────────────────
// Si el nombre (lowercase) contiene la clave → asignar esa categoryId
const INGREDIENT_REMAP_RULES = [
  // Carnicería
  { match: /pollo|pavo|ternera|cerdo|cordero|conejo|bacon|chorizo|salchicha|morcilla|pato|jabalí|codorniz|jamón|lacón|hamburguesa de pollo|hamburguesa de ternera|hamburguesa/i, cat: "699b7eec8deb38b04dd3015f" },
  // Pescadería
  { match: /atún|salmón|merluza|bacalao|anchoas|boquerones|trucha|dorada|lubina|calamares|pulpo|gambas|mejillones|almejas|berberechos|sardinas|caballa|pescado|mariscos/i, cat: "699b7eec8deb38b04dd30160" },
  // Charcutería
  { match: /jamón serrano|jamón ibérico|fuet|salchichón|mortadela|lacon/i, cat: "699b7eec8deb38b04dd30161" },
  // Lácteos y Huevos
  { match: /leche|yogur|queso|nata|mantequilla|requesón|huevo|burrata|quesito/i, cat: "699b7eec8deb38b04dd30162" },
  // Panadería
  { match: /pan |pan$|pan rallado|pan brioche|tortilla|harina|levadura|bicarbonato/i, cat: "699b7eec8deb38b04dd30163" },
  // Congelados
  { match: /congelad/i, cat: "699b7eec8deb38b04dd30165" },
  // Pasta Arroz Legumbres
  { match: /pasta|arroz|cuscús|bulgur|avena|garbanzos|lentejas|alubias|judías$|guisantes|habas|tortillas|ñoquis/i, cat: "699b7eec8deb38b04dd30167" },
  // Aceites Salsas Condimentos
  { match: /aceite|vinagre|salsa|mostaza|mayonesa|kétchup|caldo|pimienta|pimentón|comino|orégano|tomillo|romero|laurel|curry|canela|nuez moscada|azafrán|vainilla|sal |^sal$|eneldo|chipotle|ras al|sriracha|miso|pesto/i, cat: "699b7eec8deb38b04dd30168" },
  // Internacional
  { match: /kimchi|chucrut|tempeh|tofu|mango chutney|edamame/i, cat: "699b7eec8deb38b04dd3016e" },
  // Galletas y Dulces
  { match: /azúcar|miel|harina de maíz|chocolate/i, cat: "699b7eec8deb38b04dd3016a" },
  // Snacks y Aperitivos
  { match: /almendras|nueces|avellanas|pistachos|piñones|cacahuetes|semillas/i, cat: "699b7eec8deb38b04dd3016b" },
  // Bebidas
  { match: /agua|café|té$/i, cat: "699b7eec8deb38b04dd3016c" },
  // Frutas y Verduras (fallback vegetal)
  { match: /patata|batata|cebolla|ajo|pimiento|tomate|pepino|calabacín|berenjena|zanahoria|puerro|apio|judías verdes|espinacas|acelgas|lechuga|col$|coliflor|brócoli|setas|champiñones|calabaza|espárragos|alcachofas|remolacha|maíz|manzana|plátano|naranja|limón|mandarina|pera|uvas|fresas|melón|sandía|melocotón|albaricoque|ciruelas|cerezas|piña|mango|aguacate|aceitunas|chiles|habaneros/i, cat: "699b7eec8deb38b04dd3015e" },
];

function suggestIngredientCategory(name) {
  const n = name.toLowerCase();
  for (const rule of INGREDIENT_REMAP_RULES) {
    if (rule.match.test(n)) return rule.cat;
  }
  return null;
}

// ─── Dish category mapping por nombre de plato ────────────────────────────────
// IDs de kitchendishcategories
const DISH_CAT = {
  carne:      "69ac442ac0755cd97c6a9b5a",
  pollo_aves: "69ac442ac0755cd97c6a9b5b",
  pescado:    "69ac442ac0755cd97c6a9b5c",
  legumbres:  "69ac442ac0755cd97c6a9b5d",
  pasta:      "69ac442ac0755cd97c6a9b5e",
  arroz:      "69ac442ac0755cd97c6a9b5f",
  verduras:   "69ac442ac0755cd97c6a9b60",
  huevos:     "69ac442ac0755cd97c6a9b61",
  guarniciones: "69ac442ac0755cd97c6a9b63",
  especial:   "69ac70b1d23659ad70fcf948",
};

const DISH_CATEGORY_RULES = [
  { match: /pollo|pavo|cuscús|codorniz/i,                     cat: DISH_CAT.pollo_aves },
  { match: /pasta|spaghetti|macarron|lasaña|carbonara|boloñes/i, cat: DISH_CAT.pasta },
  { match: /arroz/i,                                           cat: DISH_CAT.arroz },
  { match: /salmón|merluza|bacalao|atún|lubina|dorada|pescado|gambas|mejillones|sepia|calamares/i, cat: DISH_CAT.pescado },
  { match: /garbanzos|lentejas|alubias|judías verdes|fabada|cocido/i, cat: DISH_CAT.legumbres },
  { match: /verdura|brócoli|coliflor|espinacas|alcachofas|ratatouille|pisto/i, cat: DISH_CAT.verduras },
  { match: /huevo|tortilla|revuelto|frittata/i,               cat: DISH_CAT.huevos },
  { match: /hamburguesa|carne|ternera|cerdo|cordero|morcilla|salchicha|chorizo|costilla|chuleta|lomo|filete|pastel de carne|san jacobo/i, cat: DISH_CAT.carne },
  { match: /ensalada|guarnición|patatas fritas|puré/i,        cat: DISH_CAT.guarniciones },
];

function suggestDishCategory(dishName, ingredientNames = []) {
  const text = (dishName + " " + ingredientNames.join(" ")).toLowerCase();
  for (const rule of DISH_CATEGORY_RULES) {
    if (rule.match.test(text)) return rule.cat;
  }
  return null;
}

// ─── MAIN ──────────────────────────────────────────────────────────────────────
async function main() {
  console.log(`\n${B}╔══════════════════════════════════════════════════════════════╗${X}`);
  console.log(`${B}║   04 — Auditoría + Fix de categorías master                  ║${X}`);
  console.log(`${B}╚══════════════════════════════════════════════════════════════╝${X}\n`);

  const url    = resolveMongoUrl();
  const client = new MongoClient(url);
  await client.connect();
  const db = client.db();

  const dishCatCol    = db.collection("kitchendishcategories");
  const dishCol       = db.collection("kitchendishes");
  const ingredientCol = db.collection("kitcheningredients");
  const categoryCol   = db.collection("categories");

  let totalFixes = 0;

  // ── 1. kitchendishcategories sin scope:"master" ─────────────────────────────
  console.log(`${B}── 1. kitchendishcategories sin scope:"master" ──────────────────${X}`);
  const dishCatsWithoutScope = await dishCatCol.find({
    $or: [{ scope: { $exists: false } }, { scope: { $ne: "master" } }]
  }).toArray();

  if (dishCatsWithoutScope.length === 0) {
    console.log(`  ${G}✓ Todas tienen scope:master${X}`);
  } else {
    for (const dc of dishCatsWithoutScope) {
      console.log(`  ${Y}⚠ "${dc.name}" [${dc._id}] → scope: ${dc.scope ?? "undefined"}${X}`);
      if (APPLY) {
        await dishCatCol.updateOne({ _id: dc._id }, { $set: { scope: "master", updatedAt: NOW } });
        console.log(`    ${G}✓ scope:master asignado${X}`);
        totalFixes++;
      }
    }
    if (!APPLY) console.log(`  ${Y}→ DRY-RUN: se asignaría scope:"master" a ${dishCatsWithoutScope.length} categorías de platos${X}`);
  }

  // ── 2. kitchendishes sin dishCategoryId ────────────────────────────────────
  console.log(`\n${B}── 2. kitchendishes (scope:master) sin dishCategoryId ──────────${X}`);
  const validDishCatIds = (await dishCatCol.find({}).toArray()).map(d => d._id.toString());

  const masterDishes = await dishCol.find({ scope: "master" }).toArray();
  const dishesWithoutCat = masterDishes.filter(d =>
    !d.dishCategoryId ||
    !validDishCatIds.includes(d.dishCategoryId.toString())
  );

  if (dishesWithoutCat.length === 0) {
    console.log(`  ${G}✓ Todos los platos master tienen dishCategoryId válido${X}`);
  } else {
    for (const dish of dishesWithoutCat) {
      const ingredientNames = (dish.ingredients || []).map(i => i.displayName || "");
      const suggested = suggestDishCategory(dish.name, ingredientNames);
      const suggestedName = suggested
        ? Object.entries(DISH_CAT).find(([, v]) => v === suggested)?.[0]
        : "—";

      console.log(`  ${R}✗ "${dish.name}" [${dish._id}]${X}`);
      console.log(`    dishCategoryId: ${dish.dishCategoryId ?? "null"}`);
      console.log(`    Sugerencia: ${suggested ? `${suggestedName} (${suggested})` : "sin sugerencia — revisar manualmente"}`);

      if (APPLY && suggested) {
        await dishCol.updateOne(
          { _id: dish._id },
          { $set: { dishCategoryId: new ObjectId(suggested), updatedAt: NOW } }
        );
        console.log(`    ${G}✓ dishCategoryId asignado: ${suggestedName}${X}`);
        totalFixes++;
      } else if (APPLY && !suggested) {
        console.log(`    ${Y}⚠ Sin sugerencia automática — asigna manualmente${X}`);
      }
    }
    if (!APPLY) console.log(`\n  ${Y}→ DRY-RUN: ${dishesWithoutCat.length} platos sin categoría${X}`);
  }

  // ── 3. kitcheningredients sin categoryId o con ID inválido ─────────────────
  console.log(`\n${B}── 3. kitcheningredients (scope:master) sin categoryId ──────────${X}`);
  const validCatIds = Object.keys(INGREDIENT_CATS);
  const masterIngredients = await ingredientCol.find({ scope: "master" }).toArray();

  const ingredientsWithoutCat = masterIngredients.filter(i =>
    !i.categoryId || !validCatIds.includes(i.categoryId.toString())
  );

  if (ingredientsWithoutCat.length === 0) {
    console.log(`  ${G}✓ Todos los ingredientes master tienen categoryId válido${X}`);
  } else {
    for (const ing of ingredientsWithoutCat) {
      const suggested = suggestIngredientCategory(ing.name);
      console.log(`  ${R}✗ "${ing.name}" [${ing._id}]${X}`);
      console.log(`    categoryId actual: ${ing.categoryId ?? "null"}`);
      console.log(`    Sugerencia: ${suggested ? `${INGREDIENT_CATS[suggested]} (${suggested})` : "sin sugerencia"}`);
      if (APPLY && suggested) {
        await ingredientCol.updateOne(
          { _id: ing._id },
          { $set: { categoryId: new ObjectId(suggested), updatedAt: NOW } }
        );
        console.log(`    ${G}✓ categoryId asignado: ${INGREDIENT_CATS[suggested]}${X}`);
        totalFixes++;
      }
    }
  }

  // ── 4. Ingredientes en categoría "Otros" con reasignación sugerida ─────────
  console.log(`\n${B}── 4. kitcheningredients en categoría "Otros" ───────────────────${X}`);
  const inOtros = masterIngredients.filter(
    i => i.categoryId && i.categoryId.toString() === CAT_OTROS_ID
  );

  if (inOtros.length === 0) {
    console.log(`  ${G}✓ Ningún ingrediente master está en "Otros"${X}`);
  } else {
    for (const ing of inOtros) {
      const suggested = suggestIngredientCategory(ing.name);
      if (suggested && suggested !== CAT_OTROS_ID) {
        console.log(`  ${Y}↻ "${ing.name}" [${ing._id}] → mover a: ${INGREDIENT_CATS[suggested]}${X}`);
        if (APPLY) {
          await ingredientCol.updateOne(
            { _id: ing._id },
            { $set: { categoryId: new ObjectId(suggested), updatedAt: NOW } }
          );
          console.log(`    ${G}✓ Reasignado${X}`);
          totalFixes++;
        }
      } else {
        console.log(`  ${Y}? "${ing.name}" [${ing._id}] → sin sugerencia automática (revisar)${X}`);
      }
    }
    if (!APPLY) console.log(`\n  ${Y}→ DRY-RUN: ${inOtros.length} ingredientes en "Otros"${X}`);
  }

  // ── RESUMEN ─────────────────────────────────────────────────────────────────
  console.log(`\n${B}${"─".repeat(64)}${X}`);
  if (!APPLY) {
    console.log(`${Y}DRY-RUN completado. Usa --apply para aplicar los fixes.${X}`);
  } else {
    console.log(`${G}${B}✅ Fixes aplicados: ${totalFixes} operaciones${X}`);
  }
  console.log("");

  await client.close();
}

main().catch(err => { console.error(R + "ERROR:" + X, err.message || err); process.exit(1); });
