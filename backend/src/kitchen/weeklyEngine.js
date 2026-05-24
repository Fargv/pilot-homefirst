import mongoose from "mongoose";
import { HouseholdOnboarding } from "./models/HouseholdOnboarding.js";
import { WeeklyChallengeDef } from "./models/WeeklyChallengeDef.js";
import { WeeklyCycleConfig } from "./models/WeeklyCycleConfig.js";
import { HouseholdWeeklyProgress } from "./models/HouseholdWeeklyProgress.js";
import { Household } from "./models/Household.js";
import { KitchenWeekPlan } from "./models/KitchenWeekPlan.js";
import { KitchenDish } from "./models/KitchenDish.js";
import { BitesTransaction } from "./models/BitesTransaction.js";
import { recordMeaningfulActivity, tryUnlockBetaPro } from "./betaProService.js";

// ─── Seed data ────────────────────────────────────────────────────────────────

const CYCLE_CHALLENGE_DEFS = [
  // WEEK 1 — "Empieza a organizarte"
  // Goal: planning + shopping list (manual items) + dish creation + catalog usage
  // Removed: weekly_complete_meal_week (too similar to weekly_plan_5_meals — duplicate planning goal)
  {
    key: "weekly_plan_5_meals",
    title: "Planifica 5 comidas",
    description: "Asigna un plato a 5 días de la semana.",
    guidance: "Abre la vista semanal y asigna un plato a cada día de lunes a viernes.",
    rewardBites: 10,
    triggerType: "meal_planned",
    triggerCount: 5,
    cycleWeek: 1,
    cycleOrder: 1,
    planCompatibility: ["all"]
  },
  {
    // RETIRED — too similar to weekly_plan_5_meals (both teach planning).
    // Replaced in Week 1 by weekly_use_catalog_dish.
    // Kept here with active:false so the seeder deactivates the existing DB record.
    key: "weekly_complete_meal_week",
    title: "Completa una semana de comidas",
    description: "Planifica los 5 días laborables de esta semana.",
    guidance: "",
    rewardBites: 10,
    triggerType: "meal_planned",
    triggerCount: 1,
    cycleWeek: 1,
    cycleOrder: 2,
    active: false,
    planCompatibility: ["all"]
  },
  {
    key: "weekly_add_manual_shopping_item",
    title: "Añade un producto manual a la lista",
    description: "Tu lista de Lunchfy también sirve para cosas del hogar. Ve a la lista de la compra y pulsa 'Añadir manualmente' para agregar algo como papel de cocina, friegasuelos o champú.",
    guidance: "Tu lista de Lunchfy también sirve para cosas del hogar. Ve a la lista de la compra y pulsa 'Añadir manualmente' para agregar algo como papel de cocina, friegasuelos o champú.",
    rewardBites: 10,
    triggerType: "manual_item_added",
    triggerCount: 1,
    cycleWeek: 1,
    cycleOrder: 2,
    planCompatibility: ["all"]
  },
  {
    key: "weekly_mark_5_items_purchased",
    title: "Marca 5 ingredientes como comprados",
    description: "Ve a la lista de la compra y marca ingredientes conforme los vayas comprando.",
    guidance: "Ve a la lista de la compra y marca ingredientes conforme los vayas comprando.",
    rewardBites: 5,
    triggerType: "item_purchased",
    triggerCount: 5,
    cycleWeek: 1,
    cycleOrder: 3,
    planCompatibility: ["all"]
  },
  {
    key: "weekly_create_new_dish",
    title: "Crea un plato nuevo",
    description: "Ve a la sección Platos y añade un plato propio con sus ingredientes.",
    guidance: "Ve a la sección Platos y añade un plato propio con sus ingredientes.",
    rewardBites: 5,
    triggerType: "dish_created",
    triggerCount: 1,
    cycleWeek: 1,
    cycleOrder: 4,
    planCompatibility: ["all"]
  },
  {
    key: "weekly_use_catalog_dish",
    title: "Usa un plato del catálogo en tu semana",
    description: "Instala un pack del catálogo y añade uno de sus platos a tu planificación semanal.",
    guidance: "Los packs del catálogo incluyen platos listos para usar. Instala uno desde la sección Catálogo y asigna cualquiera de sus platos a un día de la semana.",
    rewardBites: 5,
    triggerType: "catalog_dish_used",
    triggerCount: 1,
    cycleWeek: 1,
    cycleOrder: 5,
    planCompatibility: ["all"]
  },
  {
    key: "weekly_complete_all_bonus_w1",
    title: "Completa todos los retos de la semana",
    description: "",
    guidance: "",
    rewardBites: 5,
    triggerType: "bonus",
    triggerCount: 1,
    cycleWeek: 1,
    cycleOrder: 99,
    planCompatibility: ["all"]
  },

  // WEEK 2 — "Tu hogar en una sola lista"
  {
    key: "weekly_complete_shopping_list",
    title: "Completa una lista de compra",
    description: "",
    guidance: "",
    rewardBites: 10,
    triggerType: "shopping_list_completed",
    triggerCount: 1,
    cycleWeek: 2,
    cycleOrder: 1,
    planCompatibility: ["all"]
  },
  {
    key: "weekly_use_3_different_dishes",
    title: "Usa 3 platos distintos",
    description: "",
    guidance: "",
    rewardBites: 10,
    triggerType: "meal_planned",
    triggerCount: 3,
    cycleWeek: 2,
    cycleOrder: 2,
    planCompatibility: ["all"]
  },
  {
    key: "weekly_install_catalog_pack",
    title: "Instala un pack del catálogo",
    description: "",
    guidance: "",
    rewardBites: 5,
    triggerType: "pack_installed",
    triggerCount: 1,
    cycleWeek: 2,
    cycleOrder: 3,
    planCompatibility: ["all"]
  },
  {
    key: "weekly_add_2_ingredients",
    title: "Añade 2 ingredientes nuevos",
    description: "",
    guidance: "",
    rewardBites: 10,
    triggerType: "ingredient_created",
    triggerCount: 2,
    cycleWeek: 2,
    cycleOrder: 4,
    planCompatibility: ["all"]
  },
  {
    key: "weekly_complete_all_bonus_w2",
    title: "Completa todos los retos de la semana",
    description: "",
    guidance: "",
    rewardBites: 5,
    triggerType: "bonus",
    triggerCount: 1,
    cycleWeek: 2,
    cycleOrder: 99,
    planCompatibility: ["all"]
  },

  // WEEK 3 — "Semana organizada"
  {
    key: "weekly_plan_full_week_before_thursday",
    title: "Planifica toda la semana antes del jueves",
    description: "",
    guidance: "",
    rewardBites: 15,
    triggerType: "meal_planned",
    triggerCount: 1,
    cycleWeek: 3,
    cycleOrder: 1,
    planCompatibility: ["all"]
  },
  {
    key: "weekly_no_repeated_dishes",
    title: "No repitas ningún plato",
    description: "",
    guidance: "",
    rewardBites: 10,
    triggerType: "meal_planned",
    triggerCount: 1,
    cycleWeek: 3,
    cycleOrder: 2,
    planCompatibility: ["all"]
  },
  {
    key: "weekly_mark_5_items_purchased_w3",
    title: "Marca 5 ingredientes como comprados",
    description: "",
    guidance: "",
    rewardBites: 5,
    triggerType: "item_purchased",
    triggerCount: 5,
    cycleWeek: 3,
    cycleOrder: 3,
    planCompatibility: ["all"]
  },
  {
    key: "weekly_use_app_3_days",
    title: "Usa Lunchfy 3 días distintos",
    description: "",
    guidance: "",
    rewardBites: 5,
    triggerType: "app_activity",
    triggerCount: 3,
    cycleWeek: 3,
    cycleOrder: 4,
    planCompatibility: ["all"]
  },
  {
    key: "weekly_complete_all_bonus_w3",
    title: "Completa todos los retos de la semana",
    description: "",
    guidance: "",
    rewardBites: 5,
    triggerType: "bonus",
    triggerCount: 1,
    cycleWeek: 3,
    cycleOrder: 99,
    planCompatibility: ["all"]
  },

  // WEEK 4 — "Chef de confianza"
  {
    key: "weekly_create_2_dishes",
    title: "Crea 2 platos nuevos",
    description: "",
    guidance: "",
    rewardBites: 10,
    triggerType: "dish_created",
    triggerCount: 2,
    cycleWeek: 4,
    cycleOrder: 1,
    planCompatibility: ["all"]
  },
  {
    key: "weekly_use_5_different_dishes",
    title: "Usa 5 platos distintos",
    description: "",
    guidance: "",
    rewardBites: 10,
    triggerType: "meal_planned",
    triggerCount: 5,
    cycleWeek: 4,
    cycleOrder: 2,
    planCompatibility: ["all"]
  },
  {
    key: "weekly_complete_meal_week_w4",
    title: "Completa una semana de comidas",
    description: "",
    guidance: "",
    rewardBites: 10,
    triggerType: "meal_planned",
    triggerCount: 1,
    cycleWeek: 4,
    cycleOrder: 3,
    planCompatibility: ["all"]
  },
  {
    key: "weekly_complete_shopping_list_w4",
    title: "Completa una lista de compra",
    description: "",
    guidance: "",
    rewardBites: 5,
    triggerType: "shopping_list_completed",
    triggerCount: 1,
    cycleWeek: 4,
    cycleOrder: 4,
    planCompatibility: ["all"]
  },
  {
    key: "weekly_complete_all_bonus_w4",
    title: "Completa todos los retos de la semana",
    description: "",
    guidance: "",
    rewardBites: 5,
    triggerType: "bonus",
    triggerCount: 1,
    cycleWeek: 4,
    cycleOrder: 99,
    planCompatibility: ["all"]
  }
];

