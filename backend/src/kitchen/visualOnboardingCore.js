export const VISUAL_ONBOARDING_FLOW_VERSION = 1;
export const VISUAL_ONBOARDING_STATUSES = Object.freeze([
  "not_started",
  "in_progress",
  "completed",
  "skipped"
]);

const DRAFT_FIELDS = new Set(["weekSelection"]);
const WEEK_SELECTIONS = new Set(["current_week", "next_week"]);
const SAVE_FIELDS = new Set(["expectedRevision", "currentStep", "responses"]);
const SKIP_FIELDS = new Set(["expectedRevision"]);

export class VisualOnboardingInputError extends Error {
  constructor(message) {
    super(message);
    this.name = "VisualOnboardingInputError";
  }
}

export function validateExpectedRevision(value) {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new VisualOnboardingInputError("expectedRevision debe ser un entero no negativo.");
  }
  return value;
}

function assertAllowedKeys(value, allowed, label) {
  const unknown = Object.keys(value).filter((key) => !allowed.has(key));
  if (unknown.length) {
    throw new VisualOnboardingInputError(`Campo no permitido en ${label}: ${unknown.join(", ")}.`);
  }
}

export function validateDraftPatch(body) {
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    throw new VisualOnboardingInputError("El cuerpo debe ser un objeto JSON.");
  }
  assertAllowedKeys(body, SAVE_FIELDS, "el borrador");
  if (!("expectedRevision" in body)) {
    throw new VisualOnboardingInputError("expectedRevision es obligatorio.");
  }

  const patch = { expectedRevision: validateExpectedRevision(body.expectedRevision) };
  if ("currentStep" in body) {
    if (!Number.isSafeInteger(body.currentStep) || body.currentStep < 0 || body.currentStep > 100) {
      throw new VisualOnboardingInputError("currentStep debe ser un entero entre 0 y 100.");
    }
    patch.currentStep = body.currentStep;
  }

  if ("responses" in body) {
    const responses = body.responses;
    if (!responses || typeof responses !== "object" || Array.isArray(responses)) {
      throw new VisualOnboardingInputError("responses debe ser un objeto.");
    }
    assertAllowedKeys(responses, DRAFT_FIELDS, "responses");
    patch.responses = {};
    if ("weekSelection" in responses) {
      if (responses.weekSelection !== null && !WEEK_SELECTIONS.has(responses.weekSelection)) {
        throw new VisualOnboardingInputError("responses.weekSelection debe ser current_week o next_week.");
      }
      patch.responses.weekSelection = responses.weekSelection;
    }
  }

  if (!Object.hasOwn(patch, "currentStep") && !Object.hasOwn(patch, "responses")) {
    throw new VisualOnboardingInputError("Indica currentStep o responses para guardar.");
  }
  return patch;
}

export function validateSkipRequest(body) {
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    throw new VisualOnboardingInputError("El cuerpo debe ser un objeto JSON.");
  }
  assertAllowedKeys(body, SKIP_FIELDS, "la omisión");
  if (!("expectedRevision" in body)) {
    throw new VisualOnboardingInputError("expectedRevision es obligatorio.");
  }
  return { expectedRevision: validateExpectedRevision(body.expectedRevision) };
}

export function isVisualOnboardingOwner(user, household) {
  return Boolean(
    user?._id
    && user.role === "owner"
    && household?.ownerUserId
    && String(user._id) === String(household.ownerUserId)
  );
}

export function projectVisualOnboardingProgress(record, householdId) {
  if (!record) {
    return {
      householdId: String(householdId),
      flowVersion: VISUAL_ONBOARDING_FLOW_VERSION,
      status: "not_started",
      currentStep: 0,
      responses: {},
      revision: 0,
      createdAt: null,
      updatedAt: null
    };
  }
  return {
    householdId: String(record.householdId),
    flowVersion: record.flowVersion,
    status: record.status,
    currentStep: record.currentStep,
    responses: record.responses || {},
    revision: record.revision,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt
  };
}
