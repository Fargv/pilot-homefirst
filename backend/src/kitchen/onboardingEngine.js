import { HouseholdOnboarding } from "./models/HouseholdOnboarding.js";
import { OnboardingChallenge } from "./models/OnboardingChallenge.js";
import { OnboardingSuggestion } from "./models/OnboardingSuggestion.js";
import { Household } from "./models/Household.js";
import { BitesTransaction } from "./models/BitesTransaction.js";
import { KitchenWeekPlan } from "./models/KitchenWeekPlan.js";
import { normalizeSubscriptionPlan } from "./subscriptionService.js";

const WELCOME_BITES = 20;

// Screens required for explore_app challenge (in trigger-event format)
const EXPLORE_REQUIRED = ["visit_week", "visit_dishes", "visit_shopping", "visit_catalog", "visit_settings"];

// ─── Default challenge definitions ───────────────────────────────────────────
// Total challenge reward: 80 bites. Welcome: +20. Grand total: 100.
// Onboarding pack costs 80 bites → user ends with 20 bites remaining.

const DEFAULT_CHALLENGES = [
  {
    key: "explore_app",
    title: "Explora Lunchfy",
    description: "Antes de empezar a crear y planificar, dedica un minuto a conocer la app. Visita las 5 secciones principales desde la barra de navegación inferior.",
    howTo: "Visita: Planificación · Cocina (y la pestaña Productos) · Lista de la compra · Catálogo · Ajustes.",
    rewardBites: 5, order: 1, phase: 1, phaseLabel: "Conoce la app",
    triggerType: "explore_app", triggerCount: 5
  },
  {
    key: "create_ingredient",
    title: "Crea tu primer producto",
    description: "Los productos son la base de todo. Cuando los añadas a un plato, Lunchfy los incluirá automáticamente en tu lista de la compra. Sin escribir nada a mano.",
    howTo: "Ve a Cocina → pestaña Productos → toca + → escribe el nombre de un producto que usas habitualmente → guarda.",
    rewardBites: 10, order: 2, phase: 2, phaseLabel: "Productos",
    triggerType: "create_ingredient", triggerCount: 1
  },
  {
    key: "create_second_ingredient",
    title: "Añade un segundo producto",
    description: "Cuantos más productos tengas, más completa y útil será tu lista de la compra. Añade al menos un producto más para empezar a construir tu despensa.",
    howTo: "Ve a Cocina → pestaña Productos → toca + → crea otro producto diferente.",
    rewardBites: 5, order: 3, phase: 2, phaseLabel: "Productos",
    triggerType: "create_ingredient", triggerCount: 2
  },
  {
    key: "create_dish",
    title: "Crea tu primer plato",
    description: "Un plato es una receta que asignarás a los días de tu semana. Los platos con ingredientes generan automáticamente tu lista de la compra.",
    howTo: "Ve a Cocina → toca + → escribe el nombre de un plato que cocinas habitualmente → guarda.",
    rewardBites: 10, order: 4, phase: 3, phaseLabel: "Platos",
    triggerType: "create_dish", triggerCount: 1
  },
  {
    key: "add_ingredient_to_dish",
    title: "Añade ingredientes a un plato",
    description: "Este es el paso que activa la magia. Al vincular ingredientes a un plato, Lunchfy sabrá qué comprar automáticamente cuando planifiques esa comida.",
    howTo: "Abre un plato existente o crea uno nuevo → en el formulario del plato, busca y añade los ingredientes que necesita → guarda.",
    rewardBites: 5, order: 5, phase: 3, phaseLabel: "Platos",
    triggerType: "add_ingredient_to_dish", triggerCount: 1
  },
  {
    key: "plan_first_meal",
    title: "Planifica tu primera comida",
    description: "Es el momento de asignar un plato a un día de la semana. Así construyes tu menú semanal y tu lista de la compra se actualiza automáticamente.",
    howTo: "Ve a Planificación → elige un día → toca el espacio de comida → selecciona el plato que creaste.",
    rewardBites: 10, order: 6, phase: 4, phaseLabel: "Planificación",
    triggerType: "plan_meal", triggerCount: 1
  },
  {
    key: "plan_3_meals",
    title: "Planifica 3 comidas en la semana",
    description: "Con más platos planificados tu lista de la compra empieza a tener sentido real. Cuantas más comidas planifiques, más completa y útil será tu lista.",
    howTo: "Sigue añadiendo platos a los días de la semana actual hasta tener un total de 3 comidas.",
    rewardBites: 5, order: 7, phase: 4, phaseLabel: "Planificación",
    triggerType: "plan_meal", triggerCount: 3
  },
  {
    key: "plan_full_week",
    title: "Completa una semana entera",
    description: "Una semana completa significa tener comida planificada de lunes a viernes. Este es tu primer plan semanal completo.",
    howTo: "Planifica el resto de los días hasta tener los 5 días laborables con al menos una comida.",
    rewardBites: 10, order: 8, phase: 4, phaseLabel: "Planificación",
    triggerType: "plan_full_week", triggerCount: 1
  },
  {
    key: "mark_3_purchases",
    title: "Marca 3 productos como comprados",
    description: "Cuando compres algo en el supermercado, márcalo en la lista. Así llevas el control en tiempo real y sabes exactamente qué te falta.",
    howTo: "Ve a Lista de la compra → toca el círculo al lado de un producto para marcarlo como comprado. Hazlo con 3 productos.",
    rewardBites: 10, order: 9, phase: 5, phaseLabel: "Lista de la compra",
    triggerType: "mark_purchased", triggerCount: 3
  },
  {
    key: "update_household",
    title: "Personaliza tu hogar",
    description: "Cada household es único. Personalizar el nombre de tu hogar hace que la app sea tuya y facilita la colaboración si invitas a otras personas.",
    howTo: "Ve a Ajustes → toca el icono de editar junto al nombre del household → escribe un nombre → guarda.",
    rewardBites: 5, order: 10, phase: 6, phaseLabel: "Tu hogar",
    triggerType: "update_household", triggerCount: 1
  },
  {
    key: "install_pack",
    title: "Instala tu primer pack del catálogo",
    description: "El catálogo contiene packs de platos listos para usar. Instala el pack de bienvenida con los Bites que has ganado y descubre lo fácil que es ampliar tu biblioteca.",
    howTo: "Ve a Catálogo → busca el pack de bienvenida → toca Instalar → confirma con tus Bites.",
    rewardBites: 5, order: 11, phase: 7, phaseLabel: "Catálogo",
    triggerType: "install_pack", triggerCount: 1
  }
];

