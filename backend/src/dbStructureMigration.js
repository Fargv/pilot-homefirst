const WEEK_INDEX = {
  key: { householdId: 1, weekStart: 1 },
  options: { unique: true, partialFilterExpression: { householdId: { $exists: true } } }
};

const EMAIL_INDEX = {
  key: { email: 1 },
  options: { unique: true, partialFilterExpression: { email: { $exists: true } } }
};

const TARGETS = [
  { collectionName: "kitchenweekplans", desired: WEEK_INDEX, legacy: (index) => isSingleWeekStartUnique(index) },
  { collectionName: "kitchenshoppinglists", desired: WEEK_INDEX, legacy: (index) => isSingleWeekStartUnique(index) },
  { collectionName: "kitchenusers", desired: EMAIL_INDEX, legacy: () => false }
];

// These are functional index options exposed by MongoDB's listIndexes. The
// name, namespace and version are metadata and deliberately do not trigger a
// migration. Unknown options are unsafe to classify and abort preflight.
const FUNCTIONAL_OPTIONS = [
  "unique", "sparse", "partialFilterExpression", "collation", "expireAfterSeconds",
  "wildcardProjection", "weights", "default_language", "language_override",
  "hidden", "textIndexVersion", "2dsphereIndexVersion", "bits", "min", "max"
];
const INDEX_METADATA = new Set(["key", "name", "ns", "v"]);

function stable(value) {
  if (Array.isArray(value)) return value.map(stable);
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.keys(value).sort().map((key) => [key, stable(value[key])]));
  }
  return value;
}

function comparableCollation(value) {
  if (!value || (value.locale === "simple" && Object.keys(value).length === 1)) return null;
  return value;
}

function functionalOptions(index, desired) {
  const actual = {};
  const expected = {};
  for (const option of FUNCTIONAL_OPTIONS) {
    const actualValue = option === "collation" ? comparableCollation(index[option]) : index[option];
    const expectedValue = option === "collation" ? comparableCollation(desired.options[option]) : desired.options[option];
    actual[option] = option === "unique" || option === "sparse" || option === "hidden"
      ? Boolean(actualValue)
      : (actualValue ?? null);
    expected[option] = option === "unique" || option === "sparse" || option === "hidden"
      ? Boolean(expectedValue)
      : (expectedValue ?? null);
  }
  return { actual, expected };
}

export function getUnknownIndexOptions(index) {
  return Object.keys(index).filter((option) => !INDEX_METADATA.has(option) && !FUNCTIONAL_OPTIONS.includes(option));
}

export function hasSameIndexKeys(index, desired) {
  return JSON.stringify(stable(index.key)) === JSON.stringify(stable(desired.key));
}

export function isExactIndex(index, desired) {
  if (!hasSameIndexKeys(index, desired)) return false;
  const { actual, expected } = functionalOptions(index, desired);
  return JSON.stringify(stable(actual)) === JSON.stringify(stable(expected));
}

function isSingleWeekStartUnique(index) {
  return Boolean(index.unique && index.key && Object.keys(index.key).length === 1 && index.key.weekStart === 1);
}

function isEmailIndex(index) {
  return Boolean(index.key && index.key.email === 1);
}

function normalizedEmail(value) {
  return String(value || "").trim().toLowerCase();
}

function addGroup(groups, key, doc) {
  const list = groups.get(key) || [];
  list.push(doc);
  groups.set(key, list);
}

function summarizeIndex(index) {
  return {
    name: index.name,
    key: index.key,
    options: Object.fromEntries(FUNCTIONAL_OPTIONS.filter((option) => index[option] !== undefined).map((option) => [option, index[option]])),
    unknownOptions: getUnknownIndexOptions(index)
  };
}

async function readWeekDuplicates(collection) {
  return collection.aggregate([
    { $match: { householdId: { $exists: true } } },
    { $group: {
      _id: { householdId: "$householdId", weekStart: "$weekStart" },
      ids: { $push: "$_id" },
      count: { $sum: 1 }
    } },
    { $match: { count: { $gt: 1 } } }
  ]).toArray();
}

async function readEmailDocs(collection) {
  return collection.find({ email: { $exists: true } })
    .project({ _id: 1, email: 1 })
    .toArray();
}

