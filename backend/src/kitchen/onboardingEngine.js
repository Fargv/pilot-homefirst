import { HouseholdOnboarding } from "./models/HouseholdOnboarding.js";
import { OnboardingChallenge } from "./models/OnboardingChallenge.js";
import { Household } from "./models/Household.js";
import { BitesTransaction } from "./models/BitesTransaction.js";
import { normalizeSubscriptionPlan } from "./subscriptionService.js";

const WELCOME_BITES = 20;

// ─── Default challenge definitions ───────────────────────────────────────────

const DEFAULT_CHALLENGES = [
  {
    key: "visit_week",
    title: "Explora la pantalla de semana",
    description: "Aquí es donde ocurre toda la magia. La pantalla de semana es el corazón de Lunchfy: organizas tus comidas por días y todo empieza aquí.",
    howTo: "Toca 'Semana' en la navegación inferior. Ya estás aquí, así que este reto se completa automáticamente.",
    rewardBites: 10, order: 1, phase: 1, phaseLabel: "Descubre la app",
    triggerType: "visit_week", triggerCount: 1
  },
  {
    key: "visit_dishes",
    title: "Abre la sección de platos",
    description: "Los platos son las recetas que asignas a los días de tu semana. También aquí encontrarás los ingredientes, que son la base de la lista de la compra automática.",
    howTo: "Toca 'Platos' en la navegación inferior.",
    rewardBites: 10, order: 2, phase: 1, phaseLabel: "Descubre la app",
    triggerType: "visit_dishes", triggerCount: 1
  },
  {
    key: "create_ingredient",
    title: "Crea tu primer ingrediente",
    description: "Los ingredientes que añadas aquí aparecerán automáticamente en tu lista de la compra cuando planifiques platos que los usen. Sin escribir nada manualmente.",
    howTo: "En Platos → toca la pestaña 'Ingredientes' → toca el botón + → escribe un ingrediente que compras habitualmente → guarda.",
    rewardBites: 20, order: 3, phase: 1, phaseLabel: "Descubre la app",
    triggerType: "create_ingredient", triggerCount: 1
  },
  {
    key: "create_dish",
    title: "Crea tu primer plato",
    description: "Este es el momento clave. Cuando creas un plato y le añades ingredientes, Lunchfy puede generar tu lista de la compra de forma completamente automática.",
    howTo: "En Platos → toca + → ponle un nombre al plato → añade ingredientes → guarda.",
    rewardBites: 40, order: 4, phase: 2, phaseLabel: "Aprende los platos",
    triggerType: "create_dish", triggerCount: 1
  },
  {
    key: "plan_first_meal",
    title: "Planifica tu primera comida",
    description: "Es hora de asignar un plato a un día de la semana. Así construyes tu menú semanal, y tu lista de la compra se actualiza automáticamente.",
    howTo: "Ve a Semana → elige un día → toca el espacio de comida → selecciona el plato que creaste.",
    rewardBites: 25, order: 5, phase: 3, phaseLabel: "Planifica tu semana",
    triggerType: "plan_meal", triggerCount: 1
  },
  {
    key: "plan_3_meals",
    title: "Planifica 3 comidas en la misma semana",
    description: "Con más platos planificados, tu lista de la compra empieza a tener sentido real. Cuantas más comidas planifiques, más completa será tu lista.",
    howTo: "Sigue añadiendo platos a los días de la semana actual. Necesitas un total de 3 comidas.",
    rewardBites: 50, order: 6, phase: 3, phaseLabel: "Planifica tu semana",
    triggerType: "plan_meal", triggerCount: 3
  },
  {
    key: "plan_full_week",
    title: "Completa una semana entera",
    description: "Una semana completa significa tener comida planificada para todos los días. Este es tu primer plan semanal completo — un logro importante.",
    howTo: "Planifica el resto de los días de la semana hasta tener los 5 días con al menos una comida.",
    rewardBites: 100, order: 7, phase: 3, phaseLabel: "Planifica tu semana",
    triggerType: "plan_full_week", triggerCount: 1
  },
  {
    key: "visit_shopping",
    title: "Abre la lista de la compra",
    description: "Tu lista de la compra se genera automáticamente a partir de los platos que has planificado. No tienes que escribir nada manualmente — Lunchfy lo hace por ti.",
    howTo: "Toca 'Lista' en la navegación inferior.",
    rewardBites: 15, order: 8, phase: 4, phaseLabel: "La compra",
    triggerType: "visit_shopping", triggerCount: 1
  },
  {
    key: "mark_3_purchases",
    title: "Marca 3 productos como comprados",
    description: "Cuando compras algo en el supermercado, márcalo en la lista. Así llevas el control de tu compra en tiempo real y sabes exactamente qué te falta.",
    howTo: "En Lista → toca el círculo al lado de un producto para marcarlo como comprado. Hazlo con 3 productos.",
    rewardBites: 40, order: 9, phase: 4, phaseLabel: "La compra",
    triggerType: "mark_purchased", triggerCount: 3
  },
  {
    key: "visit_catalog",
    title: "Visita el catálogo de packs",
    description: "El catálogo contiene packs de platos creados especialmente para ti. Un pack puede añadir decenas de platos a tu hogar al instante, con ingredientes ya configurados.",
    howTo: "Toca 'Catálogo' en la navegación inferior.",
    rewardBites: 15, order: 10, phase: 5, phaseLabel: "Descubre el catálogo",
    triggerType: "visit_catalog", triggerCount: 1
  },
  {
    key: "install_pack",
    title: "Instala tu primer pack del catálogo",
    description: "¡Hora de usar los Bites que has ganado! Encuentra un pack y úsalos para instalarlo. Los platos del pack se añadirán directamente a tu biblioteca.",
    howTo: "En Catálogo → elige un pack con precio en Bites → toca 'Instalar' → confirma.",
    rewardBites: 100, order: 11, phase: 5, phaseLabel: "Descubre el catálogo",
    triggerType: "install_pack", triggerCount: 1
  }
];

