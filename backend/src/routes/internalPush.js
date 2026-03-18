import express from "express";
import { config } from "../config.js";
import { getReminderExecutionOptions, runDailyReminders, runWeeklyReminders } from "../services/internalPushReminderService.js";

const router = express.Router();

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

export default router;