const DEFAULT_INGREDIENT_SUGGESTIONS = [
  "Burrata", "Kimchi", "Tahini", "Halloumi", "Panko", "Edamame",
  "Leche de coco", "Mango chutney", "Ñoquis", "Aguacate",
  "Miso", "Sriracha", "Tofu firme", "Queso feta", "Rúcula",
  "Pesto", "Hummus", "Tempeh", "Chucrut", "Parmesano"
];

const DEFAULT_DISH_SUGGESTIONS = [
  "Pollo crujiente con panko", "Tacos de halloumi", "Noodles al curry de coco",
  "Arroz frito con kimchi", "Ñoquis con burrata y pesto", "Tostada de aguacate mediterránea",
  "Bowl de edamame y tofu", "Pasta con tahini y limón", "Ensalada de rúcula y feta",
  "Salmon teriyaki", "Shakshuka", "Ramen de miso"
];

// ─── Seed & cleanup ──────────────────────────────────────────────────────────

// Legacy keys from older seeds that should no longer exist as standalone challenges.
// These trigger events still work as inputs to explore_app tracking.
const LEGACY_CHALLENGE_KEYS = [
  "visit_week", "visit_dishes", "visit_ingredients",
  "visit_shopping", "visit_catalog"
];

// NOTE: complete_purchase_with_store challenge (after mark_3_purchases) is intentionally absent.
// The purchase-session complete route (POST /purchase-sessions/:id/complete) gates behind
// budgetFeatureEnabled (Pro/Premium). Store selection also lives inside that flow.
// Basic users have no "complete purchase" action — only item-level mark_purchased.
// Adding this challenge would silently fail for Basic users; it cannot be made Basic-compatible
// without redesigning the shopping flow. If a future Basic checkout action is added, wire it here.
export async function seedOnboardingChallenges() {
  for (const c of DEFAULT_CHALLENGES) {
    // Always keep structural fields (order, phase, phaseLabel, triggerType, triggerCount)
    // in sync with DEFAULT_CHALLENGES so DB order matches code even after schema changes.
    // Content fields (title, description, howTo, rewardBites) are only set on first insert
    // to preserve any admin customisations.
    const { key, order, phase, phaseLabel, triggerType, triggerCount, ...content } = c;
    await OnboardingChallenge.updateOne(
      { key },
      {
        $set: { order, phase, phaseLabel, triggerType, triggerCount },
        $setOnInsert: { key, ...content }
      },
      { upsert: true }
    );
  }
  console.log("[onboarding] Challenges seeded.");
}