// ─── Seed ────────────────────────────────────────────────────────────────────

export async function seedOnboardingChallenges() {
  for (const c of DEFAULT_CHALLENGES) {
    await OnboardingChallenge.updateOne(
      { key: c.key },
      { $setOnInsert: c },
      { upsert: true }
    );
  }
  console.log("[onboarding] Challenges seeded.");
}

// ─── Internal helpers ─────────────────────────────────────────────────────────

async function _grantBites(householdId, amount, reason) {
  const household = await Household.findById(householdId).lean();
  if (!household) return;

  const newFree = Math.min(
    (household.freeBitesBalance ?? 0) + amount,
    500 // basic carry-over cap
  );

  await Household.updateOne({ _id: household._id }, { $set: { freeBitesBalance: newFree } });

  await BitesTransaction.create({
    householdId: household._id,
    type: "admin_grant",
    amount,
    balanceAfterFree: newFree,
    balanceAfterPurchased: household.purchasedBitesBalance ?? 0,
    reason,
    metadata: { source: "onboarding" }
  });
}

// ─── Init ────────────────────────────────────────────────────────────────────

export async function initOnboarding(householdId) {
  const existing = await HouseholdOnboarding.findOne({ householdId });
  if (existing) return existing;

  const onboarding = await HouseholdOnboarding.create({
    householdId,
    status: "active",
    startedAt: new Date()
  });

  try {
    await _grantBites(String(householdId), WELCOME_BITES, "Bienvenida a Lunchfy 🎉");
    await HouseholdOnboarding.updateOne({ _id: onboarding._id }, { $set: { welcomeBitesGranted: true } });
    console.log(`[onboarding] Welcome bites granted (+${WELCOME_BITES}) household=${householdId}`);
  } catch (err) {
    console.error("[onboarding] Failed to grant welcome bites:", err.message);
  }

  return onboarding;
}

// ─── Get state ───────────────────────────────────────────────────────────────

export async function getOnboardingState(householdId) {
  let onboarding = await HouseholdOnboarding.findOne({ householdId }).lean();
  if (!onboarding) {
    await initOnboarding(householdId);
    onboarding = await HouseholdOnboarding.findOne({ householdId }).lean();
  }

  const challenges = await OnboardingChallenge.find({ active: true }).sort({ order: 1 }).lean();
  const completedKeys = new Set((onboarding.completedChallenges || []).map((c) => c.challengeKey));

  const enriched = challenges.map((c) => {
    const done = completedKeys.has(c.key);
    const entry = done ? (onboarding.completedChallenges || []).find((x) => x.challengeKey === c.key) : null;
    return {
      ...c,
      id: c._id,
      completed: done,
      completedAt: entry?.completedAt ?? null,
      rewardBitesEarned: entry?.rewardBites ?? 0
    };
  });

  const totalBitesAvailable = WELCOME_BITES + challenges.reduce((s, c) => s + (c.rewardBites || 0), 0);
  const progressPercent = challenges.length > 0 ? Math.round((completedKeys.size / challenges.length) * 100) : 0;
  const nextChallenge = enriched.find((c) => !c.completed) ?? null;

  return {
    status: onboarding.status,
    welcomeBitesGranted: onboarding.welcomeBitesGranted,
    completedCount: completedKeys.size,
    totalCount: challenges.length,
    progressPercent,
    totalBitesEarned: onboarding.totalBitesEarned ?? 0,
    totalBitesAvailable,
    mealsPlanCount: onboarding.mealsPlanCount ?? 0,
    purchasesMarkedCount: onboarding.purchasesMarkedCount ?? 0,
    challenges: enriched,
    nextChallenge,
    startedAt: onboarding.startedAt,
    completedAt: onboarding.completedAt
  };
}

