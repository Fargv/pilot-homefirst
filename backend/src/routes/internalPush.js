import express from "express";
import mongoose from "mongoose";
import { config } from "../config.js";
import { KitchenPushReminderDelivery } from "../kitchen/models/PushReminderDelivery.js";
import { getReminderExecutionOptions, runDailyReminders, runWeeklyReminders } from "../services/internalPushReminderService.js";

const router = express.Router();

function isDevOnlyAllowed() {
  return process.env.NODE_ENV !== "production";
}

function requireCronSecret(req, res, next) {
  const receivedSecret = String(req.headers["x-cron-secret"] || "");
  const expectedSecret = String(config.cronSecret || "");
  const authorized = Boolean(expectedSecret) && receivedSecret === expectedSecret;

  console.info("[push][reminders] endpoint called", {
    path: req.path,
    authorized
  });

  if (!authorized) {
    console.warn("[push][reminders] authorization failed", {
      path: req.path
    });
    return res.status(401).json({ ok: false, error: "Unauthorized" });
  }

  return next();
}

function requireDevOnly(req, res, next) {
  if (!isDevOnlyAllowed()) {
    return res.status(404).json({ ok: false, error: "Not found" });
  }
  return next();
}

router.post("/run-daily-reminders", requireCronSecret, async (req, res) => {
  try {
    const options = getReminderExecutionOptions(req);
    const result = await runDailyReminders(options);
    return res.json(result);
  } catch (error) {
    return res.status(500).json({ ok: false, error: "No se pudieron ejecutar los recordatorios diarios." });
  }
});

router.post("/run-weekly-reminders", requireCronSecret, async (req, res) => {
  try {
    const options = getReminderExecutionOptions(req);
    const result = await runWeeklyReminders(options);
    return res.json(result);
  } catch (error) {
    return res.status(500).json({ ok: false, error: "No se pudieron ejecutar los recordatorios semanales." });
  }
});

router.post("/dev/clear-reminder-deduplication", requireCronSecret, requireDevOnly, async (req, res) => {
  try {
    const reminderType = String(req.body?.reminderType || "").trim();
    const targetKey = String(req.body?.targetKey || "").trim();
    const userId = String(req.body?.userId || "").trim();
    const householdId = String(req.body?.householdId || "").trim();
    const clearAll = req.body?.clearAll === true;

    if (userId && !mongoose.isValidObjectId(userId)) {
      return res.status(400).json({ ok: false, error: "userId no es un ObjectId valido." });
    }
    if (householdId && !mongoose.isValidObjectId(householdId)) {
      return res.status(400).json({ ok: false, error: "householdId no es un ObjectId valido." });
    }
    if (!clearAll && !reminderType && !targetKey && !userId && !householdId) {
      return res.status(400).json({
        ok: false,
        error: "Debes indicar al menos un filtro o usar clearAll=true en DEV."
      });
    }

    const filter = clearAll
      ? {}
      : {
          ...(reminderType ? { reminderType } : {}),
          ...(targetKey ? { targetKey } : {}),
          ...(userId ? { userId } : {}),
          ...(householdId ? { householdId } : {})
        };

    console.info("[push][reminders] dev clear deduplication requested", {
      clearAll,
      filter
    });

    const result = await KitchenPushReminderDelivery.deleteMany(filter);

    return res.json({
      ok: true,
      deletedCount: Number(result.deletedCount || 0),
      clearAll,
      filter
    });
  } catch (error) {
    return res.status(500).json({ ok: false, error: "No se pudieron limpiar los registros de deduplicacion." });
  }
});

export default router;
