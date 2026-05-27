/**
 * betaProService.js — Automatic Beta Pro plan unlock
 *
 * Automatically upgrades a household to "pro" (planSource: "beta_pro") when they
 * complete BOTH: onboarding + all main weekly challenges for the current cycle week.
 *
 * ── Environment variables ────────────────────────────────────────────────────
 *
 * BETA_PRO_ENABLED=true
 *   Enable the auto-unlock. Defaults to off. Safe to flip independently of
 *   PRIVATE_BETA_ENABLED — Beta Pro can run alongside open registration.
 *
 * BETA_PRO_DURATION_DAYS=30
 *   Calendar days until Beta Pro expires from the unlock date. After expiry the
 *   household is downgraded back to "basic". Defaults to 30.
 *
 * BETA_INACTIVITY_GRACE_DAYS=14
 *   If the household has no meaningful activity for this many days while Beta Pro
 *   is active, Beta Pro expires early (reason: "inactivity"). Defaults to 14.
 *
 * ── Safety guarantees ────────────────────────────────────────────────────────
 * • Never overwrites a paid Stripe subscription (planSource === "paid" or
 *   active stripeSubscriptionId). Admin-granted plans (planSource "admin_grant")
 *   CAN be overwritten — this is intentional so beta testers can upgrade.
 * • Expiry only affects Beta Pro; any paid plan set after unlock is left untouched.
 * • Admin can grant/revoke Beta Pro at any time via Admin → Beta Insights.
 *
 * ── Unlock prerequisites ─────────────────────────────────────────────────────
 *   1. BETA_PRO_ENABLED=true
 *   2. HouseholdOnboarding.status === "completed"
 *   3. All main (non-bonus) WeeklyChallengeDef for the current cycleWeek have
 *      rewardGranted === true in HouseholdWeeklyProgress.
 *
 * ── How to disable ───────────────────────────────────────────────────────────
 *   Set BETA_PRO_ENABLED=false (or remove it). Already-unlocked households keep
 *   their "pro" plan until their expiresAt date or inactivity grace period.
 */

import { Household } from "./models/Household.js";
import { HouseholdOnboarding } from "./models/HouseholdOnboarding.js";
import { HouseholdWeeklyProgress } from "./models/HouseholdWeeklyProgress.js";
import { WeeklyChallengeDef } from "./models/WeeklyChallengeDef.js";

// Local copy to avoid circular dependency with weeklyEngine.js
function _getCycleWeekIndex(weekStartDate, cycleStartDate) {
  const MS_PER_WEEK = 7 * 24 * 60 * 60 * 1000;
  const weeksElapsed = Math.floor((weekStartDate - cycleStartDate) / MS_PER_WEEK);
  if (weeksElapsed < 0) return 1;
  return (weeksElapsed % 4) + 1;
}

// ─── Config readers ───────────────────────────────────────────────────────────

export function isBetaProEnabled() {
  return process.env.BETA_PRO_ENABLED === "true";
}

export function getBetaProDurationDays() {
  const raw = parseInt(process.env.BETA_PRO_DURATION_DAYS || "", 10);
  return !Number.isNaN(raw) && raw >= 1 ? raw : 30;
}

