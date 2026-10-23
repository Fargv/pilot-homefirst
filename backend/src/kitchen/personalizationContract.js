export const PERSONALIZATION_SCHEMA_VERSION = 1;
const STATUSES = new Set(["unknown", "compatible", "incompatible"]);
const INGREDIENT_STATES = new Set(["unknown", "complete", "incomplete"]);

const isObject = (value) => value !== null && typeof value === "object" && !Array.isArray(value);
const nonEmpty = (value) => typeof value === "string" && value.trim().length > 0;
const isSha256 = (value) => typeof value === "string" && /^sha256:[a-f\d]{64}$/i.test(value);
const isIsoDate = (value) => nonEmpty(value) && Number.isFinite(Date.parse(value)) && /^\d{4}-\d{2}-\d{2}T/.test(value);

function validateAssessmentGroup(group, path, errors) {
  if (!isObject(group)) {
    errors.push(`${path} must be an object`);
    return;
  }
  for (const [key, assessment] of Object.entries(group)) {
    const itemPath = `${path}.${key}`;
    if (!nonEmpty(key) || !isObject(assessment) || !STATUSES.has(assessment.status)) {
      errors.push(`${itemPath} must have status unknown, compatible, or incompatible`);
      continue;
    }
    if (assessment.status === "unknown") continue;
    validateEvidence(assessment.evidence, `${itemPath}.evidence`, errors);
    if (assessment.crossContact !== undefined) validateStatusAssessment(assessment.crossContact, `${itemPath}.crossContact`, errors);
  }
}

function validateEvidence(evidence, path, errors) {
  if (!isObject(evidence) || !nonEmpty(evidence.assessmentId) || !nonEmpty(evidence.source) || !nonEmpty(evidence.sourceVersion)
    || !isSha256(evidence.contentHash) || !isIsoDate(evidence.assessedAt)) {
    errors.push(`${path} must identify an assessment and include source, sourceVersion, a sha256 contentHash, and assessedAt`);
  }
}

function validateStatusAssessment(value, path, errors) {
  if (!isObject(value) || !STATUSES.has(value.status)) {
    errors.push(`${path} must have status unknown, compatible, or incompatible`);
    return;
  }
  if (value.status !== "unknown") validateEvidence(value.evidence, `${path}.evidence`, errors);
}

export function validatePersonalization(value) {
  const errors = [];
  if (!isObject(value)) return { valid: false, errors: ["personalization must be an object"] };
  if (value.schemaVersion !== PERSONALIZATION_SCHEMA_VERSION) errors.push(`schemaVersion must be ${PERSONALIZATION_SCHEMA_VERSION}`);
  if (!Array.isArray(value.mealSlots) || value.mealSlots.length === 0 || value.mealSlots.some((slot) => !["lunch", "dinner"].includes(slot)) || new Set(value.mealSlots).size !== value.mealSlots.length) {
    errors.push("mealSlots must be a non-empty unique array containing only lunch and dinner");
  }
  if (!INGREDIENT_STATES.has(value.ingredientsComplete)) errors.push("ingredientsComplete must be unknown, complete, or incomplete");
  if (!Object.prototype.hasOwnProperty.call(value, "baseServings") || !(value.baseServings === null || (Number.isFinite(value.baseServings) && value.baseServings > 0))) errors.push("baseServings must be null when unknown or a positive finite number");
  if (value.times !== undefined) {
    if (!isObject(value.times)) errors.push("times must be an object");
    else for (const [key, minutes] of Object.entries(value.times)) {
      if (!["prepMinutes", "cookMinutes", "totalMinutes"].includes(key) || !(Number.isFinite(minutes) && minutes >= 0)) errors.push(`times.${key} must be a non-negative finite number`);
    }
  }
  if (value.requiredEquipment !== undefined && (!Array.isArray(value.requiredEquipment) || value.requiredEquipment.some((item) => !nonEmpty(item)))) errors.push("requiredEquipment must be an array of non-empty strings");
  if (!isObject(value.provenance) || !nonEmpty(value.provenance.source) || !nonEmpty(value.provenance.sourceVersion) || !isSha256(value.provenance.contentHash)) {
    errors.push("provenance must include source, sourceVersion, and a sha256 contentHash");
  }
  if (value.assessments !== undefined) {
    if (!isObject(value.assessments)) errors.push("assessments must be an object");
    else {
      for (const key of Object.keys(value.assessments)) if (!["allergens", "diets"].includes(key)) errors.push(`assessments.${key} is not supported`);
      if (value.assessments.allergens !== undefined) validateAssessmentGroup(value.assessments.allergens, "assessments.allergens", errors);
      if (value.assessments.diets !== undefined) validateAssessmentGroup(value.assessments.diets, "assessments.diets", errors);
    }
  }
  return { valid: errors.length === 0, errors };
}

export function assertValidPersonalization(value, path = "personalization") {
  const result = validatePersonalization(value);
  if (!result.valid) {
    const error = new Error(`${path}: ${result.errors.join("; ")}`);
    error.statusCode = 400;
    throw error;
  }
  return value;
}

export function isEligibleForHardRestrictions(personalization, restrictions = {}, {
  currentContentHash,
  verifyEvidence
} = {}) {
  const requested = [
    ...[...(restrictions.allergens || [])].map((key) => ["allergens", key]),
    ...[...(restrictions.diets || [])].map((key) => ["diets", key])
  ];
  if (!requested.length) return { eligible: true, reason: "no-hard-restrictions" };
  if (!validatePersonalization(personalization).valid || personalization.ingredientsComplete !== "complete") return { eligible: false, reason: "unknown" };
  for (const [group, key] of requested) {
    const assessment = personalization.assessments?.[group]?.[key];
    if (!assessment || assessment.status === "unknown") return { eligible: false, reason: "unknown", restriction: key };
    if (assessment.status === "incompatible") return { eligible: false, reason: "incompatible", restriction: key };
    if (assessment.status !== "compatible" || typeof verifyEvidence !== "function" || !isSha256(currentContentHash)
      || assessment.evidence?.contentHash !== currentContentHash || personalization.provenance.contentHash !== currentContentHash
      || verifyEvidence(assessment.evidence, { group, key, currentContentHash }) !== true) {
      return { eligible: false, reason: "unknown", restriction: key };
    }
    if (group === "allergens") {
      const crossContact = assessment.crossContact;
      if (!crossContact || crossContact.status !== "compatible" || crossContact.evidence?.contentHash !== currentContentHash
        || verifyEvidence(crossContact.evidence, { group, key, aspect: "crossContact", currentContentHash }) !== true) {
        return { eligible: false, reason: "unknown", restriction: key };
      }
    }
  }
  return { eligible: true, reason: "verified-compatible" };
}
