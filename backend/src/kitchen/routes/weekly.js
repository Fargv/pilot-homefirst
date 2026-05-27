import express from "express";
import mongoose from "mongoose";
import { requireAuth, requireDiod } from "../middleware.js";
import { getEffectiveHouseholdId } from "../householdScope.js";
import {
  triggerWeeklyChallenge,
  getWeeklyState,
  adminGetAllChallengeDefs,
  adminCreateChallengeDef,
  adminUpdateChallengeDef,
  adminDeleteChallengeDef,
  adminGetCycleConfig,
  adminUpdateCycleConfig,
  adminGetHouseholdProgress,
  adminResetHouseholdProgress,
  adminForceCompleteChallenge,
  adminGetHouseholdCycleState,
  adminResetHouseholdCycle,
  adminSetHouseholdCycleWeek,
  seedWeeklyChallengeDefs
} from "../weeklyEngine.js";
import { runLazyExpiryChecks, serializeBetaPro, checkAndGrantBetaPro } from "../betaProService.js";
import { Household } from "../models/Household.js";

const router = express.Router();

function validateAdminHouseholdObjectId(req, res, next) {
  const householdId = String(req.params.householdId || "");
  if (!mongoose.isValidObjectId(householdId)) {
    return res.status(400).json({
      ok: false,
      code: "INVALID_HOUSEHOLD_ID",
      error: `householdId invalido: "${householdId}". Usa el ObjectId real de MongoDB, no el codigo corto.`
    });
  }
  return next();
}

// ─── User routes ──────────────────────────────────────────────────────────────

/**
 * GET /weekly/state
 * Returns the current weekly challenge state for the authenticated household.
 */
router.get("/state", requireAuth, async (req, res) => {
  try {
    const householdId = getEffectiveHouseholdId(req.user);

    // Lazy expiry checks — runs only when betaPro is active, no-ops otherwise.
    await runLazyExpiryChecks(householdId);

    const weekly = await getWeeklyState(householdId);

    // Include betaPro snapshot so the frontend can show the badge / expiry info.
    const household = await Household.findById(householdId)
      .select("betaPro planSource")
      .lean();
    const betaPro = serializeBetaPro(household?.betaPro);

    return res.json({ ok: true, weekly, betaPro });
  } catch (err) {
    console.error("[weekly] GET /state error:", err.message);
    return res.status(500).json({ ok: false, error: err.message });
  }
});

/**
 * POST /weekly/trigger
 * Body: { type: string, contextData?: object }
 * Triggers a weekly challenge event and returns updated state.
 */
router.post("/trigger", requireAuth, async (req, res) => {
  try {
    const householdId = getEffectiveHouseholdId(req.user);
    const { type, contextData = {} } = req.body;

    if (!type) {
      return res.status(400).json({ ok: false, error: "Missing 'type' in request body." });
    }

    const event = await triggerWeeklyChallenge(householdId, type, contextData);
    const weekly = await getWeeklyState(householdId);
    const betaProUnlocked = event?.betaProUnlocked ?? false;

    // Enrich the event with challenge objects so the frontend toast can display titles/bites.
    // The frontend WeeklyChallengeContext expects event.challenges (array of objects),
    // but triggerWeeklyChallenge only returns event.completed (array of keys).
    let enrichedEvent = event;
    if (event?.completed?.length > 0 && weekly?.challenges) {
      const completedSet = new Set(event.completed);
      const completedChallenges = [
        ...weekly.challenges.filter((c) => completedSet.has(c.key)),
        ...(weekly.bonus && completedSet.has(weekly.bonus.key) ? [weekly.bonus] : [])
      ];
      enrichedEvent = {
        ...event,
        challenges: completedChallenges,
        bonusCompleted: weekly.bonus ? completedSet.has(weekly.bonus.key) : false,
        bonusBites: weekly.bonus?.rewardBites ?? 0
      };
    }

    return res.json({ ok: true, event: enrichedEvent, weekly, betaProUnlocked });
  } catch (err) {
    console.error("[weekly] POST /trigger error:", err.message);
    return res.status(500).json({ ok: false, error: err.message });
  }
});