// ─── Date utilities ───────────────────────────────────────────────────────────

/**
 * Returns "YYYY-MM-DD" ISO string for the Monday of the current UTC week.
 */
export function getCurrentWeekStart() {
  const now = new Date();
  const day = now.getUTCDay(); // 0=Sun, 1=Mon, ..., 6=Sat
  const diff = day === 0 ? -6 : 1 - day; // offset to Monday
  const monday = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + diff));
  return monday.toISOString().slice(0, 10);
}

/**
 * Parses "YYYY-MM-DD" string to a UTC midnight Date, safe for MongoDB comparisons.
 */
export function parseWeekStart(isoString) {
  const [year, month, day] = isoString.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day));
}

/**
 * Returns 1-4 cycle week index given a weekStartDate and cycleStartDate.
 */
export function getCycleWeekIndex(weekStartDate, cycleStartDate) {
  const MS_PER_WEEK = 7 * 24 * 60 * 60 * 1000;
  const weeksElapsed = Math.floor((weekStartDate - cycleStartDate) / MS_PER_WEEK);
  if (weeksElapsed < 0) return 1;
  return (weeksElapsed % 4) + 1;
}

// ─── Config ───────────────────────────────────────────────────────────────────

/**
 * Upserts and returns the singleton WeeklyCycleConfig with key="default".
 */
