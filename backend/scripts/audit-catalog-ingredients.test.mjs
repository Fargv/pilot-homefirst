import test from "node:test";
import assert from "node:assert/strict";
import { auditDish, buildReport, comparisonName, loadSources, renderText } from "./audit-catalog-ingredients.mjs";

test("normalizes only the comparison value", () => assert.equal(comparisonName("Pimientos"), "pimiento"));
test("exact canonical and pantry are conservative", () => {
  const r = auditDish({ name: "x", ingredients: [{ displayName: "Ajo" }, { displayName: "Pollo" }], recipe: { ingredients: [{ name: "Ajo en polvo" }, { name: "Pollo" }, { name: "Sal" }] } }, { type: "fixture" });
  assert.equal(r.counts.exact_canonical, 1); assert.equal(r.counts.manual_review, 1); assert.equal(r.counts.pantry_candidate, 1);
});
test("product-changing descriptors require manual review", () => {
  for (const [purchase, recipe] of [["Ajo", "Ajo en polvo"], ["Tomate", "Tomate triturado"], ["Pollo", "Pollo picado"]]) {
    const r = auditDish({ name: "x", ingredients: [purchase], recipe: { ingredients: [{ name: recipe }] } }, { type: "fixture" });
    assert.equal(r.counts.variant, 0); assert.equal(r.counts.manual_review, 1); assert.equal(r.matches[0].recipe, null);
  }
});
test("specific products are not pantry exclusions and alternatives are review", () => {
  const r = auditDish({ name: "x", ingredients: [{ displayName: "Aceite de sésamo" }], recipe: { ingredients: [{ name: "Aceite de oliva o aceite de sésamo" }, { name: "Salsa de soja" }] } }, { type: "fixture" });
  assert.equal(r.counts.manual_review, 1); assert.equal(r.counts.pantry_candidate, 0); assert.equal(r.counts.unmatched_recipe, 2);
});
test("partial overlaps are not assigned when two purchase entries compete", () => {
  const r = auditDish({ name: "x", ingredients: ["Tomate", "Tomate cherry"], recipe: { ingredients: [{ name: "Tomate triturado" }] } }, { type: "fixture" });
  assert.equal(r.counts.manual_review, 2); assert.equal(r.counts.unmatched_recipe, 1);
});
test("alternative in a recipe is never treated as a product", () => {
  const r = auditDish({ name: "x", ingredients: ["Aceite"], recipe: { ingredients: [{ name: "Aceite de oliva o de girasol" }] } }, { type: "fixture" });
  assert.equal(r.counts.manual_review, 1); assert.equal(r.counts.unmatched_recipe, 1); assert.equal(r.matches[0].recipe, null);
});
test("duplicates and masters without recipes are visible", () => {
  const r = auditDish({ name: "x", ingredients: ["Sal", "Sal"], recipe: { ingredients: [] } }, { type: "fixture" });
  assert.deepEqual(r.duplicates, ["sal"]); assert.equal(r.counts.manual_review, 1);
});
test("real source report is deterministic", async () => {
  const a = await buildReport(); const b = await buildReport(); const loaded = await loadSources();
  assert.deepEqual(a, b); assert.deepEqual(a.sources, loaded.sourceCounts); assert.equal(a.dishes, loaded.dishes.length); assert.match(renderText(a), /Summary:/);
  assert.ok(a.summary.unmatched_purchase >= 0); assert.ok(a.summary.unmatched_recipe >= 0);
});
