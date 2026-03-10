import { HiddenMaster } from "../models/HiddenMaster.js";
import { CATALOG_SCOPES } from "./catalogScopes.js";

export const DISH_HIDDEN_MASTER_TYPES = {
  MAIN: "dish",
  SIDE: "side"
};

function isNonEmptyObject(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value) && Object.keys(value).length > 0;
}

function buildAndFilter(...filters) {
  const normalized = filters.filter(isNonEmptyObject);
  if (!normalized.length) return {};
  if (normalized.length === 1) return normalized[0];
  return { $and: normalized };
}

function applyPopulate(query, populate) {
  if (!populate) return query;
  if (Array.isArray(populate)) {
    populate.forEach((entry) => {
      query = query.populate(entry);
    });
    return query;
  }
  return query.populate(populate);
}

function normalizeIds(ids = []) {
  return Array.from(
    new Set(
      (Array.isArray(ids) ? ids : [ids])
        .filter(Boolean)
        .map((value) => String(value))
    )
  );
}

function hiddenMasterKey(dishLike) {
  if (!dishLike?._id) return "";
  return `${getDishHiddenMasterType(dishLike)}:${String(dishLike._id)}`;
}

function dedupeById(entries = []) {
  const seen = new Set();
  const result = [];

  entries.forEach((entry) => {
    const id = entry?._id ? String(entry._id) : "";
    if (!id || seen.has(id)) return;
    seen.add(id);
    result.push(entry);
  });

  return result;
}

export function getDishHiddenMasterType(dishLike) {
  return dishLike?.sidedish ? DISH_HIDDEN_MASTER_TYPES.SIDE : DISH_HIDDEN_MASTER_TYPES.MAIN;
}

export async function resolveDishCatalogForHousehold({
  Model,
  householdId,
  filter = {},
  sort = { createdAt: -1 },
  populate = null,
  ids = null
}) {
  const requestedIds = normalizeIds(ids);
  const hasRequestedIds = requestedIds.length > 0;
  const queryWithOptions = (queryFilter) => applyPopulate(Model.find(queryFilter).sort(sort), populate);

  const masterFilter = buildAndFilter(
    filter,
    { scope: CATALOG_SCOPES.MASTER, isArchived: { $ne: true } },
    hasRequestedIds ? { _id: { $in: requestedIds } } : {}
  );

  const householdFilter = householdId
    ? buildAndFilter(
        filter,
        {
          scope: CATALOG_SCOPES.HOUSEHOLD,
          householdId,
          isArchived: { $ne: true }
        },
        hasRequestedIds ? { _id: { $in: requestedIds } } : {}
      )
    : null;

  const overrideFilter = householdId
    ? buildAndFilter(
        filter,
        {
          scope: CATALOG_SCOPES.OVERRIDE,
          householdId,
          isArchived: { $ne: true }
        },
        hasRequestedIds
          ? {
              $or: [{ _id: { $in: requestedIds } }, { masterId: { $in: requestedIds } }]
            }
          : {}
      )
    : null;

  const [masters, overrides, customs, hidden] = await Promise.all([
    queryWithOptions(masterFilter),
    overrideFilter ? queryWithOptions(overrideFilter) : Promise.resolve([]),
    householdFilter ? queryWithOptions(householdFilter) : Promise.resolve([]),
    householdId
      ? HiddenMaster.find({
          householdId,
          type: { $in: Object.values(DISH_HIDDEN_MASTER_TYPES) }
        }).select("masterId type")
      : Promise.resolve([])
  ]);

  const hiddenMasterKeys = new Set(hidden.map((entry) => `${entry.type}:${String(entry.masterId)}`));
  const mastersById = new Map(masters.map((entry) => [String(entry._id), entry]));
  const customsById = new Map(customs.map((entry) => [String(entry._id), entry]));
  const overridesById = new Map(overrides.map((entry) => [String(entry._id), entry]));
  const overridesByMasterId = new Map(
    overrides
      .filter((entry) => entry?.masterId)
      .map((entry) => [String(entry.masterId), entry])
  );

  if (hasRequestedIds) {
    const resolved = [];

    requestedIds.forEach((requestedId) => {
      const custom = customsById.get(requestedId);
      if (custom) {
        resolved.push(custom);
        return;
      }

      const overrideById = overridesById.get(requestedId);
      if (overrideById) {
        resolved.push(overrideById);
        return;
      }

      const overrideByMaster = overridesByMasterId.get(requestedId);
      if (overrideByMaster) {
        resolved.push(overrideByMaster);
        return;
      }

      const master = mastersById.get(requestedId);
      if (!master) return;
      if (hiddenMasterKeys.has(hiddenMasterKey(master))) return;
      resolved.push(master);
    });

    return dedupeById(resolved);
  }

  const resolved = [];

  masters.forEach((master) => {
    if (hiddenMasterKeys.has(hiddenMasterKey(master))) return;
    const override = overridesByMasterId.get(String(master._id));
    resolved.push(override || master);
  });

  customs.forEach((custom) => {
    resolved.push(custom);
  });

  return dedupeById(resolved);
}
