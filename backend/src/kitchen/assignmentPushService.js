import { KitchenDish } from "./models/KitchenDish.js";
import { KitchenPushSubscription } from "./models/PushSubscription.js";
import { sendPushNotification, isWebPushConfigured } from "../services/pushService.js";
import { resolveDishCatalogForHousehold } from "./utils/dishCatalog.js";

function toId(value) {
  return value ? String(value) : "";
}

function normalizeMealType(value) {
  return String(value || "").toLowerCase() === "dinner" ? "dinner" : "lunch";
}

function formatTargetDate(dateValue) {
  const date = dateValue instanceof Date ? dateValue : new Date(dateValue);
  if (Number.isNaN(date.getTime())) {
    return {
      isoDate: "",
      formattedDate: ""
    };
  }

  return {
    isoDate: date.toISOString().slice(0, 10),
    formattedDate: new Intl.DateTimeFormat("es-ES", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      timeZone: "UTC"
    }).format(date)
  };
}

function resolvePeopleCount(day) {
  if (Number.isFinite(day?.attendeeCount) && day.attendeeCount > 0) {
    return Number(day.attendeeCount);
  }
  if (Array.isArray(day?.attendeeIds) && day.attendeeIds.length > 0) {
    return day.attendeeIds.length;
  }
  if (Number.isFinite(day?.servings) && day.servings > 0) {
    return Number(day.servings);
  }
  return 0;
}

function buildPayload({ day, dishName }) {
  const { isoDate, formattedDate } = formatTargetDate(day?.date);
  const peopleCount = resolvePeopleCount(day);
  const mealType = normalizeMealType(day?.mealType || "lunch");
  const body = `Se te ha asignado cocinar ${dishName} el ${formattedDate} para ${peopleCount} personas`;
  const url = new URL("/kitchen/semana", "http://localhost");
  url.searchParams.set("date", isoDate);
  url.searchParams.set("mealType", mealType);

  return {
    title: "HOMEFIRST",
    body,
    data: {
      type: "COOK_ASSIGNMENT",
      targetDate: isoDate,
      formattedDate,
      peopleCount,
      mealType,
      url: `${url.pathname}${url.search}`
    }
  };
}

async function resolveDishNames(effectiveHouseholdId, assignments) {
  const dishIds = Array.from(
    new Set(
      assignments
        .map((item) => toId(item?.day?.mainDishId))
        .filter(Boolean)
    )
  );

  if (!dishIds.length) {
    return new Map();
  }

  const dishes = await resolveDishCatalogForHousehold({
    Model: KitchenDish,
    householdId: effectiveHouseholdId,
    ids: dishIds
  });

  return new Map(dishes.map((dish) => [toId(dish?._id), String(dish?.name || "").trim()]));
}

function shouldNotifyAssignment(item) {
  const previousCookUserId = toId(item?.previousCookUserId);
  const nextCookUserId = toId(item?.day?.cookUserId);
  const dishId = toId(item?.day?.mainDishId);
  const isoDate = formatTargetDate(item?.day?.date).isoDate;

  return Boolean(nextCookUserId && dishId && isoDate && previousCookUserId !== nextCookUserId);
}

async function sendAssignmentPushToUser({ effectiveHouseholdId, userId, payload }) {
  const householdId = effectiveHouseholdId || null;
  const filter = householdId
    ? {
        userId,
        $or: [{ householdId }, { householdId: null }]
      }
    : { userId };

  const subscriptions = await KitchenPushSubscription.find(filter).lean();

  console.info("[push][assignment] target user resolved", {
    userId: toId(userId),
    householdId: toId(householdId) || null,
    subscriptionsFound: subscriptions.length
  });

  if (!subscriptions.length) {
    return { sentCount: 0, failedCount: 0 };
  }

  const results = await Promise.all(
    subscriptions.map(async (subscriptionDoc) => {
      const result = await sendPushNotification(subscriptionDoc.subscription, payload);
      if (result.expired) {
        await KitchenPushSubscription.deleteOne({ _id: subscriptionDoc._id });
        console.info("[push][assignment] invalid subscription removed", {
          userId: toId(userId),
          endpoint: subscriptionDoc.endpoint
        });
      }
      return result;
    })
  );

  return {
    sentCount: results.filter((result) => result.ok).length,
    failedCount: results.filter((result) => !result.ok).length
  };
}

export async function notifyCookAssignments({ effectiveHouseholdId, assignments = [], context = "unknown" }) {
  try {
    if (!isWebPushConfigured()) {
      return;
    }

    const candidates = assignments.filter(shouldNotifyAssignment);
    if (!candidates.length) {
      return;
    }

    const dishNameById = await resolveDishNames(effectiveHouseholdId, candidates);

    for (const assignment of candidates) {
      const nextCookUserId = toId(assignment?.day?.cookUserId);
      const dishId = toId(assignment?.day?.mainDishId);
      const dishName = dishNameById.get(dishId) || String(assignment?.day?.leftoversSourceDishName || "").trim() || "Plato";
      const payload = buildPayload({
        day: assignment.day,
        dishName
      });

      console.info("[push][assignment] triggered", {
        context,
        userId: nextCookUserId,
        date: payload.data.targetDate,
        mealType: payload.data.mealType,
        dishName,
        peopleCount: payload.data.peopleCount
      });

      const { sentCount, failedCount } = await sendAssignmentPushToUser({
        effectiveHouseholdId,
        userId: nextCookUserId,
        payload
      });

      console.info("[push][assignment] delivery", {
        context,
        userId: nextCookUserId,
        sentCount,
        failedCount
      });
    }
  } catch (error) {
    console.error("[push][assignment] failed", {
      context,
      householdId: toId(effectiveHouseholdId) || null,
      message: error?.message
    });
  }
}