export function getBetaProInactivityGraceDays() {
  const raw = parseInt(process.env.BETA_INACTIVITY_GRACE_DAYS || "", 10);
  return !Number.isNaN(raw) && raw >= 1 ? raw : 14;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Returns true if the household is on a paid (Stripe-backed) subscription.
 * Protects against overwriting real paying customers.
 */
export function isPaidPlan(household) {
  if (!household) return false;
  if (household.planSource === "paid") return true;
  // Also guard active Stripe subscriptions even if planSource is not yet set.
  if (household.stripeSubscriptionId && household.subscriptionStatus === "active") return true;
  return false;
}

// ─── Meaningful activity recording ───────────────────────────────────────────

/**
 * Records that the household just performed a meaningful in-app action.
 * Called on every user-initiated event in weeklyEngine.triggerWeeklyChallenge.
 * Non-fatal: errors are logged and swallowed so they never break the caller.
 */
export async function recordMeaningfulActivity(householdId) {
  try {
    await Household.updateOne(
      { _id: householdId },
      { $set: { lastMeaningfulActivityAt: new Date() } }
    );
  } catch (err) {
    console.error("[betaPro] recordMeaningfulActivity error:", err.message);
  }
}

// ─── Challenge completion check ───────────────────────────────────────────────

/**
 * Returns { complete: boolean, cycleWeekIndex?: number } indicating whether ALL main
 * (non-bonus) challenges for the most recent weekly progress document have
 * rewardGranted === true.
 *
 * IMPORTANT: cycleWeekIndex is derived from the household's per-household cycle anchor
 * (weeklyChallengeCycleStartedAt), NOT from the stored progress.cycleWeekIndex.
 * This prevents a regression where progress docs created under the old global cycle had
 * a stale cycleWeekIndex that no longer matched the household's per-household Week 1.
 */
export async function checkAllMainChallengesComplete(householdId) {
  // Most recent progress doc for this household (any week).
  const progress = await HouseholdWeeklyProgress.findOne(
    { householdId },
    null,
    { sort: { weekStart: -1 } }
  ).lean();

  if (!progress) return { complete: false };

  // Derive cycleWeekIndex from household's own cycle anchor — not from the stored
  // progress.cycleWeekIndex, which may be stale if the cycle was migrated from global.
  const household = await Household.findById(householdId)
    .select("weeklyChallengeCycleStartedAt")
    .lean();

  const householdCycleStart = household?.weeklyChallengeCycleStartedAt;
  if (!householdCycleStart) return { complete: false };

  const cycleWeekIndex = _getCycleWeekIndex(
    new Date(progress.weekStart),
    new Date(householdCycleStart)
  );

  const mainDefs = await WeeklyChallengeDef.find({
    active: true,
    cycleWeek: cycleWeekIndex,
    curriculum: "basic",          // Beta Pro only for basic curriculum users
    triggerType: { $ne: "bonus" }
  }).lean();

  if (!mainDefs.length) return { complete: false };

  const rewardedKeys = new Set(
    (progress.completedChallenges || [])
      .filter((c) => c.rewardGranted === true)
      .map((c) => c.challengeKey)
  );

  const allDone = mainDefs.every((def) => rewardedKeys.has(def.key));
  return { complete: allDone, cycleWeekIndex };
}

// ─── Unlock ───────────────────────────────────────────────────────────────────

/**
 * Attempts to unlock Beta Pro for a household.
 * Returns { unlocked: boolean, reason?: string, expiresAt?: Date }.
 *
 * Conditions for unlock (all must be true):
 *   1. BETA_PRO_ENABLED === "true"
 *   2. Not already active
 *   3. Not a paid plan
 *   4. HouseholdOnboarding.status === "completed"
 *   5. All main weekly challenges for the current week have rewardGranted === true
 */
export async function tryUnlockBetaPro(householdId) {
  try {
    if (!isBetaProEnabled()) return { unlocked: false, reason: "disabled" };

    const household = await Household.findById(householdId).lean();
    if (!household) return { unlocked: false, reason: "household_not_found" };

    // Guard: paid plan — never overwrite
    if (isPaidPlan(household)) return { unlocked: false, reason: "paid_plan" };

    // Already active — nothing to do
    if (household.betaPro?.active) return { unlocked: false, reason: "already_active" };

    // Gate 1: onboarding completed
    const onboarding = await HouseholdOnboarding.findOne({ householdId }).lean();
    if (!onboarding || onboarding.status !== "completed") {
      return { unlocked: false, reason: "onboarding_incomplete" };
    }

    // Gate 2: all main challenges complete with rewards granted
    const { complete } = await checkAllMainChallengesComplete(householdId);
    if (!complete) return { unlocked: false, reason: "first_week_incomplete" };

    // Grant Beta Pro
    const durationDays = getBetaProDurationDays();
    const now = new Date();
    const expiresAt = new Date(now.getTime() + durationDays * 24 * 60 * 60 * 1000);

    await Household.updateOne(
      { _id: householdId },
      {
        $set: {
          subscriptionPlan: "pro",
          planSource: "beta_pro",
          isPro: true,
          "betaPro.active": true,
          "betaPro.unlockedAt": now,
          "betaPro.expiresAt": expiresAt,
          "betaPro.lastRenewedAt": now,
          "betaPro.expiredAt": null,
          "betaPro.expirationReason": ""
        }
      }
    );

    console.log(`[betaPro] Unlocked for household=${householdId}, expires=${expiresAt.toISOString()}`);
    return { unlocked: true, expiresAt };
  } catch (err) {
    console.error("[betaPro] tryUnlockBetaPro error:", err.message);
    return { unlocked: false, reason: "error" };
  }
}

// ─── Read-only eligibility inspect ──────────────────────────────────────────

/**
 * Returns Beta Pro eligibility reason WITHOUT granting.
 * Safe to call from admin state-view endpoints (GET).
 */
export async function inspectBetaProEligibility(householdId) {
  try {
    if (!isBetaProEnabled()) return { result: "beta_pro_disabled" };

    const household = await Household.findById(householdId).lean();
    if (!household) return { result: "error", detail: "household_not_found" };
    if (isPaidPlan(household)) return { result: "already_paid_plan" };
    if (household.betaPro?.active) return { result: "already_beta_pro" };

    const onboarding = await HouseholdOnboarding.findOne({ householdId }).lean();
    if (!onboarding || onboarding.status !== "completed") {
      return { result: "onboarding_incomplete" };
    }
    if (!household.weeklyChallengeCycleStartedAt) {
      return { result: "missing_cycle_anchor" };
    }

    const { complete, cycleWeekIndex } = await checkAllMainChallengesComplete(householdId);
    if (!complete) return { result: "first_week_incomplete", cycleWeekIndex };

    return { result: "eligible" };
  } catch (err) {
    console.error("[betaPro] inspectBetaProEligibility error:", err.message);
    return { result: "error", detail: err.message };
  }
}

// ─── Idempotent check-and-grant ──────────────────────────────────────────────

/**
 * Safe, idempotent Beta Pro eligibility check and grant.
 * Call this after any event that could affect eligibility:
 *   - onboarding completion
 *   - weekly challenge completion
 *   - admin re-evaluation
 *
 * Returns one of:
 *   granted             — Beta Pro just unlocked
 *   already_beta_pro    — already active, nothing to do
 *   already_paid_plan   — paid Stripe plan; never overwrite
 *   onboarding_incomplete
 *   first_week_incomplete — challenges exist but not all rewarded
 *   beta_pro_disabled   — BETA_PRO_ENABLED !== "true"
 *   missing_cycle_anchor — household never started weekly challenges
 *   error               — unexpected exception
 */
export async function checkAndGrantBetaPro(householdId) {
  try {
    if (!isBetaProEnabled()) return { result: "beta_pro_disabled" };

    const household = await Household.findById(householdId).lean();
    if (!household) return { result: "error", detail: "household_not_found" };

    if (isPaidPlan(household)) return { result: "already_paid_plan" };
    if (household.betaPro?.active) return { result: "already_beta_pro" };

    const onboarding = await HouseholdOnboarding.findOne({ householdId }).lean();
    if (!onboarding || onboarding.status !== "completed") {
      return { result: "onboarding_incomplete" };
    }

    if (!household.weeklyChallengeCycleStartedAt) {
      return { result: "missing_cycle_anchor" };
    }

    const { complete, cycleWeekIndex } = await checkAllMainChallengesComplete(householdId);
    if (!complete) return { result: "first_week_incomplete", cycleWeekIndex };

    const durationDays = getBetaProDurationDays();
    const now = new Date();
    const expiresAt = new Date(now.getTime() + durationDays * 24 * 60 * 60 * 1000);

    await Household.updateOne(
      { _id: householdId },
      {
        $set: {
          subscriptionPlan: "pro",
          planSource: "beta_pro",
          isPro: true,
          "betaPro.active": true,
          "betaPro.unlockedAt": now,
          "betaPro.expiresAt": expiresAt,
          "betaPro.lastRenewedAt": now,
          "betaPro.expiredAt": null,
          "betaPro.expirationReason": ""
        }
      }
    );

    console.log(`[betaPro] checkAndGrantBetaPro: granted household=${householdId}, expires=${expiresAt.toISOString()}`);
    return { result: "granted", expiresAt };
  } catch (err) {
    console.error("[betaPro] checkAndGrantBetaPro error:", err.message);
    return { result: "error", detail: err.message };
  }
}

// ─── Lazy expiry checks ───────────────────────────────────────────────────────

/**
 * Internal: downgrades an active Beta Pro to free and records the reason.
 */
async function _expireBetaPro(householdId, reason) {
  const now = new Date();
  await Household.updateOne(
    { _id: householdId },
    {
      $set: {
        "betaPro.active": false,
        "betaPro.expiredAt": now,
        "betaPro.expirationReason": reason,
        subscriptionPlan: "free",
        planSource: "manual",
        isPro: false
      }
    }
  );
  console.log(`[betaPro] Expired (${reason}) for household=${householdId}`);
}

/**
 * Runs lazy expiry checks (calendar + inactivity) for a household.
 * Safe to call on every request — no-ops if betaPro is not active.
 * Returns { expired: boolean, reason?: string }.
 */
export async function runLazyExpiryChecks(householdId) {
  try {
    const household = await Household.findById(householdId)
      .select("betaPro planSource lastMeaningfulActivityAt subscriptionPlan subscriptionStatus stripeSubscriptionId")
      .lean();

    if (!household?.betaPro?.active) return { expired: false };

    const now = new Date();

    // 1. Calendar expiry: expiresAt date reached
    if (household.betaPro.expiresAt && new Date(household.betaPro.expiresAt) <= now) {
      await _expireBetaPro(householdId, "plan_expired");
      return { expired: true, reason: "plan_expired" };
    }

    // 2. Inactivity expiry: no meaningful action within grace period
    const graceDays = getBetaProInactivityGraceDays();
    // Baseline: use lastMeaningfulActivityAt if set, otherwise fall back to unlockedAt
    const baseline = household.lastMeaningfulActivityAt || household.betaPro.unlockedAt;
    if (baseline) {
      const daysSince = (now.getTime() - new Date(baseline).getTime()) / (1000 * 60 * 60 * 24);
      if (daysSince >= graceDays) {
        await _expireBetaPro(householdId, "inactivity");
        return { expired: true, reason: "inactivity" };
      }
    }

    return { expired: false };
  } catch (err) {
    console.error("[betaPro] runLazyExpiryChecks error:", err.message);
    return { expired: false };
  }
}

// ─── Safe serializer ──────────────────────────────────────────────────────────

/**
 * Returns a safe, frontend-ready snapshot of the betaPro subdoc.
 * Hides internal fields; only exposes what the UI needs.
 */
export function serializeBetaPro(betaPro) {
  if (!betaPro) return null;
  return {
    active: betaPro.active ?? false,
    unlockedAt: betaPro.unlockedAt ?? null,
    expiresAt: betaPro.expiresAt ?? null,
    expiredAt: betaPro.expiredAt ?? null,
    expirationReason: betaPro.expirationReason ?? ""
  };
}
