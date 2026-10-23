import test from "node:test";
import assert from "node:assert/strict";
import { catalogMetadataHash, copyPersonalizationFromTemplate } from "./catalogMetadata.js";

const normalize = (template) => ({ name: template.name, isDinner: Boolean(template.isDinner) });

test("catalog metadata changes affect content hash", () => {
  const base = { name: "Soup", personalization: { schemaVersion: 1, ingredientsComplete: "unknown" } };
  const changed = { ...base, personalization: { ...base.personalization, ingredientsComplete: "complete" } };
  assert.notEqual(catalogMetadataHash(base, normalize), catalogMetadataHash(changed, normalize));
  assert.equal(catalogMetadataHash({ name: "Soup" }, normalize), catalogMetadataHash({ name: "Soup" }, normalize));
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
