#!/usr/bin/env node
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { normalizeIngredientName } from "../src/kitchen/utils/normalize.js";

const HERE = path.dirname(fileURLToPath(import.meta.url));
export const PANTRY_CANDIDATES = new Set(["sal", "pimienta", "aceite", "especia", "especias"]);
const ALTERNATIVE = /\b(o|u|alternativ[ao]|puede sustituir|sustituir)\b/i;
const DESCRIPTORS = /\b(en polvo|fresco|fresca|seco|seca|picado|picada|troceado|troceada|sin piel|ahumado|ahumada|molido|molida)\b/gi;

export function comparisonName(value) {
  return normalizeIngredientName(String(value ?? ""));
}

function itemName(item, recipe = false) {
  if (typeof item === "string") return item;
  return recipe ? item?.name ?? item?.displayName ?? "" : item?.displayName ?? item?.name ?? "";
}

function isPantryCandidate(name) {
  const n = comparisonName(name);
  return n === "sal" || n === "pimienta" || n === "aceite" || n === "especia" || n === "especia habitual";
}

function safeVariant(a, b) {
  if (!a || !b || ALTERNATIVE.test(a) || ALTERNATIVE.test(b)) return false;
  const aa = a.replace(DESCRIPTORS, "").replace(/\s+/g, " ").trim();
  const bb = b.replace(DESCRIPTORS, "").replace(/\s+/g, " ").trim();
  return aa === bb && a !== b;
}

export function auditDish(dish, source) {
  const purchase = Array.isArray(dish.ingredients) ? dish.ingredients : [];
  const recipe = Array.isArray(dish.recipe?.ingredients) ? dish.recipe.ingredients : [];
  const p = purchase.map((item, index) => ({ index, displayName: String(itemName(item)).trim(), normalizedName: comparisonName(itemName(item)) }));
  const r = recipe.map((item, index) => ({ index, displayName: String(itemName(item, true)).trim(), normalizedName: comparisonName(itemName(item, true)) }));
  const matches = [];
  const usedRecipe = new Set();
  for (const pi of p) {
    const exact = r.find((ri) => !usedRecipe.has(ri.index) && pi.normalizedName && pi.normalizedName === ri.normalizedName);
    if (exact) { usedRecipe.add(exact.index); matches.push({ purchase: pi, recipe: exact, classification: "exact_canonical" }); continue; }
    const variant = r.find((ri) => !usedRecipe.has(ri.index) && safeVariant(pi.normalizedName, ri.normalizedName));
    if (variant) { usedRecipe.add(variant.index); matches.push({ purchase: pi, recipe: variant, classification: "variant" }); continue; }
    const candidates = r.filter((ri) => !usedRecipe.has(ri.index) && ri.normalizedName && (ri.normalizedName.includes(pi.normalizedName) || pi.normalizedName.includes(ri.normalizedName)));
    matches.push({ purchase: pi, recipe: candidates[0] ?? null, classification: candidates.length === 1 ? "inconsistency" : candidates.length > 1 ? "manual_review" : "inconsistency" });
  }
  for (const ri of r.filter((x) => !usedRecipe.has(x.index))) {
    matches.push({ purchase: null, recipe: ri, classification: isPantryCandidate(ri.normalizedName) ? "pantry_candidate" : "inconsistency" });
  }
  if (!recipe.length) matches.push({ purchase: null, recipe: null, classification: "manual_review", reason: "master_without_recipe_ingredients" });
  const duplicateNames = [...new Set(p.map((x) => x.normalizedName).filter((x, i, a) => x && a.indexOf(x) !== i))];
  return { source, dish: String(dish.name ?? "").trim(), matches, duplicates: duplicateNames, counts: Object.fromEntries(["exact_canonical", "variant", "pantry_candidate", "inconsistency", "manual_review"].map((k) => [k, matches.filter((m) => m.classification === k).length])) };
}

export async function loadSources({ packsDir = path.resolve(HERE, "../catalog-packs"), bootstrapPath = path.resolve(HERE, "../src/kitchen/bootstrap/masterDishes.js") } = {}) {
  const files = (await fs.readdir(packsDir)).filter((f) => f.endsWith(".json")).sort();
  const dishes = [];
  for (const file of files) {
    const pack = JSON.parse(await fs.readFile(path.join(packsDir, file), "utf8"));
    for (const [index, dish] of (Array.isArray(pack.dishes) ? pack.dishes : []).entries()) dishes.push({ dish, source: { type: "pack", file, dishIndex: index, pack: pack.slug ?? null } });
  }
  const sourceText = await fs.readFile(bootstrapPath, "utf8");
  const match = sourceText.match(/const STARTER_MASTER_DISHES = (\[[\s\S]*?\]);/);
  if (!match) throw new Error(`No se encontró STARTER_MASTER_DISHES en ${bootstrapPath}`);
  const masters = Function(`"use strict"; return (${match[1]});`)();
  for (const [index, dish] of masters.entries()) dishes.push({ dish, source: { type: "bootstrap_master", file: path.relative(process.cwd(), bootstrapPath).replaceAll("\\", "/"), dishIndex: index } });
  return dishes;
}

export async function buildReport(options = {}) {
  const rows = (await loadSources(options)).map(({ dish, source }) => auditDish(dish, source));
  const summary = Object.fromEntries(["exact_canonical", "variant", "pantry_candidate", "inconsistency", "manual_review"].map((k) => [k, rows.reduce((n, r) => n + r.counts[k], 0)]));
  return { version: 1, sources: { packs: 13, bootstrapMasters: 5 }, dishes: rows.length, summary, details: rows };
}

export function renderText(report) {
  const lines = [`Catalog ingredient audit v${report.version}`, `Dishes: ${report.dishes}`, `Summary: ${Object.entries(report.summary).map(([k, v]) => `${k}=${v}`).join(" ")}`];
  for (const row of report.details) lines.push(`- ${row.source.type}:${row.source.file} :: ${row.dish} :: ${Object.entries(row.counts).filter(([, v]) => v).map(([k, v]) => `${k}=${v}`).join(", ") || "no findings"}`);
  return `${lines.join("\n")}\n`;
}

if (process.argv[1]?.endsWith("audit-catalog-ingredients.mjs")) {
  const report = await buildReport();
  const format = process.argv.includes("--text") ? "text" : "json";
  process.stdout.write(format === "text" ? renderText(report) : `${JSON.stringify(report, null, 2)}\n`);
}