function classifyIndexes(indexes, target) {
  const desiredIndexes = indexes.filter((index) => isExactIndex(index, target.desired));
  const legacyIndexes = indexes.filter((index) => target.legacy(index) && !hasSameIndexKeys(index, target.desired));
  const incompatibleIndexes = indexes.filter((index) => {
    if (isExactIndex(index, target.desired)) return false;
    return hasSameIndexKeys(index, target.desired) || (target.collectionName === "kitchenusers" && isEmailIndex(index));
  });
  const unknownOptionIndexes = indexes.filter((index) => {
    const relevant = isExactIndex(index, target.desired)
      || hasSameIndexKeys(index, target.desired)
      || target.legacy(index);
    return relevant && getUnknownIndexOptions(index).length > 0;
  });
  return { desiredIndexes, legacyIndexes, incompatibleIndexes, unknownOptionIndexes };
}

export async function preflightMigration(db) {
  const indexReports = [];
  const conflicts = [];
  const warnings = [];
  const targetPlans = [];

  for (const target of TARGETS) {
    const collection = db.collection(target.collectionName);
    const indexes = await collection.indexes();
    const classification = classifyIndexes(indexes, target);
    const report = {
      collectionName: target.collectionName,
      desiredIndexes: classification.desiredIndexes.map(summarizeIndex),
      legacyIndexes: classification.legacyIndexes.map(summarizeIndex),
      incompatibleIndexes: classification.incompatibleIndexes.map(summarizeIndex),
      unknownOptionIndexes: classification.unknownOptionIndexes.map(summarizeIndex)
    };
    indexReports.push(report);
    targetPlans.push({ ...target, collection, indexes, ...classification });

    if (classification.unknownOptionIndexes.length) {
      conflicts.push({ collection: target.collectionName, type: "unknown-index-options", indexes: report.unknownOptionIndexes });
    }
    if (classification.incompatibleIndexes.length) {
      warnings.push({ collection: target.collectionName, type: "incompatible-index-options", indexes: report.incompatibleIndexes });
    }
    if (target.collectionName !== "kitchenusers") {
      const duplicateGroups = await readWeekDuplicates(collection);
      if (duplicateGroups.length) {
        conflicts.push({
          collection: target.collectionName,
          type: "duplicate-week-plan-key",
          groups: duplicateGroups.map((group) => ({ key: group._id, ids: group.ids }))
        });
      }
    }
  }

  const users = targetPlans.find((plan) => plan.collectionName === "kitchenusers");
  const emailDocs = await readEmailDocs(users.collection);
  const normalizedGroups = new Map();
  const emptyDocs = [];
  for (const doc of emailDocs) {
    const normalized = normalizedEmail(doc.email);
    if (!normalized) emptyDocs.push({ _id: doc._id, email: doc.email ?? null });
    else addGroup(normalizedGroups, normalized, { _id: doc._id, email: doc.email });
  }
  const duplicateEmails = [...normalizedGroups.entries()]
    .filter(([, docs]) => docs.length > 1)
    .map(([normalized, docs]) => ({ normalized, docs }));
  if (duplicateEmails.length) {
    conflicts.push({ collection: "kitchenusers", type: "duplicate-normalized-email", groups: duplicateEmails });
  }

  const emptyBySemanticValue = new Map();
  for (const doc of emptyDocs) addGroup(emptyBySemanticValue, doc.email === null ? "null" : "empty", doc);
  const emptyDuplicates = [...emptyBySemanticValue.entries()]
    .filter(([, docs]) => docs.length > 1)
    .map(([value, docs]) => ({ value, docs }));
  if (emptyDuplicates.length) {
    conflicts.push({ collection: "kitchenusers", type: "duplicate-empty-email", groups: emptyDuplicates });
  }

  return {
    ok: conflicts.length === 0,
    conflicts,
    warnings,
    emptyEmailDocs: emptyDocs,
    indexReports,
    targetPlans,
    diagnosis: conflicts.length
      ? "No se escribirá ni eliminará ningún índice: resuelve los conflictos indicados y repite el preflight."
      : warnings.length
        ? "Preflight correcto con advertencias: la sustitución de índices con mismas claves requiere --maintenance-window."
        : "Preflight correcto; la aplicación puede continuar con la secuencia segura documentada."
  };
}

