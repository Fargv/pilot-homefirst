import { Household } from "../kitchen/models/Household.js";
import { KitchenDish } from "../kitchen/models/KitchenDish.js";
import { KitchenPushSubscription } from "../kitchen/models/PushSubscription.js";
import { KitchenPushReminderDelivery } from "../kitchen/models/PushReminderDelivery.js";
import { KitchenUser } from "../kitchen/models/KitchenUser.js";
import { KitchenWeekPlan } from "../kitchen/models/KitchenWeekPlan.js";
import { formatDateISO, getWeekStart } from "../kitchen/utils/dates.js";
import { resolveDishCatalogForHousehold } from "../kitchen/utils/dishCatalog.js";
import { sendPushNotification, isWebPushConfigured } from "./pushService.js";

const MADRID_TIME_ZONE = "Europe/Madrid";

function toId(value) {
  return value ? String(value) : "";
}

function parseBoolean(value) {
  return String(value || "").trim().toLowerCase() === "true";
}

function getDatePartsInTimeZone(date, timeZone = MADRID_TIME_ZONE) {
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  });
  const parts = formatter.formatToParts(date);
  const byType = Object.fromEntries(parts.map((part) => [part.type, part.value]));

  return {
    year: Number(byType.year),
    month: Number(byType.month),
    day: Number(byType.day)
  };
}

function getLocalMidnightUtcDate(date, timeZone = MADRID_TIME_ZONE) {
  const { year, month, day } = getDatePartsInTimeZone(date, timeZone);
  return new Date(Date.UTC(year, month - 1, day));
}

function addDays(date, days) {
  const next = new Date(date);
  next.setUTCDate(next.getUTCDate() + days);
  return next;
}