export async function cleanupOldChallenges() {
  const validKeys = new Set(DEFAULT_CHALLENGES.map((c) => c.key));
  const keysToDeactivate = LEGACY_CHALLENGE_KEYS.filter((k) => !validKeys.has(k));
  if (keysToDeactivate.length === 0) return;
  const result = await OnboardingChallenge.updateMany(
    { key: { $in: keysToDeactivate }, active: true },
    { $set: { active: false } }
  );
  if (result.modifiedCount > 0) {
    console.log(`[onboarding] Deactivated ${result.modifiedCount} legacy challenge(s): ${keysToDeactivate.join(", ")}`);
  }
}

export async function seedOnboardingSuggestions() {
  const existing = await OnboardingSuggestion.countDocuments();
  if (existing > 0) return; // only seed if empty
  const ingredientDocs = DEFAULT_INGREDIENT_SUGGESTIONS.map((text, i) => ({
    type: "ingredient", text, active: true, order: i
  }));
  const dishDocs = DEFAULT_DISH_SUGGESTIONS.map((text, i) => ({
    type: "dish", text, active: true, order: i
  }));
  await OnboardingSuggestion.insertMany([...ingredientDocs, ...dishDocs]);
  console.log("[onboarding] Suggestions seeded.");
}

// ─── Internal helpers ─────────────────────────────────────────────────────────

async function _grantBites(householdId, amount, reason, metadata = { source: "onboarding" }) {
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
    metadata
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
    await _grantBites(String(householdId), WELCOME_BITES, "Bienvenida a Lunchfy", { source: "welcome_bonus" });
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
    // Auto-init only for plan-eligible users; admin-assigned users already have a record
    const household = await Household.findById(householdId).select("subscriptionPlan").lean();
    const plan = normalizeSubscriptionPlan(household?.subscriptionPlan);
    if (["basic", "free"].includes(plan)) {
      await initOnboarding(householdId);
      onboarding = await HouseholdOnboarding.findOne({ householdId }).lean();
    }
    if (!onboarding) return null;
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

  const screensVisited = onboarding.screensVisited || [];
  const exploreProgress = {
    visited: screensVisited,
    required: EXPLORE_REQUIRED,
    count: screensVisited.filter((s) => EXPLORE_REQUIRED.includes(s)).length,
    total: EXPLORE_REQUIRED.length
  };

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
    ingredientsCreatedCount: onboarding.ingredientsCreatedCount ?? 0,
    exploreProgress,
    challenges: enriched,
    nextChallenge,
    startedAt: onboarding.startedAt,
    completedAt: onboarding.completedAt
  };
}

// ─── Trigger ─────────────────────────────────────────────────────────────────

