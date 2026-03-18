import express from "express";
import { requireAuth } from "../middleware.js";
import { KitchenPushSubscription } from "../models/PushSubscription.js";
import { sendPushNotification, isWebPushConfigured } from "../../services/pushService.js";

const router = express.Router();

function getEffectiveHouseholdId(user) {
  return user?.activeHouseholdId || user?.householdId || null;
}

function sanitizeSubscription(input) {
  const endpoint = String(input?.endpoint || "").trim();
  const p256dh = String(input?.keys?.p256dh || "").trim();
  const auth = String(input?.keys?.auth || "").trim();

  if (!endpoint || !p256dh || !auth) {
    return null;
  }

  return {
    endpoint,
    expirationTime: input?.expirationTime ?? null,
    keys: {
      p256dh,
      auth
    }
  };
}

function buildTestPayload(targetDate) {
  const url = new URL("/kitchen/semana", "http://localhost");
  url.searchParams.set("date", targetDate);
  url.searchParams.set("mealType", "lunch");

  return {
    title: "Lunchfy",
    body: "Se te ha asignado cocinar Tortilla de patatas el 14/03/2026 para 4 personas",
    data: {
      targetDate,
      mealType: "lunch",
      url: `${url.pathname}${url.search}`
    }
  };
}

router.get("/status", requireAuth, async (req, res) => {
  try {
    const userId = req.kitchenUser?._id;
    if (!userId) {
      return res.status(401).json({ ok: false, error: "No hay sesion activa." });
    }

    const subscriptionCount = await KitchenPushSubscription.countDocuments({ userId });
    return res.json({
      ok: true,
      configured: isWebPushConfigured(),
      subscriptionCount,
      hasSubscriptions: subscriptionCount > 0
    });
  } catch (error) {
    return res.status(500).json({ ok: false, error: "No se pudo consultar el estado de notificaciones." });
  }
});

router.post("/subscription", requireAuth, async (req, res) => {
  try {
    const subscription = sanitizeSubscription(req.body?.subscription);
    if (!subscription) {
      return res.status(400).json({ ok: false, error: "La suscripcion push no es valida." });
    }

    const userId = req.kitchenUser?._id;
    if (!userId) {
      return res.status(401).json({ ok: false, error: "No hay sesion activa." });
    }

    const effectiveHouseholdId = getEffectiveHouseholdId(req.user);
    const userAgent = String(req.headers["user-agent"] || "").slice(0, 500);
    const existing = await KitchenPushSubscription.findOne({ endpoint: subscription.endpoint }).lean();

    const saved = await KitchenPushSubscription.findOneAndUpdate(
      { endpoint: subscription.endpoint },
      {
        $set: {
          userId,
          householdId: effectiveHouseholdId || null,
          endpoint: subscription.endpoint,
          keys: subscription.keys,
          subscription,
          userAgent
        }
      },
      {
        new: true,
        upsert: true,
        setDefaultsOnInsert: true
      }
    );

    console.info("[push] Subscription saved", {
      action: existing ? "updated" : "created",
      userId: String(userId),
      householdId: effectiveHouseholdId ? String(effectiveHouseholdId) : null
    });

    return res.status(existing ? 200 : 201).json({
      ok: true,
      subscription: {
        id: saved?._id || null,
        endpoint: saved?.endpoint || subscription.endpoint
      }
    });
  } catch (error) {
    if (error?.code === 11000) {
      return res.status(409).json({ ok: false, error: "La suscripcion ya existe." });
    }
    return res.status(500).json({ ok: false, error: "No se pudo guardar la suscripcion push." });
  }
});

router.delete("/subscription", requireAuth, async (req, res) => {
  try {
    const userId = req.kitchenUser?._id;
    if (!userId) {
      return res.status(401).json({ ok: false, error: "No hay sesion activa." });
    }

    const endpoint = String(req.body?.endpoint || "").trim();
    const filter = endpoint ? { userId, endpoint } : { userId };
    const result = await KitchenPushSubscription.deleteMany(filter);

    return res.json({
      ok: true,
      removedCount: Number(result.deletedCount || 0)
    });
  } catch (error) {
    return res.status(500).json({ ok: false, error: "No se pudo eliminar la suscripcion push." });
  }
});

router.post("/test", requireAuth, async (req, res) => {
  try {
    const userId = req.kitchenUser?._id;
    if (!userId) {
      return res.status(401).json({ ok: false, error: "No hay sesion activa." });
    }

    if (!isWebPushConfigured()) {
      return res.status(503).json({ ok: false, error: "Web Push no esta configurado en el backend." });
    }

    const subscriptions = await KitchenPushSubscription.find({ userId }).lean();
    if (!subscriptions.length) {
      return res.status(404).json({ ok: false, error: "No hay suscripciones push activas para este usuario." });
    }

    const targetDate = "2026-03-14";
    const payload = buildTestPayload(targetDate);
    const results = await Promise.all(
      subscriptions.map(async (item) => {
        const result = await sendPushNotification(item.subscription, payload);
        if (result.expired) {
          await KitchenPushSubscription.deleteOne({ _id: item._id });
          console.info("[push] Invalid subscription removed", {
            userId: String(userId),
            endpoint: item.endpoint
          });
        }
        return result;
      })
    );

    const sentCount = results.filter((item) => item.ok).length;
    const failedCount = results.length - sentCount;

    console.info("[push] Test notification sent", {
      userId: String(userId),
      sentCount,
      failedCount
    });

    return res.json({
      ok: true,
      sentCount,
      failedCount,
      results
    });
  } catch (error) {
    return res.status(500).json({ ok: false, error: "No se pudo enviar la notificacion de prueba." });
  }
});

export default router;
