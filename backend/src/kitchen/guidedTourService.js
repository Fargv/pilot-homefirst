import { HouseholdOnboarding } from "./models/HouseholdOnboarding.js";
import { GuidedTourConfig } from "./models/GuidedTourConfig.js";
import { KitchenDish } from "./models/KitchenDish.js";

// PRODUCT DECISION (2026-07): the guided tutorial NEVER grants bites. It only
// teaches where things are; the challenge onboarding (onboardingEngine) is the
// single reward system. The tutorial's finish screen hands the user off to the
// challenge panel. rewardedSteps/totalTourBites remain in the schema as legacy
// data from the earlier rewarded version but are never written again.

// ─── Onboarding recipe (Pollo al horno) ──────────────────────────────────────

// Accent/case-insensitive dish-name normalization, shared with the frontend
// lookup contract (frontend has its own copy; the test suite pins parity).
export function normalizeDishName(name) {
  return String(name || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

export const ONBOARDING_RECIPE_NAME = "Pollo al horno";

// Master-scope seed: visible in every household's Mi Cocina (the existing
// master mechanism), so the guided onboarding ALWAYS has a recipe with
// ingredients, steps and timers to teach with. Follows the catalog recipe
// rules: structured quantities, baseServings, ingredientRefs per step.
export async function seedOnboardingRecipe() {
  const masters = await KitchenDish.find({ scope: "master", isArchived: { $ne: true } })
    .select("name recipe.steps").lean();
  const target = normalizeDishName(ONBOARDING_RECIPE_NAME);
  const existing = masters.find((d) => normalizeDishName(d.name).includes(target));
  if (existing) {
    const steps = Array.isArray(existing.recipe?.steps) ? existing.recipe.steps : [];
    const hasTimer = steps.some((s) => s?.hasTimer || Number(s?.durationSeconds) > 0);
    if (!hasTimer) {
      console.warn(`[guided-tour] Master "${existing.name}" exists but has no timer step — onboarding timer step will be degraded.`);
    }
    return existing;
  }

  const dish = await KitchenDish.create({
    scope: "master",
    name: ONBOARDING_RECIPE_NAME,
    source: "onboarding_seed",
    isDinner: false,
    special: false,
    allowRandom: true,
    ingredients: [
      { displayName: "Muslos de pollo", canonicalName: "muslo de pollo" },
      { displayName: "Patata", canonicalName: "patata" },
      { displayName: "Cebolla", canonicalName: "cebolla" },
      { displayName: "Ajo", canonicalName: "ajo" },
      { displayName: "Aceite de oliva", canonicalName: "aceite de oliva" },
      { displayName: "Romero", canonicalName: "romero" }
    ],
    recipe: {
      servings: 4,
      prepMinutes: 15,
      cookMinutes: 50,
      ingredients: [
        { name: "Muslos de pollo", quantity: { amount: 4, unit: "unidad", scalable: true, originalText: "4 unidades" } },
        { name: "Patata", quantity: { amount: 2, unit: "unidad", scalable: true, originalText: "2 unidades" } },
        { name: "Cebolla", quantity: { amount: 1, unit: "unidad", scalable: true, originalText: "1 unidad" } },
        { name: "Ajo", quantity: { amount: 2, unit: "diente", scalable: true, originalText: "2 dientes" } },
        { name: "Aceite de oliva", quantity: { amount: 2, unit: "cucharada", scalable: true, originalText: "2 cucharadas" } },
        { name: "Romero", quantity: { amount: 1, unit: "rama", scalable: false, originalText: "1 rama" } }
      ],
      steps: [
        {
          order: 1,
          title: "Prepara la bandeja",
          text: "Precalienta el horno a 200 ºC. Pela y corta las patatas en rodajas y la cebolla en gajos; extiéndelas en la bandeja.",
          hasTimer: false,
          durationSeconds: null,
          timerLabel: null,
          ingredientRefs: [{ name: "Patata" }, { name: "Cebolla" }]
        },
        {
          order: 2,
          title: "Adereza el pollo",
          text: "Salpimenta los muslos, colócalos sobre la bandeja y añade el ajo, el romero y un chorro de aceite de oliva.",
          hasTimer: false,
          durationSeconds: null,
          timerLabel: null,
          ingredientRefs: [
            { name: "Muslos de pollo" }, { name: "Ajo" },
            { name: "Romero" }, { name: "Aceite de oliva" }
          ]
        },
        {
          order: 3,
          title: "Hornea",
          text: "Hornea a 200 ºC hasta que el pollo esté dorado y las patatas tiernas.",
          hasTimer: true,
          durationSeconds: 2700,
          timerLabel: "Horneado 45 min",
          ingredientRefs: [{ name: "Muslos de pollo" }]
        },
        {
          order: 4,
          title: "Reposa y sirve",
          text: "Saca la bandeja, deja reposar unos minutos y sirve caliente.",
          hasTimer: true,
          durationSeconds: 300,
          timerLabel: "Reposo 5 min",
          ingredientRefs: []
        }
      ]
    }
  });
  console.log(`[guided-tour] Seeded master onboarding recipe "${ONBOARDING_RECIPE_NAME}".`);
  return dish;
}

// ─── Global config ────────────────────────────────────────────────────────────

export async function getGuidedTourConfig() {
  let config = await GuidedTourConfig.findOne({ key: "default" }).lean();
  if (!config) {
    config = (await GuidedTourConfig.create({ key: "default" })).toObject();
  }
  return config;
}

export async function isGuidedTourEnabled() {
  try {
    const config = await getGuidedTourConfig();
    return Boolean(config.enabled);
  } catch {
    return false;
  }
}

export async function updateGuidedTourConfig({ enabled, version }, adminUserId = null) {
  const update = { updatedBy: adminUserId };
  if (enabled !== undefined) update.enabled = Boolean(enabled);
  if (version !== undefined) {
    const v = Number(version);
    if (!Number.isInteger(v) || v < 1) throw new Error("version inválida.");
    update.version = v;
  }
  return GuidedTourConfig.findOneAndUpdate(
    { key: "default" },
    { $set: update },
    { new: true, upsert: true }
  ).lean();
}

// ─── State ────────────────────────────────────────────────────────────────────

// Legacy HouseholdOnboarding docs have no guidedTour path; treat as "none"
// (never auto-launch for households that predate the tour).
export function normalizeGuidedTour(guidedTour) {
  if (!guidedTour) {
    return {
      status: "none",
      version: 1,
      currentStepIndex: 0,
      rewardedSteps: [],
      totalTourBites: 0,
      lastSentAt: null,
      startedAt: null,
      completedAt: null,
      skippedAt: null,
      testMode: false,
      currentStepId: "",
      stepStartedAt: null,
      completedStepIds: [],
      skippedStepIds: [],
      stalledStepId: "",
      lastMissingTarget: ""
    };
  }
  return {
    status: guidedTour.status || "none",
    version: guidedTour.version ?? 1,
    currentStepIndex: guidedTour.currentStepIndex ?? 0,
    rewardedSteps: guidedTour.rewardedSteps || [],
    totalTourBites: guidedTour.totalTourBites ?? 0,
    lastSentAt: guidedTour.lastSentAt ?? null,
    startedAt: guidedTour.startedAt ?? null,
    completedAt: guidedTour.completedAt ?? null,
    skippedAt: guidedTour.skippedAt ?? null,
    testMode: Boolean(guidedTour.testMode),
    currentStepId: guidedTour.currentStepId || "",
    stepStartedAt: guidedTour.stepStartedAt ?? null,
    completedStepIds: guidedTour.completedStepIds || [],
    skippedStepIds: guidedTour.skippedStepIds || [],
    stalledStepId: guidedTour.stalledStepId || "",
    lastMissingTarget: guidedTour.lastMissingTarget || ""
  };
}

async function getRecord(householdId) {
  return HouseholdOnboarding.findOne({ householdId });
}

// ─── User transitions ─────────────────────────────────────────────────────────

export async function startGuidedTour(householdId) {
  const record = await getRecord(householdId);
  if (!record?.guidedTour || !["pending", "active"].includes(record.guidedTour.status)) {
    return normalizeGuidedTour(record?.guidedTour);
  }
  record.guidedTour.status = "active";
  if (!record.guidedTour.startedAt) record.guidedTour.startedAt = new Date();
  await record.save();
  return normalizeGuidedTour(record.guidedTour);
}

// Persists resume position + stall telemetry. NO rewards here — the tutorial
// never grants bites (challenge onboarding is the only reward system).
export async function progressGuidedTour(
  householdId,
  { stepIndex, currentStepId, completedStepId, skippedStepId, missingTarget } = {}
) {
  const record = await getRecord(householdId);
  if (!record?.guidedTour || record.guidedTour.status !== "active") {
    return { tour: normalizeGuidedTour(record?.guidedTour) };
  }

  const tour = record.guidedTour;
  const index = Number(stepIndex);
  if (Number.isInteger(index) && index >= 0 && index < 100) {
    tour.currentStepIndex = index;
  }

  // Telemetry: where the user is, what they finished/skipped, what failed.
  if (currentStepId && tour.currentStepId !== String(currentStepId)) {
    tour.currentStepId = String(currentStepId).slice(0, 64);
    tour.stepStartedAt = new Date();
  }
  if (completedStepId) {
    const id = String(completedStepId).slice(0, 64);
    if (!tour.completedStepIds.includes(id)) tour.completedStepIds.push(id);
  }
  if (skippedStepId) {
    const id = String(skippedStepId).slice(0, 64);
    if (!tour.skippedStepIds.includes(id)) tour.skippedStepIds.push(id);
  }
  if (missingTarget) {
    tour.lastMissingTarget = String(missingTarget).slice(0, 160);
    console.warn(`[guided-tour] Missing target reported household=${householdId}: ${tour.lastMissingTarget}`);
  }

  await record.save();
  return { tour: normalizeGuidedTour(tour) };
}

export async function completeGuidedTour(householdId) {
  const record = await getRecord(householdId);
  if (record?.guidedTour && ["pending", "active"].includes(record.guidedTour.status)) {
    record.guidedTour.status = "completed";
    record.guidedTour.completedAt = new Date();
    await record.save();
  }
  return { tour: normalizeGuidedTour(record?.guidedTour) };
}

export async function skipGuidedTour(householdId, { stalledStepId } = {}) {
  const record = await getRecord(householdId);
  if (record?.guidedTour && ["pending", "active"].includes(record.guidedTour.status)) {
    record.guidedTour.status = "skipped";
    record.guidedTour.skippedAt = new Date();
    // Where the user bailed — the single most useful onboarding metric.
    if (stalledStepId) record.guidedTour.stalledStepId = String(stalledStepId).slice(0, 64);
    await record.save();
  }
  return normalizeGuidedTour(record?.guidedTour);
}

// ─── Admin ────────────────────────────────────────────────────────────────────

// Sets the tutorial back to pending so the household sees it on next app load.
// Upserts the onboarding record so it can also be sent to households that
// never had challenge onboarding (e.g. admin-assigned pro plans). Replaying is
// always safe: the tutorial grants no bites, and challenge rewards/state are
// untouched.
export async function resendGuidedTour(householdId) {
  const config = await getGuidedTourConfig();
  let record = await getRecord(householdId);
  if (!record) {
    // "disabled" keeps the challenge banner/triggers off for households that
    // never had challenge onboarding — the record exists only to carry the tour.
    record = await HouseholdOnboarding.create({ householdId, status: "disabled" });
  }
  const previous = record.guidedTour || {};
  record.guidedTour = {
    ...normalizeGuidedTour(previous),
    status: "pending",
    version: config.version,
    currentStepIndex: 0,
    lastSentAt: new Date(),
    completedAt: null,
    skippedAt: null,
    startedAt: null,
    // fresh telemetry for the new run
    currentStepId: "",
    stepStartedAt: null,
    completedStepIds: [],
    skippedStepIds: [],
    stalledStepId: "",
    lastMissingTarget: ""
  };
  await record.save();
  return { tour: normalizeGuidedTour(record.guidedTour), enabled: Boolean(config.enabled) };
}
