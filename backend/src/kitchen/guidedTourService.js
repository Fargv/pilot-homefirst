import { HouseholdOnboarding } from "./models/HouseholdOnboarding.js";
import { GuidedTourConfig } from "./models/GuidedTourConfig.js";
import { grantOnboardingBites } from "./onboardingEngine.js";

// Server-side whitelist of tour steps that grant bites. The client sends a
// stepId; anything outside this map grants nothing. Each key is rewarded at
// most once per household EVER (rewardedSteps persists across admin resends),
// so replaying the tour cannot farm bites.
export const TOUR_STEP_REWARDS = {
  planning: { bites: 5, label: "Has aprendido a planificar tu semana" },
  shopping: { bites: 5, label: "Has aprendido a usar la lista de la compra" },
  kitchen: { bites: 5, label: "Has descubierto Mi Cocina" },
  recipe: { bites: 5, label: "Has aprendido a ejecutar recetas" },
  catalog: { bites: 5, label: "Has descubierto el catálogo y los Bites" },
  finish: { bites: 5, label: "Tour de bienvenida completado" }
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

export async function completeGuidedTour(householdId) {
  // Award the finish step through the same one-time guard, then close.
  const { awarded, amount } = await progressGuidedTour(householdId, { stepId: "finish" });
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
