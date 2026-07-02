import { HouseholdOnboarding } from "./models/HouseholdOnboarding.js";
import { GuidedTourConfig } from "./models/GuidedTourConfig.js";
import { grantOnboardingBites } from "./onboardingEngine.js";

// Server-side whitelist of guided-onboarding ACTIONS that grant bites. Keys
// are action-based on purpose: the client only sends a stepId after the user
// actually performed the action (dish assigned, item purchased, timer
// started…) — never for reading an explanation or pressing "Siguiente".
// Anything outside this map grants nothing. Each key is rewarded at most once
// per household EVER (rewardedSteps persists across admin resends), so
// replaying the tour cannot farm bites; testMode resends grant nothing.
export const TOUR_STEP_REWARDS = {
  plan_dish: { bites: 5, label: "Has planificado un plato" },
  randomize_day: { bites: 5, label: "Has randomizado un día" },
  mark_bought: { bites: 5, label: "Has marcado un producto como comprado" },
  create_dish_opened: { bites: 5, label: "Has abierto la creación de platos" },
  recipe_servings: { bites: 5, label: "Has ajustado los comensales de una receta" },
  recipe_execution: { bites: 5, label: "Has iniciado el modo cocina" },
  recipe_timer: { bites: 5, label: "Has usado un temporizador de receta" },
  finish: { bites: 10, label: "Onboarding guiado completado" }
};

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
      testMode: false
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
    testMode: Boolean(guidedTour.testMode)
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

// Persists resume position and grants the step reward when applicable.
// Returns { tour, awarded, amount, label } so the UI can animate the bites.
export async function progressGuidedTour(householdId, { stepIndex, stepId } = {}) {
  const record = await getRecord(householdId);
  if (!record?.guidedTour || record.guidedTour.status !== "active") {
    return { tour: normalizeGuidedTour(record?.guidedTour), awarded: false, amount: 0 };
  }

  const tour = record.guidedTour;
  const index = Number(stepIndex);
  if (Number.isInteger(index) && index >= 0 && index < 100) {
    tour.currentStepIndex = index;
  }

  let awarded = false;
  let amount = 0;
  let label = "";
  const reward = stepId ? TOUR_STEP_REWARDS[stepId] : null;
  if (reward && !tour.rewardedSteps.includes(stepId) && !tour.testMode) {
    tour.rewardedSteps.push(stepId);
    tour.totalTourBites = (tour.totalTourBites || 0) + reward.bites;
    awarded = true;
    amount = reward.bites;
    label = reward.label;
  } else if (reward && !tour.rewardedSteps.includes(stepId) && tour.testMode) {
    // Test mode: mark nothing, grant nothing — admin can replay freely.
  }

  await record.save();

  if (awarded) {
    try {
      await grantOnboardingBites(
        String(householdId),
        amount,
        `Tour guiado: ${label}`,
        { source: "guided_tour", stepId }
      );
    } catch (err) {
      console.error("[guided-tour] Failed to grant step bites:", err.message);
    }
  }

  return { tour: normalizeGuidedTour(tour), awarded, amount, label };
}

// Minimum rewarded ACTIONS required before the completion bonus pays out.
// Blocks skipping every step and still collecting the finish reward, while
// tolerating degraded environments (no recipe with timers, empty list…).
const FINISH_REWARD_MIN_ACTIONS = 3;

export async function completeGuidedTour(householdId) {
  const existing = await getRecord(householdId);
  const actionCount = (existing?.guidedTour?.rewardedSteps || [])
    .filter((s) => s !== "finish").length;

  // Award the finish bonus through the same one-time guard — only when the
  // user actually performed enough guided actions during onboarding.
  let awarded = false;
  let amount = 0;
  if (actionCount >= FINISH_REWARD_MIN_ACTIONS) {
    const result = await progressGuidedTour(householdId, { stepId: "finish" });
    awarded = result.awarded;
    amount = result.amount;
  }

  const record = await getRecord(householdId);
  if (record?.guidedTour && ["pending", "active"].includes(record.guidedTour.status)) {
    record.guidedTour.status = "completed";
    record.guidedTour.completedAt = new Date();
    await record.save();
  }
  return { tour: normalizeGuidedTour(record?.guidedTour), awarded, amount };
}

export async function skipGuidedTour(householdId) {
  const record = await getRecord(householdId);
  if (record?.guidedTour && ["pending", "active"].includes(record.guidedTour.status)) {
    record.guidedTour.status = "skipped";
    record.guidedTour.skippedAt = new Date();
    await record.save();
  }
  return normalizeGuidedTour(record?.guidedTour);
}

// ─── Admin ────────────────────────────────────────────────────────────────────

// Sets the tour back to pending so the household sees it on next app load.
// Upserts the onboarding record so the tour can also be sent to households
// that never had challenge onboarding (e.g. admin-assigned pro plans).
// rewardedSteps is intentionally NOT cleared: completing again grants nothing
// unless testMode explicitly disables rewards anyway.
export async function resendGuidedTour(householdId, { testMode = false } = {}) {
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
    testMode: Boolean(testMode)
  };
  await record.save();
  return { tour: normalizeGuidedTour(record.guidedTour), enabled: Boolean(config.enabled) };
}
