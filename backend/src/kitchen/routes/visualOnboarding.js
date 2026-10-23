import express from "express";
import { requireAuth } from "../middleware.js";
import { getEffectiveHouseholdId } from "../householdScope.js";
import { Household } from "../models/Household.js";
import { VisualOnboardingProgress } from "../models/VisualOnboardingProgress.js";
import {
  isVisualOnboardingOwner,
  projectVisualOnboardingProgress,
  validateDraftPatch,
  validateSkipRequest,
  VisualOnboardingInputError,
  VISUAL_ONBOARDING_FLOW_VERSION
} from "../visualOnboardingCore.js";

async function resolveOwnerHousehold(req, res, householdModel) {
  let householdId;
  try {
    householdId = getEffectiveHouseholdId(req.user);
  } catch (error) {
    return { error: res.status(400).json({ ok: false, error: error.message }) };
  }
  const household = await householdModel.findById(householdId).select("_id ownerUserId").lean();
  if (!household || !isVisualOnboardingOwner(req.kitchenUser, household)) {
    return { error: res.status(403).json({ ok: false, error: "Solo el propietario puede gestionar este onboarding." }) };
  }
  return { householdId: household._id };
}

function sendError(res, error) {
  if (error instanceof VisualOnboardingInputError) {
    return res.status(400).json({ ok: false, error: error.message });
  }
  console.error("[visual-onboarding] request failed:", error?.message || error);
  return res.status(500).json({ ok: false, error: "No se pudo procesar el onboarding visual." });
}

function sendConflict(res) {
  return res.status(409).json({
    ok: false,
    code: "ONBOARDING_REVISION_CONFLICT",
    error: "El borrador cambió en otra sesión. Recarga el estado antes de guardar."
  });
}

export function createVisualOnboardingRouter({
  authMiddleware = requireAuth,
  householdModel = Household,
  progressModel = VisualOnboardingProgress
} = {}) {
  const router = express.Router();

  router.get("/state", authMiddleware, async (req, res) => {
    try {
      const access = await resolveOwnerHousehold(req, res, householdModel);
      if (access.error) return access.error;
      const record = await progressModel.findOne({
        householdId: access.householdId,
        flowVersion: VISUAL_ONBOARDING_FLOW_VERSION
      }).lean();
      return res.json({ ok: true, onboarding: projectVisualOnboardingProgress(record, access.householdId) });
    } catch (error) {
      return sendError(res, error);
    }
  });

  router.put("/draft", authMiddleware, async (req, res) => {
    try {
      const patch = validateDraftPatch(req.body);
      const access = await resolveOwnerHousehold(req, res, householdModel);
      if (access.error) return access.error;

      const update = {
        $set: { status: "in_progress" },
        $inc: { revision: 1 }
      };
      if (patch.currentStep !== undefined) update.$set.currentStep = patch.currentStep;
      else if (patch.expectedRevision === 0) update.$setOnInsert = { currentStep: 0 };
      if (patch.responses) {
        for (const [key, value] of Object.entries(patch.responses)) {
          update.$set[`responses.${key}`] = value;
        }
      }

      let record;
      try {
        record = await progressModel.findOneAndUpdate(
          {
            householdId: access.householdId,
            flowVersion: VISUAL_ONBOARDING_FLOW_VERSION,
            revision: patch.expectedRevision,
            status: { $in: ["not_started", "in_progress"] }
          },
          {
            ...update,
            $setOnInsert: {
              ...update.$setOnInsert,
              householdId: access.householdId,
              flowVersion: VISUAL_ONBOARDING_FLOW_VERSION
            }
          },
          { new: true, upsert: patch.expectedRevision === 0, runValidators: true, setDefaultsOnInsert: false }
        ).lean();
      } catch (error) {
        if (error?.code === 11000) return sendConflict(res);
        throw error;
      }
      if (!record) return sendConflict(res);
      return res.json({ ok: true, onboarding: projectVisualOnboardingProgress(record, access.householdId) });
    } catch (error) {
      return sendError(res, error);
    }
  });

  router.post("/skip", authMiddleware, async (req, res) => {
    try {
      const { expectedRevision } = validateSkipRequest(req.body);
      const access = await resolveOwnerHousehold(req, res, householdModel);
      if (access.error) return access.error;

      let record;
      try {
        record = await progressModel.findOneAndUpdate(
          {
            householdId: access.householdId,
            flowVersion: VISUAL_ONBOARDING_FLOW_VERSION,
            revision: expectedRevision,
            status: { $in: ["not_started", "in_progress", "skipped"] }
          },
          {
            $set: { status: "skipped" },
            $inc: { revision: 1 },
            $setOnInsert: {
              householdId: access.householdId,
              flowVersion: VISUAL_ONBOARDING_FLOW_VERSION,
              currentStep: 0
            }
          },
          { new: true, upsert: expectedRevision === 0, runValidators: true, setDefaultsOnInsert: false }
        ).lean();
      } catch (error) {
        if (error?.code === 11000) return sendConflict(res);
        throw error;
      }
      if (!record) return sendConflict(res);
      return res.json({ ok: true, onboarding: projectVisualOnboardingProgress(record, access.householdId) });
    } catch (error) {
      return sendError(res, error);
    }
  });

  return router;
}

export default createVisualOnboardingRouter();