export async function getOrCreateCycleConfig() {
  const config = await WeeklyCycleConfig.findOneAndUpdate(
    { key: "default" },
    { $setOnInsert: { key: "default", cycleStartDate: new Date("2025-05-19"), paused: false, bonusBites: 5 } },
    { upsert: true, new: true }
  );
  return config;
}

// ─── Seed ─────────────────────────────────────────────────────────────────────

/**
 * Seeds all 4-week cycle challenge definitions. Safe to call on every boot.
 * Structural fields always sync; content fields only set on first insert.
 */
export async function seedWeeklyChallengeDefs() {
  for (const def of CYCLE_CHALLENGE_DEFS) {
    const { key, triggerType, triggerCount, cycleWeek, cycleOrder, planCompatibility, active, guidance, description, ...insertOnly } = def;
    await WeeklyChallengeDef.updateOne(
      { key },
      {
        // Structural fields + content that should stay in sync with the code
        $set: {
          triggerType, triggerCount, cycleWeek, cycleOrder, planCompatibility,
          active: active ?? true,
          ...(guidance !== undefined ? { guidance } : {}),
          ...(description !== undefined ? { description } : {})
        },
        // title, rewardBites only set on first insert
        $setOnInsert: { key, ...insertOnly }
      },
      { upsert: true }
    );
  }
  console.log("[weekly] Challenge defs seeded.");
}

// ─── Progress helpers ─────────────────────────────────────────────────────────

/**
 * Upserts and returns the HouseholdWeeklyProgress doc for the given week.
 */
export async function getOrCreateProgress(householdId, weekStart, cycleWeekIndex) {
  const weekStartDate = typeof weekStart === "string" ? parseWeekStart(weekStart) : weekStart;
  const doc = await HouseholdWeeklyProgress.findOneAndUpdate(
    { householdId, weekStart: weekStartDate },
    {
      $setOnInsert: {
        householdId,
        weekStart: weekStartDate,
        cycleWeekIndex,
        mealsPlannedCount: 0,
        itemsPurchasedCount: 0,
        dishesCreatedCount: 0,
        catalogPacksInstalledCount: 0,
        ingredientsCreatedCount: 0,
        manualShoppingItemAdded: false,
        shoppingListCompleted: false,
        catalogDishUsed: false,
        dishIdsUsedThisWeek: [],
        purchasedItemKeys: [],
        appActiveDays: [],
        completedChallenges: [],
        bonusGranted: false
      }
    },
    { upsert: true, new: true }
  );
  return doc;
}

// ─── Bites grant ──────────────────────────────────────────────────────────────

async function _grantBites(householdId, amount, reason, metadata) {
  const household = await Household.findById(householdId).lean();
  if (!household) return;

  const newFree = Math.min(
    (household.freeBitesBalance ?? 0) + amount,
    500 // basic carry-over cap
  );

  await Household.updateOne({ _id: household._id }, { $set: { freeBitesBalance: newFree } });

  // Use "challenge_reward" type so admin ledger queries can distinguish automatic
  // weekly challenge rewards from manual admin grants.
  await BitesTransaction.create({
    householdId: household._id,
    type: "challenge_reward",
    amount,
    balanceAfterFree: newFree,
    balanceAfterPurchased: household.purchasedBitesBalance ?? 0,
    reason,
    metadata
  });
}

