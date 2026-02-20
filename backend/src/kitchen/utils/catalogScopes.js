import { HiddenMaster } from "../models/HiddenMaster.js";

export const CATALOG_SCOPES = {
  MASTER: "master",
  HOUSEHOLD: "household",
  OVERRIDE: "override"
};

export function isDiodUser(user) {
  return user?.globalRole === "diod";
}

export async function resolveCatalogForHousehold({
  Model,
  householdId,
  type,
  baseFilter = {},
  masterFilter = {},
  householdFilter = {},
  overrideFilter = {},
  sort = { name: 1 },
  populate = null
}) {
  const query = (filter) => {
    let builder = Model.find(filter);
    if (populate) {
      if (Array.isArray(populate)) {
        populate.forEach((entry) => {
          builder = builder.populate(entry);
        });
      } else {
        builder = builder.populate(populate);
      }
    }
    return builder.sort(sort);
  };

  const [masters, overrides, customs, hidden] = await Promise.all([
    query({
      ...baseFilter,
      ...masterFilter,
      scope: CATALOG_SCOPES.MASTER,
      isArchived: { $ne: true }
    }),
    query({
      ...baseFilter,
      ...overrideFilter,
      scope: CATALOG_SCOPES.OVERRIDE,
      householdId,
      isArchived: { $ne: true }
    }),
    query({
      ...baseFilter,
      ...householdFilter,
      scope: CATALOG_SCOPES.HOUSEHOLD,
      householdId,
      isArchived: { $ne: true }
    }),
    HiddenMaster.find({ householdId, type }).select("masterId")
  ]);

  const hiddenMasterIds = new Set(hidden.map((entry) => String(entry.masterId)));
  const overridesByMasterId = new Map(
    overrides
      .filter((entry) => entry.masterId)
      .map((entry) => [String(entry.masterId), entry])
  );

  const resolved = [];

  masters.forEach((master) => {
    const masterId = String(master._id);
    if (hiddenMasterIds.has(masterId)) return;
    const override = overridesByMasterId.get(masterId);
    if (override) {
      resolved.push(override);
      return;
    }
    resolved.push(master);
  });

  customs.forEach((custom) => {
    resolved.push(custom);
  });

  return resolved;
}

export async function hideMasterForHousehold({ householdId, type, masterId }) {
  await HiddenMaster.updateOne(
    { householdId, type, masterId },
    { $setOnInsert: { householdId, type, masterId } },
    { upsert: true }
  );
}

export async function clearHiddenMasterForHousehold({ householdId, type, masterId }) {
  await HiddenMaster.deleteOne({ householdId, type, masterId });
}
