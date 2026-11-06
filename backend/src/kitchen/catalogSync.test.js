import test from "node:test";
import assert from "node:assert/strict";
import { propagatePublishedCatalogTemplates } from "./catalogSync.js";
import { catalogMetadataHash, copyPersonalizationFromTemplate } from "./catalogMetadata.js";

const normalize = (template) => ({ name: template.name, ingredients: template.ingredients || [] });
const metadata = (complete = "unknown") => ({ schemaVersion: 1, mealSlots: ["lunch"], ingredientsComplete: complete, baseServings: null, provenance: { source: "catalog", sourceVersion: "v1", contentHash: `sha256:${"a".repeat(64)}` } });
const cloneFields = (template) => copyPersonalizationFromTemplate(template, { name: template.name });

function setup(dishes) {
  const writes = [];
  const repository = {
    countCustomized: async (filter) => dishes.filter((dish) => dish.userModified && dish.sourceDishTemplateId === filter.sourceDishTemplateId).length,
    findUnmodifiedByTemplate: async (filter) => dishes.filter((dish) => dish.sourceDishTemplateId === filter.sourceDishTemplateId && !dish.userModified && dish.scope === filter.scope),
    findLegacyUnmodified: async () => [],
    save: async (dish) => { writes.push({ ...dish }); }
  };
  return { repository, writes };
}

const run = (pack, previousDishes, repository) => propagatePublishedCatalogTemplates({
  pack, previousDishes, repository,
  hashTemplate: (template) => catalogMetadataHash(template, normalize),
  mapTemplateFields: cloneFields,
  normalizeName: (name) => String(name).toLowerCase()
});

test("real sync flow propagates metadata and content hash to unmodified catalog copies", async () => {
  const previous = { dishTemplateId: "t1", name: "Soup" };
  const next = { ...previous, personalization: metadata("complete") };
  const copy = { source: "catalog", sourcePackId: "p1", scope: "household", sourceDishTemplateId: "t1", userModified: false, name: "Soup" };
  const { repository, writes } = setup([copy]);
  const summary = await run({ _id: "p1", slug: "pack", title: "Pack", dishes: [next] }, [previous], repository);
  assert.equal(summary.synced, 1);
  assert.deepEqual(writes[0].personalization, next.personalization);
  assert.equal(writes[0].catalogContentHash, catalogMetadataHash(next, normalize));
});

test("real sync flow preserves customized dishes and overrides", async () => {
  const previous = { dishTemplateId: "t1", name: "Soup" };
  const next = { ...previous, personalization: metadata("complete") };
  const customized = { source: "catalog", sourcePackId: "p1", scope: "household", sourceDishTemplateId: "t1", userModified: true, name: "My soup" };
  const override = { source: "catalog", sourcePackId: "p1", scope: "override", sourceDishTemplateId: "t1", userModified: false, name: "Override" };
  const { repository, writes } = setup([customized, override]);
  const summary = await run({ _id: "p1", slug: "pack", title: "Pack", dishes: [next] }, [previous], repository);
  assert.equal(summary.synced, 0);
  assert.equal(summary.skippedCustomized, 1);
  assert.equal(writes.length, 0);
  assert.equal(customized.name, "My soup");
  assert.equal(override.name, "Override");
});

test("removing template metadata clears stale assessments on synchronized copies", async () => {
  const previous = { dishTemplateId: "t1", name: "Soup", personalization: metadata("complete") };
  const next = { dishTemplateId: "t1", name: "Soup" };
  const copy = { source: "catalog", sourcePackId: "p1", scope: "household", sourceDishTemplateId: "t1", userModified: false, personalization: previous.personalization };
  const { repository, writes } = setup([copy]);
  await run({ _id: "p1", slug: "pack", title: "Pack", dishes: [next] }, [previous], repository);
  assert.equal(Object.hasOwn(writes[0], "personalization"), false);
});

test("validation failure occurs before repository reads or dish writes", async () => {
  let calls = 0;
  const repository = Object.fromEntries(["countCustomized", "findUnmodifiedByTemplate", "findLegacyUnmodified", "save"].map((name) => [name, async () => { calls += 1; return []; }]));
  await assert.rejects(() => run({ _id: "p1", dishes: [{ dishTemplateId: "t1", name: "Soup", personalization: { schemaVersion: 99 } }] }, [], repository), /schemaVersion/);
  assert.equal(calls, 0);
});