async function createIndexVerified(collection, desired) {
  try {
    await collection.createIndex(desired.key, desired.options);
  } catch (error) {
    if (error?.codeName !== "IndexOptionsConflict" && error?.codeName !== "IndexKeySpecsConflict") throw error;
    const indexes = await collection.indexes();
    const exact = indexes.find((index) => isExactIndex(index, desired));
    if (exact) return exact.name;
    throw new Error(
      `Conflicto de índice no resuelto: claves=${JSON.stringify(desired.key)} opciones=${JSON.stringify(desired.options)} `
      + `actuales=${JSON.stringify(indexes.map(summarizeIndex))} (${error.codeName})`
    );
  }
}

async function verifyFinalTarget(plan, { allowLegacy = false } = {}) {
  const indexes = await plan.collection.indexes();
  const classification = classifyIndexes(indexes, plan);
  const desired = classification.desiredIndexes;
  const legacy = classification.legacyIndexes;
  const incompatible = classification.incompatibleIndexes;
  if (desired.length !== 1 || (!allowLegacy && legacy.length) || incompatible.length) {
    throw new Error(
      `Verificación final fallida en ${plan.collectionName}: desired=${desired.length} `
      + `legacy=${JSON.stringify(legacy.map(summarizeIndex))} incompatible=${JSON.stringify(incompatible.map(summarizeIndex))}`
    );
  }
  return indexes;
}

async function replaceIndexesForTarget(plan, { allowSameKeyReplacement }) {
  const desiredExists = plan.desiredIndexes.length > 0;
  const sameKeyIncompatible = plan.incompatibleIndexes.filter((index) => hasSameIndexKeys(index, plan.desired));
  if (sameKeyIncompatible.length && !allowSameKeyReplacement) {
    throw new Error(
      `La sustitución de índices incompatibles con las mismas claves en ${plan.collectionName} `
      + "requiere --maintenance-window; existe una ventana inevitable entre dropIndex y createIndex."
    );
  }

  // Different-key legacy indexes can coexist: create and verify first.
  if (!desiredExists && !sameKeyIncompatible.length) {
    await createIndexVerified(plan.collection, plan.desired);
    await verifyFinalTarget(plan, { allowLegacy: true });
  }

  if (sameKeyIncompatible.length) {
    for (const index of sameKeyIncompatible) await plan.collection.dropIndex(index.name);
    await createIndexVerified(plan.collection, plan.desired);
  }

  for (const index of plan.legacyIndexes) {
    await plan.collection.dropIndex(index.name);
  }
  await verifyFinalTarget(plan);
}

export async function applyMigration(db, plan, { allowSameKeyReplacement = false } = {}) {
  if (!plan?.ok) throw new Error(plan?.diagnosis || "Preflight required before apply.");

  // Index DDL is not transactional. Different-key legacy indexes use
  // create→verify→drop. Same-key replacement requires an explicit maintenance
  // window because MongoDB cannot hold both definitions concurrently.
  for (const target of plan.targetPlans) {
    if (target.collectionName === "kitchenusers") continue;
    await replaceIndexesForTarget(target, { allowSameKeyReplacement });
  }

  const users = plan.targetPlans.find((item) => item.collectionName === "kitchenusers");
  if (plan.emptyEmailDocs.length) {
    await users.collection.updateMany({ email: { $in: ["", null] } }, { $unset: { email: 1 } });
  }
  await replaceIndexesForTarget(users, { allowSameKeyReplacement });
  await verifyFinalIndexes(db, plan);
  return { ok: true };
}

export async function verifyFinalIndexes(db, plan) {
  const results = {};
  for (const target of plan.targetPlans) {
    results[target.collectionName] = await verifyFinalTarget(target);
  }
  return results;
}

export function formatMigrationDiagnosis(plan) {
  return JSON.stringify({
    ok: plan.ok,
    diagnosis: plan.diagnosis,
    conflicts: plan.conflicts,
    warnings: plan.warnings,
    indexes: plan.indexReports,
    emptyEmailDocs: plan.emptyEmailDocs
  }, null, 2);
}