export async function triggerOnboarding(householdId, triggerType, _context = {}) {
  try {
    let onboarding = await HouseholdOnboarding.findOne({ householdId });

    if (!onboarding) {
      // Auto-init only for plan-eligible users; others only get onboarding via admin assign
      const household = await Household.findById(householdId).select("subscriptionPlan").lean();
      if (!household) return null;
      const plan = normalizeSubscriptionPlan(household.subscriptionPlan);
      if (!["basic", "free"].includes(plan)) return null;
      await initOnboarding(householdId);
      onboarding = await HouseholdOnboarding.findOne({ householdId });
    }

    if (!onboarding || ["completed", "disabled"].includes(onboarding.status)) return null;

    const challenges = await OnboardingChallenge.find({ active: true }).sort({ order: 1 }).lean();
    const completedKeys = new Set((onboarding.completedChallenges || []).map((c) => c.challengeKey));

    // Update persistent counters
    const counterUpdates = {};
    if (triggerType === "plan_meal") {
      // Count actual unique lunch meals planned across all weeks — prevents double-counting
      // from re-saves, autosave, or repeated triggers on the same slot.
      const weeks = await KitchenWeekPlan.find({ householdId }).select("days").lean();
      const actualCount = weeks.reduce(
        (sum, w) => sum + (w.days || []).filter((d) => d.mainDishId && d.mealType !== "dinner").length,
        0
      );
      counterUpdates.mealsPlanCount = actualCount;
    }
    if (triggerType === "mark_purchased") counterUpdates.purchasesMarkedCount = (onboarding.purchasesMarkedCount || 0) + 1;
    if (triggerType === "create_ingredient") counterUpdates.ingredientsCreatedCount = (onboarding.ingredientsCreatedCount || 0) + 1;

    if (Object.keys(counterUpdates).length > 0) {
      await HouseholdOnboarding.updateOne({ _id: onboarding._id }, { $set: counterUpdates });
      Object.assign(onboarding, counterUpdates);
    }

    // Track visited screens for explore_app challenge
    if (triggerType.startsWith("visit_") && EXPLORE_REQUIRED.includes(triggerType)) {
      const current = onboarding.screensVisited || [];
      if (!current.includes(triggerType)) {
        await HouseholdOnboarding.updateOne({ _id: onboarding._id }, { $addToSet: { screensVisited: triggerType } });
        onboarding.screensVisited = [...new Set([...current, triggerType])];
      }
    }

    // Find the next incomplete challenge
    const nextChallenge = challenges.find((c) => !completedKeys.has(c.key));
    if (!nextChallenge) return null;

    // Check if this trigger completes the next challenge
    let canComplete = false;

    if (nextChallenge.key === "explore_app" && triggerType.startsWith("visit_")) {
      // Special: completes when all required screens have been visited
      const visited = onboarding.screensVisited || [];
      canComplete = EXPLORE_REQUIRED.every((s) => visited.includes(s));
    } else if (nextChallenge.triggerType === triggerType) {
      if (triggerType === "plan_meal") {
        canComplete = (onboarding.mealsPlanCount || 0) >= (nextChallenge.triggerCount || 1);
      } else if (triggerType === "mark_purchased") {
        canComplete = (onboarding.purchasesMarkedCount || 0) >= (nextChallenge.triggerCount || 1);
      } else if (triggerType === "create_ingredient") {
        canComplete = (onboarding.ingredientsCreatedCount || 0) >= (nextChallenge.triggerCount || 1);
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
        `Reto completado: ${nextChallenge.title}`,
        { source: "onboarding_challenge", challengeKey: nextChallenge.key }
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
        ingredientsCreatedCount: 0,
        screensVisited: [],
        totalBitesEarned: 0,
        startedAt: new Date(),
        completedAt: null
      },
      $push: { resetHistory: { resetAt: new Date(), resetBy: adminUserId || null, reason } }
    },
    { upsert: true }
  );
}

export async function assignOnboarding(householdId) {
  await HouseholdOnboarding.deleteOne({ householdId });
  return initOnboarding(householdId);
}

export async function removeOnboarding(householdId) {
  await HouseholdOnboarding.updateOne(
    { householdId },
    { $set: { status: "disabled" } },
    { upsert: false }
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