/**
 * POST /weekly/activity
 * Tracks app activity for the current day (app_activity event).
 */
router.post("/activity", requireAuth, async (req, res) => {
  try {
    const householdId = getEffectiveHouseholdId(req.user);
    const date = req.body?.date || new Date().toISOString().slice(0, 10);
    await triggerWeeklyChallenge(householdId, "app_activity", { date });
    return res.json({ ok: true });
  } catch (err) {
    console.error("[weekly] POST /activity error:", err.message);
    return res.status(500).json({ ok: false, error: err.message });
  }
});

// ─── Admin routes ──────────────────────────────────────────────────────────────

/**
 * GET /weekly/admin/config
 * Returns the current cycle configuration.
 */
router.get("/admin/config", requireAuth, requireDiod, async (req, res) => {
  try {
    const config = await adminGetCycleConfig();
    return res.json({ ok: true, config });
  } catch (err) {
    console.error("[weekly] GET /admin/config error:", err.message);
    return res.status(500).json({ ok: false, error: err.message });
  }
});

/**
 * PUT /weekly/admin/config
 * Body: { cycleStartDate?, paused?, bonusBites? }
 */
router.put("/admin/config", requireAuth, requireDiod, async (req, res) => {
  try {
    const config = await adminUpdateCycleConfig(req.body);
    return res.json({ ok: true, config });
  } catch (err) {
    console.error("[weekly] PUT /admin/config error:", err.message);
    return res.status(500).json({ ok: false, error: err.message });
  }
});

/**
 * GET /weekly/admin/challenges
 * Returns all challenge definitions sorted by cycleWeek, cycleOrder.
 */
router.get("/admin/challenges", requireAuth, requireDiod, async (req, res) => {
  try {
    const challenges = await adminGetAllChallengeDefs();
    return res.json({ ok: true, challenges });
  } catch (err) {
    console.error("[weekly] GET /admin/challenges error:", err.message);
    return res.status(500).json({ ok: false, error: err.message });
  }
});

/**
 * POST /weekly/admin/challenges
 * Body: challenge definition fields
 */
router.post("/admin/challenges", requireAuth, requireDiod, async (req, res) => {
  try {
    const challenge = await adminCreateChallengeDef(req.body);
    return res.status(201).json({ ok: true, challenge });
  } catch (err) {
    console.error("[weekly] POST /admin/challenges error:", err.message);
    return res.status(400).json({ ok: false, error: err.message });
  }
});

/**
 * PUT /weekly/admin/challenges/:id
 * Body: fields to update
 */
router.put("/admin/challenges/:id", requireAuth, requireDiod, async (req, res) => {
  try {
    const challenge = await adminUpdateChallengeDef(req.params.id, req.body);
    if (!challenge) {
      return res.status(404).json({ ok: false, error: "Challenge not found." });
    }
    return res.json({ ok: true, challenge });
  } catch (err) {
    console.error("[weekly] PUT /admin/challenges/:id error:", err.message);
    return res.status(400).json({ ok: false, error: err.message });
  }
});

/**
 * DELETE /weekly/admin/challenges/:id
 */
router.delete("/admin/challenges/:id", requireAuth, requireDiod, async (req, res) => {
  try {
    const result = await adminDeleteChallengeDef(req.params.id);
    if (!result) {
      return res.status(404).json({ ok: false, error: "Challenge not found." });
    }
    return res.json({ ok: true });
  } catch (err) {
    console.error("[weekly] DELETE /admin/challenges/:id error:", err.message);
    return res.status(500).json({ ok: false, error: err.message });
  }
});

/**
 * GET /weekly/admin/households/:householdId/progress
 */
router.get("/admin/households/:householdId/progress", requireAuth, requireDiod, validateAdminHouseholdObjectId, async (req, res) => {
  try {
    const progress = await adminGetHouseholdProgress(req.params.householdId);
    return res.json({ ok: true, progress });
  } catch (err) {
    console.error("[weekly] GET /admin/households/:householdId/progress error:", err.message);
    return res.status(500).json({ ok: false, error: err.message });
  }
});

/**
 * POST /weekly/admin/households/:householdId/reset
 */
