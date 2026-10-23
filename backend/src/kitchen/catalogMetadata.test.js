import test from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import { catalogMetadataHash, catalogRecipeContentHash, copyPersonalizationFromTemplate } from "./catalogMetadata.js";

const normalize = (template) => ({ name: template.name, isDinner: Boolean(template.isDinner), ingredients: template.ingredients || [] });

test("catalog metadata changes affect content hash", () => {
  const base = { name: "Soup", personalization: { schemaVersion: 1, ingredientsComplete: "unknown" } };
  const changed = { ...base, personalization: { ...base.personalization, ingredientsComplete: "complete" } };
  assert.notEqual(catalogMetadataHash(base, normalize), catalogMetadataHash(changed, normalize));
  const legacyTemplate = { name: "Soup", isDinner: false };
  const legacyHash = crypto.createHash("sha256").update(JSON.stringify(normalize(legacyTemplate))).digest("hex");
  assert.equal(catalogMetadataHash(legacyTemplate, normalize), legacyHash);
  assert.equal(catalogMetadataHash({ ...legacyTemplate, personalization: undefined }, normalize), legacyHash);
});

test("recipe content fingerprint changes on content edits and excludes metadata edits", () => {
  const recipe = { name: "Soup", ingredients: ["lentil"], personalization: { marker: "one" } };
  const currentHash = catalogRecipeContentHash(recipe);
  assert.match(currentHash, /^sha256:[a-f\d]{64}$/);
  assert.equal(catalogRecipeContentHash({ ...recipe, personalization: { marker: "two" } }), currentHash);
  assert.notEqual(catalogRecipeContentHash({ ...recipe, ingredients: ["peanut"] }), currentHash);
});

test("template copy round-trips metadata while preserving customization and overrides", () => {
  const metadata = { schemaVersion: 1, mealSlots: ["dinner"] };
  const existing = { userModified: true, masterId: "master-1", scope: "override", name: "Customized" };
  const copied = copyPersonalizationFromTemplate({ personalization: metadata }, existing);
  assert.deepEqual(copied.personalization, metadata);
  assert.equal(copied.userModified, true);
  assert.equal(copied.masterId, "master-1");
  assert.equal(copied.scope, "override");
});