// ─── Reward grant ─────────────────────────────────────────────────────────────

/**
 * Marks a challenge as reward-granted in progress and calls _grantBites.
 * Idempotent: does nothing if the reward was already granted.
 */
export async function grantWeeklyReward(householdId, challengeKey, rewardBites, progress) {
  const existing = (progress.completedChallenges || []).find(
    (c) => c.challengeKey === challengeKey && c.rewardGranted === true
  );
  if (existing) return;

  await HouseholdWeeklyProgress.updateOne(
    { _id: progress._id, "completedChallenges.challengeKey": challengeKey },
    { $set: { "completedChallenges.$.rewardGranted": true } }
  );

  if (rewardBites > 0) {
    await _grantBites(
      String(householdId),
      rewardBites,
      `Reto semanal completado: ${challengeKey}`,
      { source: "weekly_challenge", challengeKey }
    );
  }

  console.log(`[weekly] Reward granted: ${challengeKey} (+${rewardBites} bites) household=${householdId}`);
}

// ─── Bonus check ──────────────────────────────────────────────────────────────

/**
 * Checks if all non-bonus challenges for the week are complete, then grants bonus if so.
 */
export async function checkAndGrantBonus(householdId, progress, challenges, bonusBites) {
  if (progress.bonusGranted) return;

  const bonusChallenge = challenges.find((c) => c.triggerType === "bonus");
  if (!bonusChallenge) return;

  const mainChallenges = challenges.filter((c) => c.triggerType !== "bonus");
  const completedKeys = new Set((progress.completedChallenges || []).map((c) => c.challengeKey));
  const allMainDone = mainChallenges.every((c) => completedKeys.has(c.key));

  if (!allMainDone) return;

  // Add bonus to completedChallenges if not already there
  if (!completedKeys.has(bonusChallenge.key)) {
    const bonusEntry = {
      challengeId: bonusChallenge._id,
      challengeKey: bonusChallenge.key,
      completedAt: new Date(),
      rewardBites: bonusChallenge.rewardBites,
      rewardGranted: false
    };
    await HouseholdWeeklyProgress.updateOne(
      { _id: progress._id },
      { $push: { completedChallenges: bonusEntry }, $set: { bonusGranted: true } }
    );
    // Re-fetch for consistent state
    const updatedProgress = await HouseholdWeeklyProgress.findById(progress._id).lean();
    if (updatedProgress) {
      await grantWeeklyReward(householdId, bonusChallenge.key, bonusChallenge.rewardBites, updatedProgress);
    }
  } else {
    await HouseholdWeeklyProgress.updateOne(
      { _id: progress._id },
      { $set: { bonusGranted: true } }
    );
    await grantWeeklyReward(householdId, bonusChallenge.key, bonusBites, progress);
  }

  console.log(`[weekly] Bonus granted for household=${householdId}`);
}

// ─── Week plan helpers ────────────────────────────────────────────────────────

/**
 * Fetches the week plan and returns the count of filled weekday (Mon-Fri) lunch slots.
 * Also returns the array of unique dishIds from those slots.
 */
async function _getWeekPlanStats(householdId, weekStartISO) {
  const weekStartDate = parseWeekStart(weekStartISO);
  const plan = await KitchenWeekPlan.findOne({ householdId, weekStart: weekStartDate }).lean();
  if (!plan || !plan.days) return { count: 0, dishIds: [], weekdaysFilled: new Set() };

  const weekdaysFilled = new Set();
  const dishIdSet = new Set();
  let count = 0;

  for (const day of plan.days) {
    if (!day.mainDishId) continue;
    const d = new Date(day.date);
    const utcDay = d.getUTCDay(); // 0=Sun, 1=Mon, ..., 5=Fri, 6=Sat
    if (utcDay < 1 || utcDay > 5) continue; // only Mon-Fri
    count++;
    weekdaysFilled.add(utcDay);
    dishIdSet.add(String(day.mainDishId));
  }

  return { count, dishIds: Array.from(dishIdSet), weekdaysFilled };
}

// ─── Main trigger ─────────────────────────────────────────────────────────────

/**
 * Main entry point for weekly challenge events.
 * Returns { completed: string[] } — keys of newly completed challenges.
 * Returns null if weekly challenges are not applicable.
 */