router.post("/admin/households/:householdId/reset", requireAuth, requireDiod, validateAdminHouseholdObjectId, async (req, res) => {
  try {
    await adminResetHouseholdProgress(req.params.householdId);
    return res.json({ ok: true });
  } catch (err) {
    console.error("[weekly] POST /admin/households/:householdId/reset error:", err.message);
    return res.status(500).json({ ok: false, error: err.message });
  }
});

/**
 * POST /weekly/admin/households/:householdId/complete-challenge
 * Body: { challengeKey: string }
 */
router.post("/admin/households/:householdId/complete-challenge", requireAuth, requireDiod, validateAdminHouseholdObjectId, async (req, res) => {
  try {
    const { challengeKey } = req.body;
    if (!challengeKey) {
      return res.status(400).json({ ok: false, error: "Missing 'challengeKey' in body." });
    }
    const result = await adminForceCompleteChallenge(req.params.householdId, challengeKey);
    return res.json(result);
  } catch (err) {
    console.error("[weekly] POST /admin/households/:householdId/complete-challenge error:", err.message);
    return res.status(400).json({ ok: false, error: err.message });
  }
});

/**
 * POST /weekly/admin/seed
 * Re-seeds the weekly challenge definitions.
 */
router.post("/admin/seed", requireAuth, requireDiod, async (req, res) => {
  try {
    await seedWeeklyChallengeDefs();
    return res.json({ ok: true, message: "Weekly challenge defs re-seeded." });
  } catch (err) {
    console.error("[weekly] POST /admin/seed error:", err.message);
    return res.status(500).json({ ok: false, error: err.message });
  }
});

// ─── Cycle & Beta Pro testing admin endpoints ─────────────────────────────────

/**
 * GET /weekly/admin/households/:householdId/cycle-state
 * Returns a household's full cycle state for the admin testing panel.
 */
router.get("/admin/households/:householdId/cycle-state", requireAuth, requireDiod, validateAdminHouseholdObjectId, async (req, res) => {
  try {
    const state = await adminGetHouseholdCycleState(req.params.householdId);
    return res.json({ ok: true, state });
  } catch (err) {
    console.error("[weekly] GET cycle-state error:", err.message);
    return res.status(400).json({ ok: false, error: err.message });
  }
});

/**
 * POST /weekly/admin/households/:householdId/reset-cycle
 * Resets the household's cycle anchor and current-week progress to Week 1.
 */
router.post("/admin/households/:householdId/reset-cycle", requireAuth, requireDiod, validateAdminHouseholdObjectId, async (req, res) => {
  try {
    const result = await adminResetHouseholdCycle(req.params.householdId);
    return res.json(result);
  } catch (err) {
    console.error("[weekly] POST reset-cycle error:", err.message);
    return res.status(400).json({ ok: false, error: err.message });
  }
});

/**
 * POST /weekly/admin/households/:householdId/set-cycle-week
 * Body: { week: 1|2|3|4 }
 * Forces this calendar week to be the given cycle week for the household.
 */
router.post("/admin/households/:householdId/set-cycle-week", requireAuth, requireDiod, validateAdminHouseholdObjectId, async (req, res) => {
  try {
    const week = Number(req.body?.week);
    if (!week || week < 1 || week > 4) {
      return res.status(400).json({ ok: false, error: "week must be 1-4." });
    }
    const result = await adminSetHouseholdCycleWeek(req.params.householdId, week);
    return res.json(result);
  } catch (err) {
    console.error("[weekly] POST set-cycle-week error:", err.message);
    return res.status(400).json({ ok: false, error: err.message });
  }
});

/**
 * POST /weekly/admin/households/:householdId/check-beta-pro
 * Runs the idempotent Beta Pro eligibility check and grants if eligible.
 * Returns the result with reason code.
 */
router.post("/admin/households/:householdId/check-beta-pro", requireAuth, requireDiod, validateAdminHouseholdObjectId, async (req, res) => {
  try {
    const result = await checkAndGrantBetaPro(req.params.householdId);
    return res.json({ ok: true, betaPro: result });
  } catch (err) {
    console.error("[weekly] POST check-beta-pro error:", err.message);
    return res.status(500).json({ ok: false, error: err.message });
  }
});

export default router;
