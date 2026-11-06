#!/usr/bin/env node
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { normalizeIngredientName } from "../src/kitchen/utils/normalize.js";
import { STARTER_MASTER_DISHES } from "../src/kitchen/bootstrap/masterDishes.js";

const HERE = path.dirname(fileURLToPath(import.meta.url));
export const PANTRY_CANDIDATES = new Set(["sal", "pimienta", "aceite", "especia", "especias"]);
const ALTERNATIVE = /\b(o|u|alternativ[ao]|puede sustituir|sustituir)\b/i;
const DESCRIPTORS = /\b(en polvo|fresco|fresca|seco|seca|picado|picada|troceado|troceada|sin piel|ahumado|ahumada|molido|molida)\b/gi;
const CLASSIFICATIONS = ["exact_canonical", "variant", "pantry_candidate", "unmatched_purchase", "unmatched_recipe", "manual_review"];

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

function isAlternative(value) { return ALTERNATIVE.test(String(value || "")); }

function partialMatch(a, b) {
  if (!a || !b) return false;
  if (a.includes(b) || b.includes(a)) return true;
  const aTokens = new Set(a.split(" ").filter(Boolean));
  return b.split(" ").some((token) => token.length > 2 && aTokens.has(token));
}

export function auditDish(dish, source) {
  const purchase = Array.isArray(dish.ingredients) ? dish.ingredients : [];
  const recipe = Array.isArray(dish.recipe?.ingredients) ? dish.recipe.ingredients : [];
  const p = purchase.map((item, index) => ({ index, displayName: String(itemName(item)).trim(), normalizedName: comparisonName(itemName(item)) }));
  const r = recipe.map((item, index) => ({ index, displayName: String(itemName(item, true)).trim(), normalizedName: comparisonName(itemName(item, true)) }));
  const matches = [];
  const usedRecipe = new Set();
  const partialCandidates = new Map(p.map((pi) => [pi.index, r.filter((ri) => partialMatch(pi.normalizedName, ri.normalizedName))]));
  const partialOwners = new Map(r.map((ri) => [ri.index, p.filter((pi) => partialCandidates.get(pi.index).some((candidate) => candidate.index === ri.index)).length]));
  const classifyUnmatchedPurchase = (pi, reason) => matches.push({ purchase: pi, recipe: null, classification: "unmatched_purchase", reason });
  const classifyManualReview = (pi, candidates, reason) => matches.push({ purchase: pi, recipe: null, candidates, classification: "manual_review", reason });
  for (const pi of p) {
    if (isAlternative(pi.displayName)) { classifyManualReview(pi, [], "alternative_in_purchase_ingredient"); continue; }
    const exact = r.filter((ri) => !usedRecipe.has(ri.index) && pi.normalizedName && pi.normalizedName === ri.normalizedName);
    if (exact.length === 1 && !isAlternative(exact[0].displayName)) { usedRecipe.add(exact[0].index); matches.push({ purchase: pi, recipe: exact[0], classification: "exact_canonical" }); continue; }
    if (exact.length > 1) { classifyManualReview(pi, exact, "duplicate_recipe_name"); continue; }
    const variant = r.filter((ri) => !usedRecipe.has(ri.index) && safeVariant(pi.normalizedName, ri.normalizedName));
    if (variant.length === 1) { usedRecipe.add(variant[0].index); matches.push({ purchase: pi, recipe: variant[0], classification: "variant" }); continue; }
    const candidates = (partialCandidates.get(pi.index) || []).filter((ri) => !usedRecipe.has(ri.index));
    if (candidates.some((ri) => isAlternative(ri.displayName))) { classifyManualReview(pi, candidates, "alternative_in_recipe_ingredient"); continue; }
    const competingPurchases = candidates.filter((ri) => (partialOwners.get(ri.index) || 0) > 1);
    if (candidates.length === 1 && competingPurchases.length === 0) { usedRecipe.add(candidates[0].index); matches.push({ purchase: pi, recipe: candidates[0], classification: "variant" }); continue; }
    if (candidates.length > 1 || competingPurchases.length > 0) { classifyManualReview(pi, candidates, "ambiguous_partial_match"); continue; }
    classifyUnmatchedPurchase(pi, "no_recipe_match");
  }
  for (const ri of r.filter((x) => !usedRecipe.has(x.index))) {
    matches.push({ purchase: null, recipe: ri, classification: isPantryCandidate(ri.normalizedName) ? "pantry_candidate" : "unmatched_recipe" });
  }
  if (!recipe.length) matches.push({ purchase: null, recipe: null, classification: "manual_review", reason: "master_without_recipe_ingredients" });
  const duplicateNames = [...new Set(p.map((x) => x.normalizedName).filter((x, i, a) => x && a.indexOf(x) !== i))];
  return { source, dish: String(dish.name ?? "").trim(), matches, duplicates: duplicateNames, counts: Object.fromEntries(CLASSIFICATIONS.map((k) => [k, matches.filter((m) => m.classification === k).length])) };
}

export async function loadSources({ packsDir = path.resolve(HERE, "../catalog-packs"), bootstrapPath = path.resolve(HERE, "../src/kitchen/bootstrap/masterDishes.js") } = {}) {
  const files = (await fs.readdir(packsDir)).filter((f) => f.endsWith(".json")).sort();
  const dishes = [];
  for (const file of files) {
    const pack = JSON.parse(await fs.readFile(path.join(packsDir, file), "utf8"));
    for (const [index, dish] of (Array.isArray(pack.dishes) ? pack.dishes : []).entries()) dishes.push({ dish, source: { type: "pack", file, dishIndex: index, pack: pack.slug ?? null } });
  }
  for (const [index, dish] of STARTER_MASTER_DISHES.entries()) dishes.push({ dish, source: { type: "bootstrap_master", file: path.relative(process.cwd(), bootstrapPath).replaceAll("\\", "/"), dishIndex: index } });
  return { dishes, sourceCounts: { packs: files.length, bootstrapMasters: STARTER_MASTER_DISHES.length } };
}

export async function buildReport(options = {}) {
  const loaded = await loadSources(options);
  const rows = loaded.dishes.map(({ dish, source }) => auditDish(dish, source));
  const summary = Object.fromEntries(CLASSIFICATIONS.map((k) => [k, rows.reduce((n, r) => n + r.counts[k], 0)]));
  return { version: 1, sources: loaded.sourceCounts, dishes: rows.length, summary, details: rows };
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
