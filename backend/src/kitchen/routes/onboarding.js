import express from "express";
import mongoose from "mongoose";
import { requireAuth, requireDiod } from "../middleware.js";
import { getEffectiveHouseholdId } from "../householdScope.js";
import { OnboardingChallenge } from "../models/OnboardingChallenge.js";
import { HouseholdOnboarding } from "../models/HouseholdOnboarding.js";
import {
  getOnboardingState,
  triggerOnboarding,
  resetOnboarding,
  setOnboardingStatus,
  initOnboarding
} from "../onboardingEngine.js";

const router = express.Router();

// ─── User: get state ──────────────────────────────────────────────────────────

router.get("/state", requireAuth, async (req, res) => {
  try {
    const householdId = getEffectiveHouseholdId(req.user);
    const state = await getOnboardingState(householdId);
    return res.json({ ok: true, onboarding: state });
  } catch (err) {
    return res.status(500).json({ ok: false, error: err.message });
  }
});

// ─── User: trigger ────────────────────────────────────────────────────────────

router.post("/trigger", requireAuth, async (req, res) => {
  try {
    const { type } = req.body || {};
    if (!type) return res.status(400).json({ ok: false, error: "type requerido." });

    const householdId = getEffectiveHouseholdId(req.user);
    const result = await triggerOnboarding(householdId, type);
    const state = await getOnboardingState(householdId);

    return res.json({ ok: true, event: result, onboarding: state });
  } catch (err) {
    return res.status(500).json({ ok: false, error: err.message });
  }
});

// ─── Admin: list challenges ───────────────────────────────────────────────────

router.get("/admin/challenges", requireAuth, requireDiod, async (req, res) => {
  try {
    const challenges = await OnboardingChallenge.find().sort({ order: 1 }).lean();
    return res.json({ ok: true, challenges });
  } catch (err) {
    return res.status(500).json({ ok: false, error: err.message });
  }
});

// ─── Admin: update challenge ──────────────────────────────────────────────────

router.put("/admin/challenges/:id", requireAuth, requireDiod, async (req, res) => {
  try {
    const { title, description, howTo, rewardBites, order, phase, phaseLabel, active } = req.body;
    const challenge = await OnboardingChallenge.findById(req.params.id);
    if (!challenge) return res.status(404).json({ ok: false, error: "Challenge no encontrado." });

    if (title !== undefined) challenge.title = String(title).trim();
    if (description !== undefined) challenge.description = String(description).trim();
    if (howTo !== undefined) challenge.howTo = String(howTo).trim();
    if (rewardBites !== undefined) {
      const v = Number(rewardBites);
      if (!Number.isFinite(v) || v < 0) return res.status(400).json({ ok: false, error: "rewardBites inválido." });
      challenge.rewardBites = v;
    }
    if (order !== undefined) challenge.order = Number(order);
    if (phase !== undefined) challenge.phase = Number(phase);
    if (phaseLabel !== undefined) challenge.phaseLabel = String(phaseLabel).trim();
    if (active !== undefined) challenge.active = Boolean(active);

    await challenge.save();
    return res.json({ ok: true, challenge: challenge.toObject() });
  } catch (err) {
    return res.status(500).json({ ok: false, error: err.message });
  }
});

// ─── Admin: list household states ────────────────────────────────────────────

router.get("/admin/households", requireAuth, requireDiod, async (req, res) => {
  try {
    const limit = Math.min(parseInt(req.query.limit || "50", 10), 200);
    const records = await HouseholdOnboarding.find()
      .sort({ updatedAt: -1 })
      .limit(limit)
      .lean();

    return res.json({ ok: true, records });
  } catch (err) {
    return res.status(500).json({ ok: false, error: err.message });
  }
});

// ─── Admin: get household onboarding state ────────────────────────────────────

router.get("/admin/households/:householdId", requireAuth, requireDiod, async (req, res) => {
  try {
    if (!mongoose.isValidObjectId(req.params.householdId)) {
      return res.status(400).json({ ok: false, error: "householdId inválido." });
    }
    const state = await getOnboardingState(req.params.householdId);
    return res.json({ ok: true, onboarding: state });
  } catch (err) {
    return res.status(500).json({ ok: false, error: err.message });
  }
});

// ─── Admin: reset household onboarding ───────────────────────────────────────

router.post("/admin/households/:householdId/reset", requireAuth, requireDiod, async (req, res) => {
  try {
    if (!mongoose.isValidObjectId(req.params.householdId)) {
      return res.status(400).json({ ok: false, error: "householdId inválido." });
    }
    const { reason } = req.body || {};
    await resetOnboarding(req.params.householdId, req.kitchenUser._id, reason || "");
    const state = await getOnboardingState(req.params.householdId);
    return res.json({ ok: true, onboarding: state });
  } catch (err) {
    return res.status(500).json({ ok: false, error: err.message });
  }
});

// ─── Admin: set household onboarding status ───────────────────────────────────

router.post("/admin/households/:householdId/status", requireAuth, requireDiod, async (req, res) => {
  try {
    if (!mongoose.isValidObjectId(req.params.householdId)) {
      return res.status(400).json({ ok: false, error: "householdId inválido." });
    }
    const { status } = req.body || {};
    if (!status) return res.status(400).json({ ok: false, error: "status requerido." });
    await setOnboardingStatus(req.params.householdId, status);
    const state = await getOnboardingState(req.params.householdId);
    return res.json({ ok: true, onboarding: state });
  } catch (err) {
    return res.status(500).json({ ok: false, error: err.message });
  }
});

// ─── Admin: init onboarding for household ────────────────────────────────────

router.post("/admin/households/:householdId/init", requireAuth, requireDiod, async (req, res) => {
  try {
    if (!mongoose.isValidObjectId(req.params.householdId)) {
      return res.status(400).json({ ok: false, error: "householdId inválido." });
    }
    await initOnboarding(req.params.householdId);
    const state = await getOnboardingState(req.params.householdId);
    return res.json({ ok: true, onboarding: state });
  } catch (err) {
    return res.status(500).json({ ok: false, error: err.message });
  }
});

// ─── Admin: analytics ────────────────────────────────────────────────────────

router.get("/admin/analytics", requireAuth, requireDiod, async (req, res) => {
  try {
    const [total, byStatus, avgBites] = await Promise.all([
      HouseholdOnboarding.countDocuments(),
      HouseholdOnboarding.aggregate([
        { $group: { _id: "$status", count: { $sum: 1 } } }
      ]),
      HouseholdOnboarding.aggregate([
        { $group: { _id: null, avg: { $avg: "$totalBitesEarned" }, max: { $max: "$totalBitesEarned" } } }
      ])
    ]);

    const challengeCounts = await HouseholdOnboarding.aggregate([
      { $unwind: "$completedChallenges" },
      { $group: { _id: "$completedChallenges.challengeKey", count: { $sum: 1 } } },
      { $sort: { count: -1 } }
    ]);

    return res.json({
      ok: true,
      analytics: {
        total,
        byStatus: Object.fromEntries(byStatus.map((x) => [x._id, x.count])),
        avgBitesEarned: avgBites[0]?.avg ?? 0,
        maxBitesEarned: avgBites[0]?.max ?? 0,
        challengeCompletions: challengeCounts
      }
    });
  } catch (err) {
    return res.status(500).json({ ok: false, error: err.message });
  }
});

export default router;