export async function triggerWeeklyChallenge(householdId, eventType, contextData = {}) {
  try {
    // CRITICAL GATE: only proceed if onboarding is completed
    const onboarding = await HouseholdOnboarding.findOne({ householdId }).lean();
    if (!onboarding || onboarding.status !== "completed") return null;

    // Record that the user just did something meaningful (non-fatal — fire and forget).
    // All triggerWeeklyChallenge calls come from user-initiated actions.
    recordMeaningfulActivity(householdId).catch(() => {});

    const cycleConfig = await getOrCreateCycleConfig();
    if (cycleConfig.paused) return null;

    const weekStartISO = getCurrentWeekStart();
    const weekStartDate = parseWeekStart(weekStartISO);
    const cycleWeekIndex = getCycleWeekIndex(weekStartDate, cycleConfig.cycleStartDate);

    const challenges = await WeeklyChallengeDef.find({
      active: true,
      cycleWeek: cycleWeekIndex
    }).sort({ cycleOrder: 1 }).lean();

    if (!challenges.length) return null;

    let progress = await getOrCreateProgress(householdId, weekStartDate, cycleWeekIndex);

    const completedKeysBefore = new Set((progress.completedChallenges || []).map((c) => c.challengeKey));
    const newlyCompletedKeys = [];

    // ── Event-specific logic ────────────────────────────────────────────────

    if (eventType === "meal_planned") {
      const { count, dishIds, weekdaysFilled } = await _getWeekPlanStats(
        householdId,
        contextData.weekStart || weekStartISO
      );

      // Update counters and sets atomically
      const setUpdate = { mealsPlannedCount: count };
      await HouseholdWeeklyProgress.updateOne(
        { _id: progress._id },
        { $set: setUpdate }
      );
      // Add all dish IDs from the plan
      if (dishIds.length > 0) {
        await HouseholdWeeklyProgress.updateOne(
          { _id: progress._id },
          { $addToSet: { dishIdsUsedThisWeek: { $each: dishIds.map((id) => new mongoose.Types.ObjectId(id)) } } }
        );
      }

      // Re-fetch updated progress
      progress = await HouseholdWeeklyProgress.findById(progress._id).lean();

      const uniqueDishCount = (progress.dishIdsUsedThisWeek || []).length;
      const allWeekdaysFilled = weekdaysFilled.size >= 5;
      const now = new Date();
      const todayUTCDay = now.getUTCDay(); // 1=Mon, 2=Tue, 3=Wed in [1,2,3] = before Thursday

      // Check all meal_planned challenges
      const mealChallengeChecks = [
        {
          key: "weekly_plan_5_meals",
          done: count >= 5
        },
        {
          key: "weekly_complete_meal_week",
          done: allWeekdaysFilled
        },
        {
          key: "weekly_complete_meal_week_w4",
          done: allWeekdaysFilled
        },
        {
          key: "weekly_use_3_different_dishes",
          done: uniqueDishCount >= 3
        },
        {
          key: "weekly_use_5_different_dishes",
          done: uniqueDishCount >= 5
        },
        {
          key: "weekly_no_repeated_dishes",
          done: count >= 5 && uniqueDishCount === count
        },
        {
          key: "weekly_plan_full_week_before_thursday",
          done: allWeekdaysFilled && [1, 2, 3].includes(todayUTCDay)
        }
      ];

      for (const check of mealChallengeChecks) {
        if (!check.done) continue;
        const def = challenges.find((c) => c.key === check.key);
        if (!def) continue;
        if (completedKeysBefore.has(check.key)) continue;
        await _markChallengeComplete(progress._id, def);
        newlyCompletedKeys.push(check.key);
        completedKeysBefore.add(check.key);
      }

      // Catalog dish detection — check if the dish being planned is from a catalog pack.
      // Uses contextData.dishId (passed by WeekPage.jsx). Falls back to checking ALL
      // dishes in the week plan if the specific dish is already a catalog one.
      if (!completedKeysBefore.has("weekly_use_catalog_dish")) {
        const catalogChallengeDef = challenges.find((c) => c.key === "weekly_use_catalog_dish");
        if (catalogChallengeDef) {
          let isCatalogDish = progress.catalogDishUsed ?? false;
          if (!isCatalogDish && contextData.dishId) {
            const dish = await KitchenDish.findById(contextData.dishId)
              .select("source sourcePackId")
              .lean();
            isCatalogDish = dish?.source === "catalog" && dish?.sourcePackId != null;
          }
          if (isCatalogDish) {
            await HouseholdWeeklyProgress.updateOne(
              { _id: progress._id },
              { $set: { catalogDishUsed: true } }
            );
            progress = await HouseholdWeeklyProgress.findById(progress._id).lean();
            await _markChallengeComplete(progress._id, catalogChallengeDef);
            newlyCompletedKeys.push("weekly_use_catalog_dish");
            completedKeysBefore.add("weekly_use_catalog_dish");
          }
        }
      }
    } else if (eventType === "catalog_dish_used") {
      // Direct trigger path — fired when a catalog dish is explicitly used.
      // Also handled via the meal_planned path above, but kept for forward compatibility.
      await HouseholdWeeklyProgress.updateOne(
        { _id: progress._id },
        { $set: { catalogDishUsed: true } }
      );
      progress = await HouseholdWeeklyProgress.findById(progress._id).lean();

      const def = challenges.find((c) => c.key === "weekly_use_catalog_dish");
      if (def && !completedKeysBefore.has("weekly_use_catalog_dish")) {
        await _markChallengeComplete(progress._id, def);
        newlyCompletedKeys.push("weekly_use_catalog_dish");
        completedKeysBefore.add("weekly_use_catalog_dish");
      }
    } else if (eventType === "item_purchased") {
      if (contextData.itemKey) {
        await HouseholdWeeklyProgress.updateOne(
          { _id: progress._id },
          { $addToSet: { purchasedItemKeys: contextData.itemKey } }
        );
        progress = await HouseholdWeeklyProgress.findById(progress._id).lean();
      }

      const purchasedCount = (progress.purchasedItemKeys || []).length;
      await HouseholdWeeklyProgress.updateOne(
        { _id: progress._id },
        { $set: { itemsPurchasedCount: purchasedCount } }
      );

      for (const key of ["weekly_mark_5_items_purchased", "weekly_mark_5_items_purchased_w3"]) {
        if (purchasedCount < 5) break;
        const def = challenges.find((c) => c.key === key);
        if (!def) continue;
        if (completedKeysBefore.has(key)) continue;
        await _markChallengeComplete(progress._id, def);
        newlyCompletedKeys.push(key);
        completedKeysBefore.add(key);
      }
    } else if (eventType === "shopping_list_completed") {
      await HouseholdWeeklyProgress.updateOne(
        { _id: progress._id },
        { $set: { shoppingListCompleted: true } }
      );
      progress = await HouseholdWeeklyProgress.findById(progress._id).lean();

      for (const key of ["weekly_complete_shopping_list", "weekly_complete_shopping_list_w4"]) {
        const def = challenges.find((c) => c.key === key);
        if (!def) continue;
        if (completedKeysBefore.has(key)) continue;
        await _markChallengeComplete(progress._id, def);
        newlyCompletedKeys.push(key);
        completedKeysBefore.add(key);
      }
    } else if (eventType === "dish_created") {
      await HouseholdWeeklyProgress.updateOne(
        { _id: progress._id },
        { $inc: { dishesCreatedCount: 1 } }
      );
      progress = await HouseholdWeeklyProgress.findById(progress._id).lean();

      const dishCount = progress.dishesCreatedCount || 0;

      for (const { key, threshold } of [
        { key: "weekly_create_new_dish", threshold: 1 },
        { key: "weekly_create_2_dishes", threshold: 2 }
      ]) {
        if (dishCount < threshold) continue;
        const def = challenges.find((c) => c.key === key);
        if (!def) continue;
        if (completedKeysBefore.has(key)) continue;
        await _markChallengeComplete(progress._id, def);
        newlyCompletedKeys.push(key);
        completedKeysBefore.add(key);
      }
    } else if (eventType === "pack_installed") {
      await HouseholdWeeklyProgress.updateOne(
        { _id: progress._id },
        { $inc: { catalogPacksInstalledCount: 1 } }
      );
      progress = await HouseholdWeeklyProgress.findById(progress._id).lean();

      const def = challenges.find((c) => c.key === "weekly_install_catalog_pack");
      if (def && !completedKeysBefore.has("weekly_install_catalog_pack")) {
        await _markChallengeComplete(progress._id, def);
        newlyCompletedKeys.push("weekly_install_catalog_pack");
        completedKeysBefore.add("weekly_install_catalog_pack");
      }
    } else if (eventType === "ingredient_created") {
      await HouseholdWeeklyProgress.updateOne(
        { _id: progress._id },
        { $inc: { ingredientsCreatedCount: 1 } }
      );
      progress = await HouseholdWeeklyProgress.findById(progress._id).lean();

      const ingCount = progress.ingredientsCreatedCount || 0;
      const def = challenges.find((c) => c.key === "weekly_add_2_ingredients");
      if (def && ingCount >= 2 && !completedKeysBefore.has("weekly_add_2_ingredients")) {
        await _markChallengeComplete(progress._id, def);
        newlyCompletedKeys.push("weekly_add_2_ingredients");
        completedKeysBefore.add("weekly_add_2_ingredients");
      }
    } else if (eventType === "manual_item_added") {
      await HouseholdWeeklyProgress.updateOne(
        { _id: progress._id },
        { $set: { manualShoppingItemAdded: true } }
      );
      progress = await HouseholdWeeklyProgress.findById(progress._id).lean();

      const def = challenges.find((c) => c.key === "weekly_add_manual_shopping_item");
      if (def && !completedKeysBefore.has("weekly_add_manual_shopping_item")) {
        await _markChallengeComplete(progress._id, def);
        newlyCompletedKeys.push("weekly_add_manual_shopping_item");
        completedKeysBefore.add("weekly_add_manual_shopping_item");
      }
    } else if (eventType === "app_activity") {
      const date = contextData.date || new Date().toISOString().slice(0, 10);
      await HouseholdWeeklyProgress.updateOne(
        { _id: progress._id },
        { $addToSet: { appActiveDays: date } }
      );
      progress = await HouseholdWeeklyProgress.findById(progress._id).lean();

      const activeDays = (progress.appActiveDays || []).length;
      const def = challenges.find((c) => c.key === "weekly_use_app_3_days");
      if (def && activeDays >= 3 && !completedKeysBefore.has("weekly_use_app_3_days")) {
        await _markChallengeComplete(progress._id, def);
        newlyCompletedKeys.push("weekly_use_app_3_days");
        completedKeysBefore.add("weekly_use_app_3_days");
      }
    }

    // Grant rewards for newly completed challenges
    let betaProUnlocked = false;
    if (newlyCompletedKeys.length > 0) {
      const freshProgress = await HouseholdWeeklyProgress.findById(progress._id).lean();
      for (const key of newlyCompletedKeys) {
        const def = challenges.find((c) => c.key === key);
        if (def && def.rewardBites > 0) {
          await grantWeeklyReward(householdId, key, def.rewardBites, freshProgress);
        }
      }
      // Check bonus after all completions
      const latestProgress = await HouseholdWeeklyProgress.findById(progress._id).lean();
      await checkAndGrantBonus(householdId, latestProgress, challenges, cycleConfig.bonusBites);

      // Try Beta Pro unlock after bonus check (idempotent — safe to call every time).
      const betaProResult = await tryUnlockBetaPro(householdId);
      betaProUnlocked = betaProResult.unlocked;
    }

    return { completed: newlyCompletedKeys, newlyCompleted: newlyCompletedKeys.length > 0, betaProUnlocked };
  } catch (err) {
    console.error("[weekly] triggerWeeklyChallenge error:", err.message);
    return null;
  }
}

