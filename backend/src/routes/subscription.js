import express from "express";
import { requireAuth } from "../kitchen/middleware.js";
import { Household } from "../kitchen/models/Household.js";
import { getEffectiveHouseholdId, handleHouseholdError } from "../kitchen/householdScope.js";
import {
  applySubscriptionRequest,
  buildHouseholdSubscriptionResponse
} from "../kitchen/subscriptionService.js";

const router = express.Router();

router.post("/request", requireAuth, async (req, res) => {
  try {
    const effectiveHouseholdId = getEffectiveHouseholdId(req.user);
    const household = await Household.findById(effectiveHouseholdId);
    if (!household) {
      return res.status(404).json({ ok: false, error: "No encontramos el hogar." });
    }

    applySubscriptionRequest(household, req.body?.plan);
    await household.save();

    return res.status(201).json({
      ok: true,
      message: "Solicitud de suscripción registrada.",
      subscription: buildHouseholdSubscriptionResponse(household)
    });
  } catch (error) {
    const handled = handleHouseholdError(res, error);
    if (handled) return handled;
    if (error?.code === "SUBSCRIPTION_PLAN_INVALID") {
      return res.status(400).json({ ok: false, error: error.message });
    }
    console.error("[subscription] request failed", {
      userId: req.user?.id || null,
      householdId: req.user?.activeHouseholdId || req.user?.householdId || null,
      body: req.body,
      error: error?.message,
      stack: error?.stack
    });
    return res.status(500).json({ ok: false, error: "No se pudo registrar la solicitud de suscripción." });
  }
});

export default router;
