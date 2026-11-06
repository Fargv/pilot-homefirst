import test from "node:test";
import assert from "node:assert/strict";
import { auditDish, buildReport, comparisonName, renderText } from "./audit-catalog-ingredients.mjs";

test("normalizes only the comparison value", () => assert.equal(comparisonName("Pimientos"), "pimiento"));
test("exact, variant and pantry are conservative", () => {
  const r = auditDish({ name: "x", ingredients: [{ displayName: "Ajo" }, { displayName: "Pollo" }], recipe: { ingredients: [{ name: "Ajo en polvo" }, { name: "Pollo" }, { name: "Sal" }] } }, { type: "fixture" });
  assert.equal(r.counts.exact_canonical, 1); assert.equal(r.counts.variant, 1); assert.equal(r.counts.pantry_candidate, 1);
});
test("specific products are not pantry exclusions and alternatives are review", () => {
  const r = auditDish({ name: "x", ingredients: [{ displayName: "Aceite de sésamo" }], recipe: { ingredients: [{ name: "Aceite de oliva o aceite de sésamo" }, { name: "Salsa de soja" }] } }, { type: "fixture" });
  assert.ok(r.counts.inconsistency + r.counts.manual_review > 0); assert.equal(r.counts.pantry_candidate, 0);
});
test("duplicates and masters without recipes are visible", () => {
  const r = auditDish({ name: "x", ingredients: ["Sal", "Sal"], recipe: { ingredients: [] } }, { type: "fixture" });
  assert.deepEqual(r.duplicates, ["sal"]); assert.equal(r.counts.manual_review, 1);
});
test("real source report is deterministic", async () => {
  const a = await buildReport(); const b = await buildReport();
  assert.deepEqual(a, b); assert.equal(a.sources.packs, 13); assert.equal(a.sources.bootstrapMasters, 5); assert.match(renderText(a), /Summary:/);
});