/**
 * Internal helper: adds a challenge to completedChallenges with rewardGranted=false.
 */
async function _markChallengeComplete(progressId, def) {
  const entry = {
    challengeId: def._id,
    challengeKey: def.key,
    completedAt: new Date(),
    rewardBites: def.rewardBites,
    rewardGranted: false
  };
  await HouseholdWeeklyProgress.updateOne(
    { _id: progressId },
    { $push: { completedChallenges: entry } }
  );
}

// ─── Get state ────────────────────────────────────────────────────────────────

/**
 * Returns the full weekly challenge state for the frontend.
 * Returns null if onboarding is not completed.
 */
export async function getWeeklyState(householdId) {
  try {
    const onboarding = await HouseholdOnboarding.findOne({ householdId }).lean();
    if (!onboarding || onboarding.status !== "completed") {
      return null;
    }

    const cycleConfig = await getOrCreateCycleConfig();
    const weekStartISO = getCurrentWeekStart();
    const weekStartDate = parseWeekStart(weekStartISO);
    const cycleWeekIndex = getCycleWeekIndex(weekStartDate, cycleConfig.cycleStartDate);

    const challenges = await WeeklyChallengeDef.find({
      active: true,
      cycleWeek: cycleWeekIndex
    }).sort({ cycleOrder: 1 }).lean();

    const progress = await getOrCreateProgress(householdId, weekStartDate, cycleWeekIndex);
    const progressLean = progress.toObject ? progress.toObject() : progress;

    const completedMap = new Map(
      (progressLean.completedChallenges || []).map((c) => [c.challengeKey, c])
    );

    const mainChallenges = challenges.filter((c) => c.triggerType !== "bonus");
    const bonusDef = challenges.find((c) => c.triggerType === "bonus") || null;

    // Only non-bonus challenges are surfaced in the main list.
    const enrichedChallenges = mainChallenges.map((c) => {
      const completion = completedMap.get(c.key) || null;
      return {
        key: c.key,
        title: c.title,
        description: c.description,
        guidance: c.guidance,
        rewardBites: c.rewardBites,
        triggerType: c.triggerType,
        triggerCount: c.triggerCount,
        isBonus: false,
        completed: !!completion,
        completedAt: completion?.completedAt ?? null,
        rewardGranted: completion?.rewardGranted ?? false
      };
    });

    const completedCount = mainChallenges.filter((c) => completedMap.has(c.key)).length;
    const allMainCompleted = completedCount >= mainChallenges.length && mainChallenges.length > 0;
    const totalBitesAvailable = challenges.reduce((s, c) => s + (c.rewardBites || 0), 0);
    const totalBitesEarned = (progressLean.completedChallenges || [])
      .filter((c) => c.rewardGranted)
      .reduce((s, c) => s + (c.rewardBites || 0), 0);

    const totalMainChallengesCount = mainChallenges.length;
    const progressPercent = totalMainChallengesCount > 0
      ? Math.round((completedCount / totalMainChallengesCount) * 100)
      : 0;

    // `bonus` is the field name the frontend component expects.
    const bonus = bonusDef
      ? {
        key: bonusDef.key,
        title: bonusDef.title,
        rewardBites: bonusDef.rewardBites,
        completed: completedMap.has(bonusDef.key),
        rewardGranted: completedMap.get(bonusDef.key)?.rewardGranted ?? false,
        available: allMainCompleted  // unlocked only when all main challenges done
      }
      : null;

    return {
      available: true,
      cycleWeekIndex,
      weekStart: weekStartISO,
      challenges: enrichedChallenges,
      completedCount,
      totalCount: totalMainChallengesCount,
      totalMainChallenges: totalMainChallengesCount,
      progressPercent,
      bonus,
      bonusChallenge: bonus,   // keep alias for any callers that use the old name
      bonusGranted: progressLean.bonusGranted ?? false,
      totalBitesAvailable,
      totalBitesEarned,
      paused: cycleConfig.paused ?? false
    };
  } catch (err) {
    console.error("[weekly] getWeeklyState error:", err.message);
    return null;
  }
}

