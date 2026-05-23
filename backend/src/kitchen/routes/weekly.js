import express from "express";
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
  seedWeeklyChallengeDefs
} from "../weeklyEngine.js";

const router = express.Router();

// ─── User routes ──────────────────────────────────────────────────────────────

/**
 * GET /weekly/state
 * Returns the current weekly challenge state for the authenticated household.
 */
router.get("/state", requireAuth, async (req, res) => {
  try {
    const householdId = getEffectiveHouseholdId(req.user);
    const weekly = await getWeeklyState(householdId);
    return res.json({ ok: true, weekly });
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

    return res.json({ ok: true, event, weekly });
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
router.get("/admin/households/:householdId/progress", requireAuth, requireDiod, async (req, res) => {
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
router.post("/admin/households/:householdId/reset", requireAuth, requireDiod, async (req, res) => {
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
router.post("/admin/households/:householdId/complete-challenge", requireAuth, requireDiod, async (req, res) => {
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

export default router;