// ─── Trigger ─────────────────────────────────────────────────────────────────

export async function triggerOnboarding(householdId, triggerType, _context = {}) {
  try {
    // Only for basic/free plan users
    const household = await Household.findById(householdId).select("subscriptionPlan").lean();
    if (!household) return null;
    const plan = normalizeSubscriptionPlan(household.subscriptionPlan);
    if (!["basic", "free"].includes(plan)) return null;

    let onboarding = await HouseholdOnboarding.findOne({ householdId });
    if (!onboarding) {
      await initOnboarding(householdId);
      onboarding = await HouseholdOnboarding.findOne({ householdId });
    }
    if (!onboarding || ["completed", "disabled"].includes(onboarding.status)) return null;

    const challenges = await OnboardingChallenge.find({ active: true }).sort({ order: 1 }).lean();
    const completedKeys = new Set((onboarding.completedChallenges || []).map((c) => c.challengeKey));

    // Increment counters
    const counterUpdates = {};
    if (triggerType === "plan_meal") counterUpdates.mealsPlanCount = (onboarding.mealsPlanCount || 0) + 1;
    if (triggerType === "mark_purchased") counterUpdates.purchasesMarkedCount = (onboarding.purchasesMarkedCount || 0) + 1;

    if (Object.keys(counterUpdates).length > 0) {
      await HouseholdOnboarding.updateOne({ _id: onboarding._id }, { $set: counterUpdates });
      Object.assign(onboarding, counterUpdates);
    }

    // Find the next incomplete challenge
    const nextChallenge = challenges.find((c) => !completedKeys.has(c.key));
    if (!nextChallenge) return null;

    // Check if this trigger completes the next challenge
    let canComplete = false;

    if (nextChallenge.triggerType === triggerType) {
      if (triggerType === "plan_meal") {
        // "plan_first_meal" needs count >= 1; "plan_3_meals" needs count >= 3
        canComplete = (onboarding.mealsPlanCount || 0) >= (nextChallenge.triggerCount || 1);
      } else if (triggerType === "mark_purchased") {
        canComplete = (onboarding.purchasesMarkedCount || 0) >= (nextChallenge.triggerCount || 1);
      } else {
        canComplete = true;
      }
    }

    if (!canComplete) return null;

    // Mark challenge complete
    const now = new Date();
    const completedEntry = {
      challengeId: nextChallenge._id,
      challengeKey: nextChallenge.key,
      completedAt: now,
      rewardBites: nextChallenge.rewardBites
    };

    const newTotal = (onboarding.totalBitesEarned || 0) + nextChallenge.rewardBites;
    const newCompletedKeys = new Set([...completedKeys, nextChallenge.key]);
    const allDone = challenges.every((c) => newCompletedKeys.has(c.key));

    await HouseholdOnboarding.updateOne(
      { _id: onboarding._id },
      {
        $push: { completedChallenges: completedEntry },
        $set: {
          totalBitesEarned: newTotal,
          ...(allDone ? { status: "completed", completedAt: now } : {})
        }
      }
    );

    if (nextChallenge.rewardBites > 0) {
      await _grantBites(
        String(householdId),
        nextChallenge.rewardBites,
        `Reto completado: ${nextChallenge.title}`
      );
    }

    console.log(`[onboarding] ✓ ${nextChallenge.key} (+${nextChallenge.rewardBites} bites) household=${householdId}${allDone ? " — COMPLETE" : ""}`);

    return {
      completed: true,
      allDone,
      challenge: {
        key: nextChallenge.key,
        title: nextChallenge.title,
        rewardBites: nextChallenge.rewardBites
      }
    };
  } catch (err) {
    console.error("[onboarding] triggerOnboarding error:", err.message);
    return null;
  }
}

// ─── Admin operations ─────────────────────────────────────────────────────────

export async function resetOnboarding(householdId, adminUserId, reason = "") {
  await HouseholdOnboarding.updateOne(
    { householdId },
    {
      $set: {
        status: "active",
        completedChallenges: [],
        mealsPlanCount: 0,
        purchasesMarkedCount: 0,
        totalBitesEarned: 0,
        startedAt: new Date(),
        completedAt: null
      },
      $push: { resetHistory: { resetAt: new Date(), resetBy: adminUserId || null, reason } }
    },
    { upsert: true }
  );
}

export async function setOnboardingStatus(householdId, status) {
  const validStatuses = ["active", "completed", "disabled", "not_started"];
  if (!validStatuses.includes(status)) throw new Error(`Invalid status: ${status}`);
  await HouseholdOnboarding.updateOne(
    { householdId },
    {
      $set: {
        status,
        ...(status === "completed" ? { completedAt: new Date() } : {}),
        ...(status === "active" && !(await HouseholdOnboarding.findOne({ householdId }))?.startedAt
          ? { startedAt: new Date() }
          : {})
      }
    },
    { upsert: true }
  );
}