function buildMadridExecutionContext({ overrideDate, force = false } = {}) {
  const now = overrideDate instanceof Date ? overrideDate : new Date();
  const madridToday = getLocalMidnightUtcDate(now);
  const tomorrow = addDays(madridToday, 1);
  const dayOfWeek = madridToday.getUTCDay();
  const daysUntilNextMonday = dayOfWeek === 0 ? 1 : ((8 - dayOfWeek) % 7 || 7);
  const nextMonday = addDays(madridToday, daysUntilNextMonday);

  return {
    now,
    force,
    madridToday,
    madridTomorrow: tomorrow,
    madridDayOfWeek: dayOfWeek,
    madridTodayIso: formatDateISO(madridToday),
    madridTomorrowIso: formatDateISO(tomorrow),
    nextWeekStart: getWeekStart(nextMonday),
    nextWeekStartIso: formatDateISO(getWeekStart(nextMonday))
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

function isActiveCookingMember(user) {
  if (!user || user.active === false) return false;
  const isPlaceholder = user.isPlaceholder || user.type === "placeholder";
  return Boolean(typeof user.canCook === "boolean" ? user.canCook : !isPlaceholder);
}

async function reserveReminderDelivery({ reminderType, targetKey, userId, householdId, metadata = {} }) {
  try {
    await KitchenPushReminderDelivery.create({
      reminderType,
      targetKey,
      userId,
      householdId: householdId || null,
      status: "sent",
      metadata
    });
    return true;
  } catch (error) {
    if (error?.code === 11000) {
      return false;
    }
    throw error;
  }
}

async function sendPayloadToUser({ userId, householdId, payload }) {
  const filter = householdId
    ? { userId, $or: [{ householdId }, { householdId: null }] }
    : { userId };
  const subscriptions = await KitchenPushSubscription.find(filter).lean();

  if (!subscriptions.length) {
    return { subscriptionsFound: 0, sentCount: 0, failedCount: 0 };
  }

  const results = await Promise.all(
    subscriptions.map(async (subscriptionDoc) => {
      const result = await sendPushNotification(subscriptionDoc.subscription, payload);
      if (result.expired) {
        await KitchenPushSubscription.deleteOne({ _id: subscriptionDoc._id });
        console.info("[push][reminders] invalid subscription removed", {
          userId: toId(userId),
          endpoint: subscriptionDoc.endpoint
        });
      }
      return result;
    })
  );

  return {
    subscriptionsFound: subscriptions.length,
    sentCount: results.filter((result) => result.ok).length,
    failedCount: results.filter((result) => !result.ok).length
  };
}

function buildDailyReminderPayload({ isoDate, mealType, dishName, peopleCount }) {
  const url = new URL("/kitchen/semana", "http://localhost");
  url.searchParams.set("date", isoDate);
  url.searchParams.set("mealType", mealType);

  return {
    title: "Lunchfy",
    body: `Mañana cocinas ${dishName} para ${peopleCount} personas`,
    data: {
      type: "DAILY_COOK_REMINDER",
      targetDate: isoDate,
      mealType,
      peopleCount,
      url: `${url.pathname}${url.search}`
    }
  };
}

function buildWeeklyReminderPayload({ nextWeekStartIso }) {
  const url = new URL("/kitchen/semana", "http://localhost");
  url.searchParams.set("date", nextWeekStartIso);

  return {
    title: "Lunchfy",
    body: "Piensa y asígnate el plato de la semana que viene",
    data: {
      type: "WEEKLY_PLANNING_REMINDER",
      targetDate: nextWeekStartIso,
      url: `${url.pathname}${url.search}`
    }
  };
}

async function resolveDishNamesByHousehold(assignments) {
  const assignmentsByHousehold = new Map();
  for (const assignment of assignments) {
    const householdId = toId(assignment.householdId);
    const dishId = toId(assignment.day?.mainDishId);
    if (!householdId || !dishId) continue;
    const current = assignmentsByHousehold.get(householdId) || new Set();
    current.add(dishId);
    assignmentsByHousehold.set(householdId, current);
  }

  const dishNameByHousehold = new Map();
  for (const [householdId, dishIdsSet] of assignmentsByHousehold.entries()) {
    const dishes = await resolveDishCatalogForHousehold({
      Model: KitchenDish,
      householdId,
      ids: Array.from(dishIdsSet)
    });
    dishNameByHousehold.set(
      householdId,
      new Map(dishes.map((dish) => [toId(dish?._id), String(dish?.name || "").trim()]))
    );
  }

  return dishNameByHousehold;
}

export function getReminderExecutionOptions(req) {
  const isDevSafe = process.env.NODE_ENV !== "production";
  const force = isDevSafe && parseBoolean(req.query?.force);
  const overrideDateValue = isDevSafe ? String(req.query?.date || "").trim() : "";
  const overrideDate = overrideDateValue ? new Date(overrideDateValue) : null;

  return {
    force,
    overrideDate: overrideDate && !Number.isNaN(overrideDate.getTime()) ? overrideDate : null
  };
}

export async function runDailyReminders({ overrideDate = null, force = false } = {}) {
  const execution = buildMadridExecutionContext({ overrideDate, force });
  console.info("[push][reminders] daily evaluation", {
    madridToday: execution.madridTodayIso,
    madridTomorrow: execution.madridTomorrowIso,
    force
  });

  if (!isWebPushConfigured()) {
    return {
      ok: true,
      skipped: true,
      reason: "web_push_not_configured",
      execution
    };
  }

  const tomorrowWeekStart = getWeekStart(execution.madridTomorrow);
  const plans = await KitchenWeekPlan.find({ weekStart: tomorrowWeekStart }).lean();
  const assignments = [];

  for (const plan of plans) {
    const matchingDays = (plan?.days || []).filter((day) => {
      const dayDate = day?.date ? new Date(day.date) : null;
      return Boolean(
        dayDate
        && formatDateISO(dayDate) === execution.madridTomorrowIso
        && day?.cookUserId
        && day?.mainDishId
      );
    });

    for (const day of matchingDays) {
      assignments.push({
        householdId: plan.householdId || null,
        userId: day.cookUserId,
        day: {
          ...day,
          date: day.date ? new Date(day.date) : null,
          mealType: String(day?.mealType || "").toLowerCase() === "dinner" ? "dinner" : "lunch"
        }
      });
    }
  }

  console.info("[push][reminders] daily reminders found", {
    assignments: assignments.length
  });

  const dishNamesByHousehold = await resolveDishNamesByHousehold(assignments);
  let sentCount = 0;
  let duplicateCount = 0;
  let skippedCount = 0;

  for (const assignment of assignments) {
    const userId = assignment.userId;
    const householdId = assignment.householdId || null;
    const mealType = assignment.day.mealType || "lunch";
    const targetKey = `${execution.madridTomorrowIso}:${mealType}`;
    const reserved = await reserveReminderDelivery({
      reminderType: "daily_cook_tomorrow",
      targetKey,
      userId,
      householdId,
      metadata: {
        targetDate: execution.madridTomorrowIso,
        mealType
      }
    });

    if (!reserved) {
      duplicateCount += 1;
      console.info("[push][reminders] duplicate skipped", {
        reminderType: "daily_cook_tomorrow",
        userId: toId(userId),
        targetKey
      });
      continue;
    }

    const dishName = dishNamesByHousehold.get(toId(householdId))?.get(toId(assignment.day.mainDishId))
      || String(assignment.day?.leftoversSourceDishName || "").trim()
      || "Plato";
    const payload = buildDailyReminderPayload({
      isoDate: execution.madridTomorrowIso,
      mealType,
      dishName,
      peopleCount: resolvePeopleCount(assignment.day)
    });

    const delivery = await sendPayloadToUser({
      userId,
      householdId,
      payload
    });

    console.info("[push][reminders] daily delivery", {
      userId: toId(userId),
      householdId: toId(householdId) || null,
      subscriptionsFound: delivery.subscriptionsFound,
      sentCount: delivery.sentCount,
      failedCount: delivery.failedCount
    });

    if (delivery.sentCount > 0) {
      sentCount += delivery.sentCount;
    } else {
      skippedCount += 1;
    }
  }

  return {
    ok: true,
    execution,
    assignmentsFound: assignments.length,
    sentCount,
    duplicateCount,
    skippedCount
  };
}

function isWeekPlanIncomplete(plan) {
  if (!plan) return true;
  return (plan.days || []).some((day) => !day?.mainDishId || !day?.cookUserId);
}

export async function runWeeklyReminders({ overrideDate = null, force = false } = {}) {
  const execution = buildMadridExecutionContext({ overrideDate, force });
  console.info("[push][reminders] weekly evaluation", {
    madridToday: execution.madridTodayIso,
    nextWeekStart: execution.nextWeekStartIso,
    madridDayOfWeek: execution.madridDayOfWeek,
    force
  });

  if (!isWebPushConfigured()) {
    return {
      ok: true,
      skipped: true,
      reason: "web_push_not_configured",
      execution
    };
  }

  const isSaturdayInMadrid = execution.madridDayOfWeek === 6;
  if (!isSaturdayInMadrid && !force) {
    return {
      ok: true,
      skipped: true,
      reason: "not_saturday_in_madrid",
      execution
    };
  }

  const households = await Household.find({}).select("_id").lean();
  const householdIds = households.map((household) => household._id).filter(Boolean);
  const plans = householdIds.length
    ? await KitchenWeekPlan.find({
        householdId: { $in: householdIds },
        weekStart: execution.nextWeekStart
      }).lean()
    : [];
  const planByHouseholdId = new Map(plans.map((plan) => [toId(plan.householdId), plan]));

  const candidateHouseholds = householdIds.filter((householdId) => isWeekPlanIncomplete(planByHouseholdId.get(toId(householdId))));
  const users = candidateHouseholds.length
    ? await KitchenUser.find({
        householdId: { $in: candidateHouseholds },
        active: { $ne: false }
      })
        .select("_id householdId active canCook isPlaceholder type")
        .lean()
    : [];

  const recipients = users.filter(isActiveCookingMember);

  console.info("[push][reminders] weekly reminders found", {
    candidateHouseholds: candidateHouseholds.length,
    recipients: recipients.length
  });

  const payload = buildWeeklyReminderPayload({
    nextWeekStartIso: execution.nextWeekStartIso
  });
  let sentCount = 0;
  let duplicateCount = 0;
  let skippedCount = 0;

  for (const recipient of recipients) {
    const userId = recipient._id;
    const householdId = recipient.householdId || null;
    const targetKey = execution.nextWeekStartIso;
    const reserved = await reserveReminderDelivery({
      reminderType: "weekly_next_week_planning",
      targetKey,
      userId,
      householdId,
      metadata: {
        nextWeekStart: execution.nextWeekStartIso
      }
    });

    if (!reserved) {
      duplicateCount += 1;
      console.info("[push][reminders] duplicate skipped", {
        reminderType: "weekly_next_week_planning",
        userId: toId(userId),
        targetKey
      });
      continue;
    }

    const delivery = await sendPayloadToUser({
      userId,
      householdId,
      payload
    });

    console.info("[push][reminders] weekly delivery", {
      userId: toId(userId),
      householdId: toId(householdId) || null,
      subscriptionsFound: delivery.subscriptionsFound,
      sentCount: delivery.sentCount,
      failedCount: delivery.failedCount
    });

    if (delivery.sentCount > 0) {
      sentCount += delivery.sentCount;
    } else {
      skippedCount += 1;
    }
  }

  return {
    ok: true,
    execution,
    candidateHouseholds: candidateHouseholds.length,
    recipientsFound: recipients.length,
    sentCount,
    duplicateCount,
    skippedCount,
    completenessRule: "household_next_week_missing_main_dish_or_cook"
  };
}