// ─── Admin functions ──────────────────────────────────────────────────────────

export async function adminGetAllChallengeDefs() {
  return WeeklyChallengeDef.find({}).sort({ cycleWeek: 1, cycleOrder: 1 }).lean();
}

export async function adminCreateChallengeDef(data) {
  const def = await WeeklyChallengeDef.create(data);
  return def;
}

export async function adminUpdateChallengeDef(id, data) {
  const allowed = [
    "title", "description", "guidance", "rewardBites",
    "triggerType", "triggerCount", "cycleWeek", "cycleOrder",
    "active", "planCompatibility"
  ];
  const update = {};
  for (const field of allowed) {
    if (data[field] !== undefined) update[field] = data[field];
  }
  return WeeklyChallengeDef.findByIdAndUpdate(id, { $set: update }, { new: true });
}

export async function adminDeleteChallengeDef(id) {
  return WeeklyChallengeDef.findByIdAndDelete(id);
}

export async function adminGetCycleConfig() {
  return getOrCreateCycleConfig();
}

export async function adminUpdateCycleConfig(data) {
  const allowed = ["cycleStartDate", "paused", "bonusBites"];
  const update = {};
  for (const field of allowed) {
    if (data[field] !== undefined) update[field] = data[field];
  }
  return WeeklyCycleConfig.findOneAndUpdate(
    { key: "default" },
    { $set: update },
    { upsert: true, new: true }
  );
}

