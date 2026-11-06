import { assertValidPersonalization } from "./personalizationContract.js";

const templateId = (dish) => String(dish?.dishTemplateId || "").trim();

export async function propagatePublishedCatalogTemplates({
  pack,
  previousDishes = [],
  repository,
  hashTemplate,
  mapTemplateFields,
  normalizeName
}) {
  const templates = pack.dishes || [];
  // Validate the entire incoming set before querying or writing any dish.
  templates.forEach((template, index) => {
    if (template.personalization !== undefined) assertValidPersonalization(template.personalization, `dishes[${index}].personalization`);
  });

  const summary = { synced: 0, skippedCustomized: 0, skippedAmbiguous: 0, skippedMissingIdentity: 0 };
  const previousById = new Map(previousDishes.map((dish) => [templateId(dish), dish]));

  for (const template of templates) {
    const id = templateId(template);
    if (!id) {
      summary.skippedMissingIdentity += 1;
      continue;
    }
    const nextHash = hashTemplate(template);
    const previous = previousById.get(id) || {};
    if (nextHash === hashTemplate(previous)) continue;

    const scope = { source: "catalog", sourcePackId: pack._id, scope: "household", isArchived: { $ne: true }, deletedAt: null, active: { $ne: false } };
    summary.skippedCustomized += await repository.countCustomized({ ...scope, sourceDishTemplateId: id, userModified: true });
    let targets = await repository.findUnmodifiedByTemplate({ ...scope, sourceDishTemplateId: id, userModified: { $ne: true } });

    if (!targets.length) {
      const previousNameKey = normalizeName(previous.name || template.name);
      const legacy = (await repository.findLegacyUnmodified({ ...scope, sourceDishTemplateId: { $in: [null, ""] }, userModified: { $ne: true } }))
        .filter((dish) => normalizeName(dish.name || "") === previousNameKey);
      const byHousehold = new Map();
      for (const dish of legacy) {
        const household = String(dish.householdId || "");
        byHousehold.set(household, [...(byHousehold.get(household) || []), dish]);
      }
      targets = [];
      for (const dishes of byHousehold.values()) {
        if (dishes.length === 1) targets.push(dishes[0]);
        else summary.skippedAmbiguous += dishes.length;
      }
    }

    for (const dish of targets) {
      // Recheck in memory too, so adapters returning a stale/customized row fail closed.
      if (dish.userModified === true || dish.scope === "override") continue;
      const fields = mapTemplateFields(template);
      Object.assign(dish, fields, {
        sourcePackSlug: pack.slug,
        sourcePackTitle: pack.title,
        sourcePackColor: pack.color || null,
        sourceDishTemplateId: id,
        catalogSyncedAt: new Date(),
        catalogContentHash: nextHash
      });
      if (template.personalization === undefined) {
        if (typeof dish.set === "function") dish.set("personalization", undefined);
        else delete dish.personalization;
      }
      await repository.save(dish);
      summary.synced += 1;
    }
  }
  return summary;
}
