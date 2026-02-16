import express from "express";
import { KitchenSwap } from "../models/KitchenSwap.js";
import { KitchenWeekPlan } from "../models/KitchenWeekPlan.js";
import { KitchenAuditLog } from "../models/KitchenAuditLog.js";
import { requireAuth, requireRole } from "../middleware.js";
import { getWeekStart, isSameDay, parseISODate } from "../utils/dates.js";
import {
  buildScopedFilter,
  getEffectiveHouseholdId,
  handleHouseholdError
} from "../householdScope.js";

const router = express.Router();

function hasAdminAccess(user) {
  return user.globalRole === "diod" || user.role === "admin" || user.role === "owner";
}

router.post("/", requireAuth, async (req, res) => {
  try {
    const { weekStart, toUserId, fromDate, toDate } = req.body;
    if (!weekStart || !toUserId || !fromDate || !toDate) {
      return res.status(400).json({ ok: false, error: "Faltan datos para el cambio." });
    }

    const effectiveHouseholdId = getEffectiveHouseholdId(req.user);
    const weekStartParsed = parseISODate(weekStart);
    const fromDateObj = parseISODate(fromDate);
    const toDateObj = parseISODate(toDate);
    if (!weekStartParsed || !fromDateObj || !toDateObj) {
      return res.status(400).json({ ok: false, error: "Fechas inválidas." });
    }
    const weekStartDate = getWeekStart(weekStartParsed);

    const swap = await KitchenSwap.create({
      weekStart: weekStartDate,
      fromUserId: req.kitchenUser._id,
      toUserId,
      fromDate: fromDateObj,
      toDate: toDateObj,
      householdId: effectiveHouseholdId
    });

    await KitchenAuditLog.create({
      action: "swap_requested",
      actorUserId: req.kitchenUser._id,
      data: { swapId: swap._id },
      householdId: effectiveHouseholdId
    });

    res.status(201).json({ ok: true, swap });
  } catch (error) {
    const handled = handleHouseholdError(res, error);
    if (handled) return handled;
    return res.status(500).json({ ok: false, error: "No se pudo crear el cambio." });
  }
});

router.get("/", requireAuth, async (req, res) => {
  try {
    const effectiveHouseholdId = getEffectiveHouseholdId(req.user);
    const accessFilter = hasAdminAccess(req.kitchenUser)
      ? {}
      : { $or: [{ fromUserId: req.kitchenUser._id }, { toUserId: req.kitchenUser._id }] };

    const swaps = await KitchenSwap.find(
      buildScopedFilter(effectiveHouseholdId, accessFilter)
    ).sort({ createdAt: -1 });
    res.json({ ok: true, swaps });
  } catch (error) {
    const handled = handleHouseholdError(res, error);
    if (handled) return handled;
    return res.status(500).json({ ok: false, error: "No se pudieron cargar los cambios." });
  }
});

async function applySwap({ swap, actor, effectiveHouseholdId }) {
  const plan = await KitchenWeekPlan.findOne(
    buildScopedFilter(effectiveHouseholdId, { weekStart: swap.weekStart })
  );
  if (!plan) return;

  const fromDay = plan.days.find((day) => isSameDay(day.date, swap.fromDate));
  const toDay = plan.days.find((day) => isSameDay(day.date, swap.toDate));
  if (!fromDay || !toDay) return;

  const tempCook = fromDay.cookUserId;
  fromDay.cookUserId = toDay.cookUserId;
  toDay.cookUserId = tempCook;

  await plan.save();
  await KitchenAuditLog.create({
    action: "swap_applied",
    actorUserId: actor,
    data: { swapId: swap._id },
    householdId: effectiveHouseholdId
  });
}

router.post("/:id/accept", requireAuth, async (req, res) => {
  try {
    const effectiveHouseholdId = getEffectiveHouseholdId(req.user);
    const swap = await KitchenSwap.findOne(
      buildScopedFilter(effectiveHouseholdId, { _id: req.params.id })
    );
    if (!swap) return res.status(404).json({ ok: false, error: "Cambio no encontrado." });
    if (swap.status !== "pending") return res.status(400).json({ ok: false, error: "El cambio ya fue resuelto." });

    if (!hasAdminAccess(req.kitchenUser) && swap.toUserId.toString() !== req.kitchenUser._id.toString()) {
      return res.status(403).json({ ok: false, error: "No puedes aceptar este cambio." });
    }

    swap.status = "accepted";
    swap.resolvedAt = new Date();
    await swap.save();
    await applySwap({ swap, actor: req.kitchenUser._id, effectiveHouseholdId });

    res.json({ ok: true, swap });
  } catch (error) {
    const handled = handleHouseholdError(res, error);
    if (handled) return handled;
    return res.status(500).json({ ok: false, error: "No se pudo aceptar el cambio." });
  }
});

router.post("/:id/reject", requireAuth, async (req, res) => {
  try {
    const effectiveHouseholdId = getEffectiveHouseholdId(req.user);
    const swap = await KitchenSwap.findOne(
      buildScopedFilter(effectiveHouseholdId, { _id: req.params.id })
    );
    if (!swap) return res.status(404).json({ ok: false, error: "Cambio no encontrado." });
    if (swap.status !== "pending") return res.status(400).json({ ok: false, error: "El cambio ya fue resuelto." });

    if (!hasAdminAccess(req.kitchenUser) && swap.toUserId.toString() !== req.kitchenUser._id.toString()) {
      return res.status(403).json({ ok: false, error: "No puedes rechazar este cambio." });
    }

    swap.status = "rejected";
    swap.resolvedAt = new Date();
    await swap.save();

    await KitchenAuditLog.create({
      action: "swap_rejected",
      actorUserId: req.kitchenUser._id,
      data: { swapId: swap._id },
      householdId: effectiveHouseholdId
    });

    res.json({ ok: true, swap });
  } catch (error) {
    const handled = handleHouseholdError(res, error);
    if (handled) return handled;
    return res.status(500).json({ ok: false, error: "No se pudo rechazar el cambio." });
  }
});

router.post("/:id/force", requireAuth, requireRole("admin"), async (req, res) => {
  try {
    const effectiveHouseholdId = getEffectiveHouseholdId(req.user);
    const swap = await KitchenSwap.findOne(
      buildScopedFilter(effectiveHouseholdId, { _id: req.params.id })
    );
    if (!swap) return res.status(404).json({ ok: false, error: "Cambio no encontrado." });

    swap.status = "accepted";
    swap.resolvedAt = new Date();
    await swap.save();
    await applySwap({ swap, actor: req.kitchenUser._id, effectiveHouseholdId });

    res.json({ ok: true, swap });
  } catch (error) {
    const handled = handleHouseholdError(res, error);
    if (handled) return handled;
    return res.status(500).json({ ok: false, error: "No se pudo forzar el cambio." });
  }
});

export default router;