export async function adminGetHouseholdProgress(householdId) {
  const weekStartISO = getCurrentWeekStart();
  const weekStartDate = parseWeekStart(weekStartISO);
  return HouseholdWeeklyProgress.findOne({ householdId, weekStart: weekStartDate }).lean();
}

export async function adminResetHouseholdProgress(householdId) {
  const weekStartISO = getCurrentWeekStart();
  const weekStartDate = parseWeekStart(weekStartISO);
  return HouseholdWeeklyProgress.deleteOne({ householdId, weekStart: weekStartDate });
}

export async function adminForceCompleteChallenge(householdId, challengeKey) {
  const onboarding = await HouseholdOnboarding.findOne({ householdId }).lean();
  if (!onboarding || onboarding.status !== "completed") {
    throw new Error("Household onboarding not completed.");
  }

  const cycleConfig = await getOrCreateCycleConfig();
  const weekStartISO = getCurrentWeekStart();
  const weekStartDate = parseWeekStart(weekStartISO);
  const cycleWeekIndex = getCycleWeekIndex(weekStartDate, cycleConfig.cycleStartDate);

  const def = await WeeklyChallengeDef.findOne({ key: challengeKey }).lean();
  if (!def) throw new Error(`Challenge def not found: ${challengeKey}`);

  const progress = await getOrCreateProgress(householdId, weekStartDate, cycleWeekIndex);

  const alreadyDone = (progress.completedChallenges || []).some(
    (c) => c.challengeKey === challengeKey
  );
  if (!alreadyDone) {
    await _markChallengeComplete(progress._id, def);
  }

  const freshProgress = await HouseholdWeeklyProgress.findById(progress._id).lean();
  await grantWeeklyReward(householdId, challengeKey, def.rewardBites, freshProgress);

  const challenges = await WeeklyChallengeDef.find({
    active: true,
    cycleWeek: cycleWeekIndex
  }).lean();
  const latestProgress = await HouseholdWeeklyProgress.findById(progress._id).lean();
  await checkAndGrantBonus(householdId, latestProgress, challenges, cycleConfig.bonusBites);

  return { ok: true, challengeKey };
}
