import mongoose from "mongoose";
import { HouseholdOnboarding } from "./models/HouseholdOnboarding.js";
import { WeeklyChallengeDef } from "./models/WeeklyChallengeDef.js";
import { WeeklyCycleConfig } from "./models/WeeklyCycleConfig.js";
import { HouseholdWeeklyProgress } from "./models/HouseholdWeeklyProgress.js";
import { Household } from "./models/Household.js";
import { KitchenWeekPlan } from "./models/KitchenWeekPlan.js";
import { KitchenDish } from "./models/KitchenDish.js";
import { BitesTransaction } from "./models/BitesTransaction.js";
import { recordMeaningfulActivity, tryUnlockBetaPro, checkAndGrantBetaPro, inspectBetaProEligibility } from "./betaProService.js";
import { isProLikeHousehold } from "./subscriptionService.js";

// ─── Curriculum resolution ────────────────────────────────────────────────────

/**
 * Returns which weekly curriculum a household should receive:
 *   "basic" — Basic / Free users → Basic 4-week curriculum
 *   "pro"   — Pro / Premium / BetaPro users → Pro 4-week curriculum
 *
 * Accepts either a full Household document or just the subscriptionPlan string.
 */
export function getHouseholdCurriculum(householdOrPlan) {
  return isProLikeHousehold(householdOrPlan) ? "pro" : "basic";
}

// ─── Seed data ────────────────────────────────────────────────────────────────

/**
 * BASIC CURRICULUM — 4-week rotating cycle for Basic / Free users.
 * Goal: learn the core Lunchfy loop step by step.
 */
const BASIC_CURRICULUM_DEFS = [
  // ── WEEK 1 — "Empieza a organizarte" ─────────────────────────────────────
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
    curriculum: "basic",
    planCompatibility: ["all"]
  },
  {
    // RETIRED — too similar to weekly_plan_5_meals.
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
    curriculum: "basic",
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
    curriculum: "basic",
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
    curriculum: "basic",
    planCompatibility: ["all"]
  },
  {
    key: "weekly_create_new_dish",
    title: "Crea un plato nuevo",
    description: "Ve a la sección Cocina y añade un plato propio con sus productos.",
    guidance: "Ve a la sección Cocina y añade un plato propio con sus productos.",
    rewardBites: 5,
    triggerType: "dish_created",
    triggerCount: 1,
    cycleWeek: 1,
    cycleOrder: 4,
    curriculum: "basic",
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
    curriculum: "basic",
    planCompatibility: ["all"]
  },

  // ── WEEK 2 — "Tu hogar en una sola lista" ────────────────────────────────
  // NOTE: "shopping_list_completed" fires when ALL items in the list are marked as purchased.
  // Basic-compatible: no purchase finalization, no store selection, no expense tracking.
  {
    key: "weekly_complete_shopping_list",
    title: "Marca toda tu lista",
    description: "Marca todos los productos de tu lista como comprados.",
    guidance: "Ve a la lista de la compra y marca todos los productos como comprados conforme los vayas metiendo en el carrito.",
    rewardBites: 10,
    triggerType: "shopping_list_completed",
    triggerCount: 1,
    cycleWeek: 2,
    cycleOrder: 1,
    curriculum: "basic",
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
    curriculum: "basic",
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
    curriculum: "basic",
    planCompatibility: ["all"]
  },
  {
    // Moved from Week 1: requires a pack to be installed first, so belongs after weekly_install_catalog_pack
    key: "weekly_use_catalog_dish",
    title: "Usa un plato del catálogo en tu semana",
    description: "Instala un pack del catálogo y añade uno de sus platos a tu planificación semanal.",
    guidance: "Los packs del catálogo incluyen platos listos para usar. Instala uno desde la sección Catálogo y asigna cualquiera de sus platos a un día de la semana.",
    rewardBites: 5,
    triggerType: "catalog_dish_used",
    triggerCount: 1,
    cycleWeek: 2,
    cycleOrder: 4,
    curriculum: "basic",
    planCompatibility: ["all"]
  },
  {
    key: "weekly_add_2_ingredients",
    title: "Añade 2 productos nuevos",
    description: "",
    guidance: "",
    rewardBites: 10,
    triggerType: "ingredient_created",
    triggerCount: 2,
    cycleWeek: 2,
    cycleOrder: 5,
    curriculum: "basic",
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
    curriculum: "basic",
    planCompatibility: ["all"]
  },

  // ── WEEK 3 — "Semana organizada" ─────────────────────────────────────────
  {
    key: "weekly_invite_diner",
    title: "Invita a un comensal",
    description: "Comparte tu hogar con alguien más. Usa el código de invitación para que un familiar o compañero de piso se una a tu Lunchfy.",
    guidance: "Ve a Configuración → Hogar y copia el código de invitación. Compártelo con quien quieras que forme parte de tu hogar.",
    rewardBites: 10,
    triggerType: "diner_invited",
    triggerCount: 1,
    cycleWeek: 3,
    cycleOrder: 5,
    curriculum: "basic",
    planCompatibility: ["all"]
  },
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
    curriculum: "basic",
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
    curriculum: "basic",
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
    curriculum: "basic",
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
    curriculum: "basic",
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
    curriculum: "basic",
    planCompatibility: ["all"]
  },

  // ── WEEK 4 — "Chef de confianza" ─────────────────────────────────────────
  {
    key: "weekly_assign_diner_as_cook",
    title: "Asigna a un comensal como cocinero",
    description: "Delega la cocina: asigna a otro miembro del hogar como cocinero de algún día de la semana.",
    guidance: "En la vista semanal, pulsa el avatar de cocinero de cualquier día y selecciona a otro miembro del hogar.",
    rewardBites: 5,
    triggerType: "diner_assigned_as_cook",
    triggerCount: 1,
    cycleWeek: 4,
    cycleOrder: 5,
    curriculum: "basic",
    planCompatibility: ["all"]
  },
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
    curriculum: "basic",
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
    curriculum: "basic",
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
    curriculum: "basic",
    planCompatibility: ["all"]
  },
  {
    key: "weekly_complete_shopping_list_w4",
    title: "Marca toda tu lista",
    description: "Marca todos los productos de tu lista como comprados.",
    guidance: "Ve a la lista de la compra y marca todos los productos como comprados conforme los vayas metiendo en el carrito.",
    rewardBites: 5,
    triggerType: "shopping_list_completed",
    triggerCount: 1,
    cycleWeek: 4,
    cycleOrder: 4,
    curriculum: "basic",
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
    curriculum: "basic",
    planCompatibility: ["all"]
  }
];

/**
 * PRO CURRICULUM — 4-week rotating cycle for Pro / Premium / BetaPro users.
 *
 * Philosophy:
 * - Keeps some universal habits (marking purchased, creating dishes, catalog usage).
 * - Replaces simpler Basic challenges with advanced Pro-oriented equivalents.
 * - Progressively teaches: randomization → Básicos → dinners → purchase tracking → budget.
 *
 * All keys are prefixed with "pro_" to avoid collision with Basic curriculum.
 */
const PRO_CURRICULUM_DEFS = [
  // ── WEEK 1 — "Descubre las funciones avanzadas" ───────────────────────────
  // Theme: First contact with the three key Pro features
  {
    key: "pro_w1_randomize_week",
    title: "Deja que Lunchfy planifique por ti",
    description: "Usa la randomización semanal para completar tu planificación automáticamente.",
    guidance: "Abre la vista semanal y pulsa el botón Randomizar semana para que Lunchfy rellene los días pendientes.",
    rewardBites: 10,
    triggerType: "week_randomized",
    triggerCount: 1,
    cycleWeek: 1,
    cycleOrder: 1,
    curriculum: "pro",
    planCompatibility: ["pro", "premium"]
  },
  {
    key: "pro_w1_mark_items_purchased",
    title: "Marca 5 ingredientes como comprados",
    description: "Ve a la lista de la compra y marca ingredientes conforme los vayas comprando.",
    guidance: "Ve a la lista de la compra y marca ingredientes conforme los vayas comprando.",
    rewardBites: 5,
    triggerType: "item_purchased",
    triggerCount: 5,
    cycleWeek: 1,
    cycleOrder: 2,
    curriculum: "pro",
    planCompatibility: ["pro", "premium"]
  },
  {
    key: "pro_w1_configure_basics",
    title: "Configura tus básicos",
    description: "Guarda productos recurrentes como leche, huevos o papel de cocina para reutilizarlos cada semana.",
    guidance: "En la lista de la compra, abre el menú de Básicos y añade un artículo que compras habitualmente.",
    rewardBites: 10,
    triggerType: "basic_created",
    triggerCount: 1,
    cycleWeek: 1,
    cycleOrder: 3,
    curriculum: "pro",
    planCompatibility: ["pro", "premium"]
  },
  {
    key: "pro_w1_create_dish",
    title: "Crea un plato nuevo",
    description: "Ve a la sección Cocina y añade un plato propio con sus productos.",
    guidance: "Ve a la sección Cocina y añade un plato propio con sus productos.",
    rewardBites: 5,
    triggerType: "dish_created",
    triggerCount: 1,
    cycleWeek: 1,
    cycleOrder: 4,
    curriculum: "pro",
    planCompatibility: ["pro", "premium"]
  },
  {
    key: "pro_w1_use_catalog",
    title: "Usa un plato del catálogo",
    description: "Instala un pack del catálogo y añade uno de sus platos a tu planificación.",
    guidance: "Los packs del catálogo incluyen platos listos para usar. Instala uno desde Catálogo y asigna cualquiera de sus platos a un día de la semana.",
    rewardBites: 5,
    triggerType: "catalog_dish_used",
    triggerCount: 1,
    cycleWeek: 1,
    cycleOrder: 5,
    curriculum: "pro",
    planCompatibility: ["pro", "premium"]
  },
  {
    key: "pro_w1_bonus",
    title: "Completa todos los retos de la semana",
    description: "",
    guidance: "",
    rewardBites: 5,
    triggerType: "bonus",
    triggerCount: 1,
    cycleWeek: 1,
    cycleOrder: 99,
    curriculum: "pro",
    planCompatibility: ["pro", "premium"]
  },

  // ── WEEK 2 — "Automatización semanal" ────────────────────────────────────
  // Theme: Basics in action + randomization as a habit + shopping loop
  {
    key: "pro_w2_randomize_week",
    title: "Randomiza tu planificación semanal",
    description: "Usa la randomización para completar tu planificación de la semana automáticamente.",
    guidance: "Abre la vista semanal y pulsa el botón Randomizar semana para que Lunchfy rellene los días pendientes.",
    rewardBites: 10,
    triggerType: "week_randomized",
    triggerCount: 1,
    cycleWeek: 2,
    cycleOrder: 1,
    curriculum: "pro",
    planCompatibility: ["pro", "premium"]
  },
  {
    key: "pro_w2_use_basics",
    title: "Usa tus básicos esta semana",
    description: "Añade algunos de tus productos recurrentes directamente a tu lista de la compra.",
    guidance: "En la lista de la compra, abre el menú de Básicos y añade los artículos que necesites esta semana.",
    rewardBites: 10,
    triggerType: "basic_added_to_list",
    triggerCount: 1,
    cycleWeek: 2,
    cycleOrder: 2,
    curriculum: "pro",
    planCompatibility: ["pro", "premium"]
  },
  {
    key: "pro_w2_complete_shopping_list",
    title: "Marca toda tu lista",
    description: "Marca todos los productos de tu lista como comprados.",
    guidance: "Ve a la lista de la compra y marca todos los productos como comprados conforme los vayas metiendo en el carrito.",
    rewardBites: 10,
    triggerType: "shopping_list_completed",
    triggerCount: 1,
    cycleWeek: 2,
    cycleOrder: 3,
    curriculum: "pro",
    planCompatibility: ["pro", "premium"]
  },
  {
    key: "pro_w2_create_dish",
    title: "Crea un plato nuevo",
    description: "Ve a la sección Cocina y añade un plato propio con sus productos.",
    guidance: "Ve a la sección Cocina y añade un plato propio con sus productos.",
    rewardBites: 5,
    triggerType: "dish_created",
    triggerCount: 1,
    cycleWeek: 2,
    cycleOrder: 4,
    curriculum: "pro",
    planCompatibility: ["pro", "premium"]
  },
  {
    key: "pro_w2_bonus",
    title: "Completa todos los retos de la semana",
    description: "",
    guidance: "",
    rewardBites: 5,
    triggerType: "bonus",
    triggerCount: 1,
    cycleWeek: 2,
    cycleOrder: 99,
    curriculum: "pro",
    planCompatibility: ["pro", "premium"]
  },

  // ── WEEK 3 — "Cocina completa" ────────────────────────────────────────────
  // Theme: Dinners + real purchase tracking
  {
    key: "pro_w3_plan_3_dinners",
    title: "Organiza también tus cenas",
    description: "Planifica al menos 3 cenas esta semana.",
    guidance: "Abre la vista semanal y asigna un plato a 3 cenas. Si no ves las cenas, actívalas desde Configuración → Hogar.",
    rewardBites: 10,
    triggerType: "dinner_planned",
    triggerCount: 3,
    cycleWeek: 3,
    cycleOrder: 1,
    curriculum: "pro",
    planCompatibility: ["pro", "premium"]
  },
  {
    key: "pro_w3_finalize_purchase",
    title: "Registra una compra real",
    description: "Finaliza una compra indicando el supermercado y cuánto has gastado.",
    guidance: "Cuando termines de hacer la compra, pulsa 'Finalizar compra' en la lista, selecciona el supermercado e introduce el importe total gastado.",
    rewardBites: 10,
    triggerType: "purchase_finalized",
    triggerCount: 1,
    cycleWeek: 3,
    cycleOrder: 2,
    curriculum: "pro",
    planCompatibility: ["pro", "premium"]
  },
  {
    key: "pro_w3_mark_items_purchased",
    title: "Marca 5 ingredientes como comprados",
    description: "Ve a la lista de la compra y marca ingredientes conforme los vayas comprando.",
    guidance: "Ve a la lista de la compra y marca ingredientes conforme los vayas comprando.",
    rewardBites: 5,
    triggerType: "item_purchased",
    triggerCount: 5,
    cycleWeek: 3,
    cycleOrder: 3,
    curriculum: "pro",
    planCompatibility: ["pro", "premium"]
  },
  {
    key: "pro_w3_use_app_3_days",
    title: "Usa Lunchfy 3 días distintos",
    description: "Abre Lunchfy al menos 3 días distintos esta semana.",
    guidance: "Abre Lunchfy al menos 3 días distintos para planificar, gestionar tu lista o revisar tus platos.",
    rewardBites: 5,
    triggerType: "app_activity",
    triggerCount: 3,
    cycleWeek: 3,
    cycleOrder: 4,
    curriculum: "pro",
    planCompatibility: ["pro", "premium"]
  },
  {
    key: "pro_w3_bonus",
    title: "Completa todos los retos de la semana",
    description: "",
    guidance: "",
    rewardBites: 5,
    triggerType: "bonus",
    triggerCount: 1,
    cycleWeek: 3,
    cycleOrder: 99,
    curriculum: "pro",
    planCompatibility: ["pro", "premium"]
  },

  // ── WEEK 4 — "Control avanzado" ───────────────────────────────────────────
  // Theme: Consolidation + budget awareness
  {
    key: "pro_w4_randomize_week",
    title: "Randomiza tu planificación semanal",
    description: "Usa la randomización para completar tu planificación de la semana automáticamente.",
    guidance: "Abre la vista semanal y pulsa el botón Randomizar semana para que Lunchfy rellene los días pendientes.",
    rewardBites: 10,
    triggerType: "week_randomized",
    triggerCount: 1,
    cycleWeek: 4,
    cycleOrder: 1,
    curriculum: "pro",
    planCompatibility: ["pro", "premium"]
  },
  {
    key: "pro_w4_plan_3_dinners",
    title: "Planifica 3 cenas",
    description: "Planifica al menos 3 cenas esta semana.",
    guidance: "Abre la vista semanal y asigna un plato a 3 cenas.",
    rewardBites: 10,
    triggerType: "dinner_planned",
    triggerCount: 3,
    cycleWeek: 4,
    cycleOrder: 2,
    curriculum: "pro",
    planCompatibility: ["pro", "premium"]
  },
  {
    key: "pro_w4_finalize_purchase",
    title: "Registra una compra real",
    description: "Finaliza una compra indicando el supermercado y cuánto has gastado.",
    guidance: "Cuando termines de hacer la compra, pulsa 'Finalizar compra', selecciona el supermercado e introduce el importe total.",
    rewardBites: 10,
    triggerType: "purchase_finalized",
    triggerCount: 1,
    cycleWeek: 4,
    cycleOrder: 3,
    curriculum: "pro",
    planCompatibility: ["pro", "premium"]
  },
  {
    key: "pro_w4_configure_budget",
    title: "Empieza a controlar tu gasto",
    description: "Configura tu presupuesto mensual para llevar un seguimiento de lo que gastas en la compra.",
    guidance: "Ve a Configuración → Hogar → Presupuesto e introduce tu gasto mensual habitual en alimentación.",
    rewardBites: 10,
    triggerType: "budget_configured",
    triggerCount: 1,
    cycleWeek: 4,
    cycleOrder: 4,
    curriculum: "pro",
    planCompatibility: ["pro", "premium"]
  },
  {
    key: "pro_w4_bonus",
    title: "Completa todos los retos de la semana",
    description: "",
    guidance: "",
    rewardBites: 5,
    triggerType: "bonus",
    triggerCount: 1,
    cycleWeek: 4,
    cycleOrder: 99,
    curriculum: "pro",
    planCompatibility: ["pro", "premium"]
  }
];

// Combined seed list
const CYCLE_CHALLENGE_DEFS = [...BASIC_CURRICULUM_DEFS, ...PRO_CURRICULUM_DEFS];

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
 * Seeds all challenge definitions (both curricula). Safe to call on every boot.
 * Structural fields always sync; rewardBites only set on first insert.
 */
export async function seedWeeklyChallengeDefs() {
  for (const def of CYCLE_CHALLENGE_DEFS) {
    const {
      key, title, triggerType, triggerCount, cycleWeek, cycleOrder,
      planCompatibility, curriculum, active, guidance, description,
      ...insertOnly
    } = def;
    await WeeklyChallengeDef.updateOne(
      { key },
      {
        $set: {
          title,
          triggerType, triggerCount, cycleWeek, cycleOrder,
          curriculum: curriculum || "basic",
          planCompatibility: planCompatibility || ["all"],
          active: active ?? true,
          ...(guidance !== undefined ? { guidance } : {}),
          ...(description !== undefined ? { description } : {})
        },
        // rewardBites only set on first insert (preserve economy balance decisions)
        $setOnInsert: { key, ...insertOnly }
      },
      { upsert: true }
    );
  }
  console.log("[weekly] Challenge defs seeded (basic + pro curricula).");
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
        // Pro-specific fields
        weekRandomized: false,
        basicCreated: false,
        basicAddedToList: false,
        dinnersPlannedCount: 0,
        purchaseFinalizedWithStore: false,
        budgetConfigured: false,
        // Comensales fields
        dinerInvited: false,
        dinerAssignedAsCook: false,
        // Sets
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
 * Fetches the week plan and returns stats for lunch (Mon-Fri) slots.
 */
async function _getWeekPlanStats(householdId, weekStartISO) {
  const weekStartDate = parseWeekStart(weekStartISO);
  const plan = await KitchenWeekPlan.findOne({ householdId, weekStart: weekStartDate }).lean();
  if (!plan || !plan.days) return { count: 0, dishIds: [], weekdaysFilled: new Set() };

  const weekdaysFilled = new Set();
  const dishIdSet = new Set();
  let count = 0;

  for (const day of plan.days) {
    if (day.mealType && day.mealType !== "lunch") continue; // lunch only
    if (!day.mainDishId) continue;
    const d = new Date(day.date);
    const utcDay = d.getUTCDay();
    if (utcDay < 1 || utcDay > 5) continue;
    count++;
    weekdaysFilled.add(utcDay);
    dishIdSet.add(String(day.mainDishId));
  }

  return { count, dishIds: Array.from(dishIdSet), weekdaysFilled };
}

/**
 * Returns the count of filled dinner slots (Mon-Fri) in the current week plan.
 * Used for the Pro dinner challenges. Does NOT auto-complete — only counts explicit assignments.
 */
async function _getDinnerPlanStats(householdId, weekStartISO) {
  const weekStartDate = parseWeekStart(weekStartISO);
  const plan = await KitchenWeekPlan.findOne({ householdId, weekStart: weekStartDate }).lean();
  if (!plan || !plan.days) return { count: 0 };

  let count = 0;
  for (const day of plan.days) {
    if (day.mealType !== "dinner") continue;
    if (!day.mainDishId) continue;
    const d = new Date(day.date);
    const utcDay = d.getUTCDay();
    if (utcDay < 1 || utcDay > 5) continue;
    count++;
  }

  return { count };
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

    // Record meaningful activity (non-fatal — fire and forget).
    recordMeaningfulActivity(householdId).catch(() => {});

    const cycleConfig = await getOrCreateCycleConfig();
    if (cycleConfig.paused) return null;

    const currentWeekStartISO = getCurrentWeekStart();
    const randomizedWeekStartISO = contextData.randomizedWeekStart || contextData.weekStart || currentWeekStartISO;
    if (eventType === "week_randomized") {
      const randomizedWeekStartDate = parseWeekStart(randomizedWeekStartISO);
      const currentWeekStartDate = parseWeekStart(currentWeekStartISO);
      if (randomizedWeekStartDate.getTime() < currentWeekStartDate.getTime()) {
        return { completed: [], newlyCompleted: false, ignored: "past_week_randomization" };
      }
    }

    const weekStartISO = eventType === "week_randomized"
      ? currentWeekStartISO
      : (contextData.weekStart || currentWeekStartISO);
    const weekStartDate = parseWeekStart(weekStartISO);

    // Resolve curriculum and per-household cycle start
    const household = await Household.findById(householdId)
      .select("subscriptionPlan planSource betaPro weeklyChallengeCycleStartedAt").lean();
    const curriculum = getHouseholdCurriculum(household);

    // Per-household cycle start: initialize on first weekly challenge interaction.
    // Falls back to global cycleConfig.cycleStartDate for households that pre-date this field.
    let householdCycleStart = household?.weeklyChallengeCycleStartedAt ?? null;
    if (!householdCycleStart) {
      householdCycleStart = weekStartDate; // anchor to the planning week of first use
      await Household.updateOne(
        { _id: householdId, weeklyChallengeCycleStartedAt: null },
        { $set: { weeklyChallengeCycleStartedAt: weekStartDate } }
      );
    }

    const cycleWeekIndex = getCycleWeekIndex(weekStartDate, householdCycleStart);

    // Load only challenges for this household's curriculum
    const challenges = await WeeklyChallengeDef.find({
      active: true,
      cycleWeek: cycleWeekIndex,
      curriculum
    }).sort({ cycleOrder: 1 }).lean();

    if (!challenges.length) return null;

    let progress = await getOrCreateProgress(householdId, weekStartDate, cycleWeekIndex);

    const completedKeysBefore = new Set((progress.completedChallenges || []).map((c) => c.challengeKey));
    const newlyCompletedKeys = [];

    // ── Event-specific logic ────────────────────────────────────────────────

    if (eventType === "meal_planned") {
      const { count, dishIds, weekdaysFilled } = await _getWeekPlanStats(
        householdId,
        weekStartISO  // already resolved from contextData.weekStart at top of function
      );

      const setUpdate = { mealsPlannedCount: count };
      await HouseholdWeeklyProgress.updateOne({ _id: progress._id }, { $set: setUpdate });
      if (dishIds.length > 0) {
        await HouseholdWeeklyProgress.updateOne(
          { _id: progress._id },
          { $addToSet: { dishIdsUsedThisWeek: { $each: dishIds.map((id) => new mongoose.Types.ObjectId(id)) } } }
        );
      }

      progress = await HouseholdWeeklyProgress.findById(progress._id).lean();

      const uniqueDishCount = (progress.dishIdsUsedThisWeek || []).length;
      const allWeekdaysFilled = weekdaysFilled.size >= 5;
      const now = new Date();
      const todayUTCDay = now.getUTCDay();

      const mealChallengeChecks = [
        { key: "weekly_plan_5_meals", done: count >= 5 },
        { key: "weekly_complete_meal_week", done: allWeekdaysFilled },
        { key: "weekly_complete_meal_week_w4", done: allWeekdaysFilled },
        { key: "weekly_use_3_different_dishes", done: uniqueDishCount >= 3 },
        { key: "weekly_use_5_different_dishes", done: uniqueDishCount >= 5 },
        { key: "weekly_no_repeated_dishes", done: count >= 5 && uniqueDishCount === count },
        { key: "weekly_plan_full_week_before_thursday", done: allWeekdaysFilled && [1, 2, 3].includes(todayUTCDay) }
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

      // Catalog dish detection
      if (!completedKeysBefore.has("weekly_use_catalog_dish")) {
        const catalogChallengeDef = challenges.find((c) => c.key === "weekly_use_catalog_dish");
        if (catalogChallengeDef) {
          let isCatalogDish = progress.catalogDishUsed ?? false;
          if (!isCatalogDish && contextData.dishId) {
            const dish = await KitchenDish.findById(contextData.dishId)
              .select("source sourcePackId").lean();
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

      // Pro: catalog_dish_used via meal_planned
      if (!completedKeysBefore.has("pro_w1_use_catalog")) {
        const catalogChallengeDef = challenges.find((c) => c.key === "pro_w1_use_catalog");
        if (catalogChallengeDef) {
          let isCatalogDish = progress.catalogDishUsed ?? false;
          if (!isCatalogDish && contextData.dishId) {
            const dish = await KitchenDish.findById(contextData.dishId)
              .select("source sourcePackId").lean();
            isCatalogDish = dish?.source === "catalog" && dish?.sourcePackId != null;
          }
          if (isCatalogDish) {
            await HouseholdWeeklyProgress.updateOne(
              { _id: progress._id },
              { $set: { catalogDishUsed: true } }
            );
            progress = await HouseholdWeeklyProgress.findById(progress._id).lean();
            await _markChallengeComplete(progress._id, catalogChallengeDef);
            newlyCompletedKeys.push("pro_w1_use_catalog");
            completedKeysBefore.add("pro_w1_use_catalog");
          }
        }
      }

      // Cross-week fallback: meals planned for a future week may satisfy challenges
      // for the CURRENT calendar week.  This fixes the case where a user plans
      // 5 meals next week and "Planifica 5 comidas" doesn't complete because the
      // triggered cycleWeekIndex ≠ the current week's cycleWeekIndex.
      // Guard: only future weeks — past-week edits should not retroactively
      // complete current-week challenges.
      if (weekStartISO !== currentWeekStartISO
          && weekStartDate.getTime() > parseWeekStart(currentWeekStartISO).getTime()) {
        const curWeekDate = parseWeekStart(currentWeekStartISO);
        const curCycleWeekIdx = getCycleWeekIndex(curWeekDate, householdCycleStart);

        // Only run when the cycle week differs — if they happen to map to the same
        // cycleWeekIndex the main block already handled everything.
        if (curCycleWeekIdx !== cycleWeekIndex) {
          const curWeekMealChallenges = await WeeklyChallengeDef.find({
            active: true,
            cycleWeek: curCycleWeekIdx,
            curriculum,
            triggerType: "meal_planned"
          }).sort({ cycleOrder: 1 }).lean();

          if (curWeekMealChallenges.length) {
            const curProgressDoc = await getOrCreateProgress(householdId, curWeekDate, curCycleWeekIdx);
            const curCompletedBefore = new Set(
              (curProgressDoc.completedChallenges || []).map((c) => c.challengeKey)
            );

            // Use triggered week's stats to evaluate current week's meal challenges.
            const crossChecks = [
              { key: "weekly_plan_5_meals", done: count >= 5 },
              { key: "weekly_complete_meal_week", done: allWeekdaysFilled },
              { key: "weekly_complete_meal_week_w4", done: allWeekdaysFilled },
              { key: "weekly_use_3_different_dishes", done: uniqueDishCount >= 3 },
              { key: "weekly_use_5_different_dishes", done: uniqueDishCount >= 5 },
              { key: "weekly_no_repeated_dishes", done: count >= 5 && uniqueDishCount === count },
              { key: "weekly_plan_full_week_before_thursday", done: allWeekdaysFilled && [1, 2, 3].includes(todayUTCDay) }
            ];

            let crossWeekCompleted = false;
            for (const check of crossChecks) {
              if (!check.done || curCompletedBefore.has(check.key)) continue;
              const def = curWeekMealChallenges.find((c) => c.key === check.key);
              if (!def) continue;

              await _markChallengeComplete(curProgressDoc._id, def);
              curCompletedBefore.add(check.key);

              // Grant reward directly against the current week's progress doc.
              const freshCurProgress = await HouseholdWeeklyProgress.findById(curProgressDoc._id).lean();
              await grantWeeklyReward(householdId, def.key, def.rewardBites, freshCurProgress);

              newlyCompletedKeys.push(check.key);
              completedKeysBefore.add(check.key);
              crossWeekCompleted = true;
            }

            if (crossWeekCompleted) {
              // Check bonus for the current week in case all main challenges are now done.
              const allCurChallenges = await WeeklyChallengeDef.find({
                active: true, cycleWeek: curCycleWeekIdx, curriculum
              }).lean();
              const latestCurProgress = await HouseholdWeeklyProgress.findById(curProgressDoc._id).lean();
              await checkAndGrantBonus(householdId, latestCurProgress, allCurChallenges, cycleConfig.bonusBites);
            }
          }
        }
      }

    } else if (eventType === "catalog_dish_used") {
      await HouseholdWeeklyProgress.updateOne(
        { _id: progress._id },
        { $set: { catalogDishUsed: true } }
      );
      progress = await HouseholdWeeklyProgress.findById(progress._id).lean();

      for (const key of ["weekly_use_catalog_dish", "pro_w1_use_catalog"]) {
        const def = challenges.find((c) => c.key === key);
        if (def && !completedKeysBefore.has(key)) {
          await _markChallengeComplete(progress._id, def);
          newlyCompletedKeys.push(key);
          completedKeysBefore.add(key);
        }
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

      const purchasedKeys = [
        "weekly_mark_5_items_purchased", "weekly_mark_5_items_purchased_w3",
        "pro_w1_mark_items_purchased", "pro_w3_mark_items_purchased"
      ];
      for (const key of purchasedKeys) {
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

      for (const key of [
        "weekly_complete_shopping_list", "weekly_complete_shopping_list_w4",
        "pro_w2_complete_shopping_list"
      ]) {
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
        { key: "weekly_create_2_dishes", threshold: 2 },
        { key: "pro_w1_create_dish", threshold: 1 },
        { key: "pro_w2_create_dish", threshold: 1 }
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
      for (const key of ["weekly_use_app_3_days", "pro_w3_use_app_3_days"]) {
        const def = challenges.find((c) => c.key === key);
        if (def && activeDays >= 3 && !completedKeysBefore.has(key)) {
          await _markChallengeComplete(progress._id, def);
          newlyCompletedKeys.push(key);
          completedKeysBefore.add(key);
        }
      }

    // ── Pro-specific event handlers ─────────────────────────────────────────

    } else if (eventType === "week_randomized") {
      // Pro challenge: full-week randomization used
      await HouseholdWeeklyProgress.updateOne(
        { _id: progress._id },
        { $set: { weekRandomized: true } }
      );
      progress = await HouseholdWeeklyProgress.findById(progress._id).lean();

      for (const key of ["pro_w1_randomize_week", "pro_w2_randomize_week", "pro_w4_randomize_week"]) {
        const def = challenges.find((c) => c.key === key);
        if (def && !completedKeysBefore.has(key)) {
          await _markChallengeComplete(progress._id, def);
          newlyCompletedKeys.push(key);
          completedKeysBefore.add(key);
        }
      }

    } else if (eventType === "dinner_planned") {
      // Pro challenge: count actual filled dinner slots — reads from the week plan
      // so it stays consistent even on repeat triggers. Does NOT auto-complete.
      const { count: dinnerCount } = await _getDinnerPlanStats(
        householdId,
        weekStartISO  // already resolved from contextData.weekStart at top of function
      );
      await HouseholdWeeklyProgress.updateOne(
        { _id: progress._id },
        { $set: { dinnersPlannedCount: dinnerCount } }
      );
      progress = await HouseholdWeeklyProgress.findById(progress._id).lean();

      for (const key of ["pro_w3_plan_3_dinners", "pro_w4_plan_3_dinners"]) {
        const def = challenges.find((c) => c.key === key);
        if (def && dinnerCount >= 3 && !completedKeysBefore.has(key)) {
          await _markChallengeComplete(progress._id, def);
          newlyCompletedKeys.push(key);
          completedKeysBefore.add(key);
        }
      }

    } else if (eventType === "basic_created") {
      // Pro challenge: first Básico created
      await HouseholdWeeklyProgress.updateOne(
        { _id: progress._id },
        { $set: { basicCreated: true } }
      );
      progress = await HouseholdWeeklyProgress.findById(progress._id).lean();

      const def = challenges.find((c) => c.key === "pro_w1_configure_basics");
      if (def && !completedKeysBefore.has("pro_w1_configure_basics")) {
        await _markChallengeComplete(progress._id, def);
        newlyCompletedKeys.push("pro_w1_configure_basics");
        completedKeysBefore.add("pro_w1_configure_basics");
      }

    } else if (eventType === "basic_added_to_list") {
      // Pro challenge: at least one Básico added to the weekly list
      await HouseholdWeeklyProgress.updateOne(
        { _id: progress._id },
        { $set: { basicAddedToList: true } }
      );
      progress = await HouseholdWeeklyProgress.findById(progress._id).lean();

      const def = challenges.find((c) => c.key === "pro_w2_use_basics");
      if (def && !completedKeysBefore.has("pro_w2_use_basics")) {
        await _markChallengeComplete(progress._id, def);
        newlyCompletedKeys.push("pro_w2_use_basics");
        completedKeysBefore.add("pro_w2_use_basics");
      }

    } else if (eventType === "purchase_finalized") {
      // Pro challenge: purchase completed with BOTH store + amount.
      // The frontend only fires this trigger when both fields are present.
      const hasStore = Boolean(contextData.storeId);
      const hasAmount = Boolean(contextData.amount && Number(contextData.amount) > 0);
      if (hasStore && hasAmount) {
        await HouseholdWeeklyProgress.updateOne(
          { _id: progress._id },
          { $set: { purchaseFinalizedWithStore: true } }
        );
        progress = await HouseholdWeeklyProgress.findById(progress._id).lean();

        for (const key of ["pro_w3_finalize_purchase", "pro_w4_finalize_purchase"]) {
          const def = challenges.find((c) => c.key === key);
          if (def && !completedKeysBefore.has(key)) {
            await _markChallengeComplete(progress._id, def);
            newlyCompletedKeys.push(key);
            completedKeysBefore.add(key);
          }
        }
      }

    } else if (eventType === "budget_configured") {
      // Pro challenge: household budget set to a non-null, non-zero value
      await HouseholdWeeklyProgress.updateOne(
        { _id: progress._id },
        { $set: { budgetConfigured: true } }
      );
      progress = await HouseholdWeeklyProgress.findById(progress._id).lean();

      const def = challenges.find((c) => c.key === "pro_w4_configure_budget");
      if (def && !completedKeysBefore.has("pro_w4_configure_budget")) {
        await _markChallengeComplete(progress._id, def);
        newlyCompletedKeys.push("pro_w4_configure_budget");
        completedKeysBefore.add("pro_w4_configure_budget");
      }

    } else if (eventType === "diner_invited") {
      // Basic + Pro challenge: a non-owner household member has joined
      await HouseholdWeeklyProgress.updateOne(
        { _id: progress._id },
        { $set: { dinerInvited: true } }
      );
      progress = await HouseholdWeeklyProgress.findById(progress._id).lean();

      const def = challenges.find((c) => c.key === "weekly_invite_diner");
      if (def && !completedKeysBefore.has("weekly_invite_diner")) {
        await _markChallengeComplete(progress._id, def);
        newlyCompletedKeys.push("weekly_invite_diner");
        completedKeysBefore.add("weekly_invite_diner");
      }

    } else if (eventType === "diner_assigned_as_cook") {
      // Basic + Pro challenge: any day has a cook that is not the current user (household owner)
      await HouseholdWeeklyProgress.updateOne(
        { _id: progress._id },
        { $set: { dinerAssignedAsCook: true } }
      );
      progress = await HouseholdWeeklyProgress.findById(progress._id).lean();

      const def = challenges.find((c) => c.key === "weekly_assign_diner_as_cook");
      if (def && !completedKeysBefore.has("weekly_assign_diner_as_cook")) {
        await _markChallengeComplete(progress._id, def);
        newlyCompletedKeys.push("weekly_assign_diner_as_cook");
        completedKeysBefore.add("weekly_assign_diner_as_cook");
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
      const latestProgress = await HouseholdWeeklyProgress.findById(progress._id).lean();
      await checkAndGrantBonus(householdId, latestProgress, challenges, cycleConfig.bonusBites);

      // Beta Pro unlock: only relevant for basic curriculum users
      if (curriculum === "basic") {
        const betaProResult = await tryUnlockBetaPro(householdId);
        betaProUnlocked = betaProResult.unlocked;
      }
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
 * Now includes `curriculum` so the frontend can adjust its UI accordingly.
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

    // Resolve curriculum and per-household cycle start
    const household = await Household.findById(householdId)
      .select("subscriptionPlan planSource betaPro weeklyChallengeCycleStartedAt").lean();
    const curriculum = getHouseholdCurriculum(household);

    // Use per-household cycle anchor if set; fall back to global config for legacy households.
    const householdCycleStart = household?.weeklyChallengeCycleStartedAt ?? cycleConfig.cycleStartDate;
    const cycleWeekIndex = getCycleWeekIndex(weekStartDate, householdCycleStart);

    // participationWeek: how many weeks the household has been doing challenges (1-based).
    const MS_PER_WEEK = 7 * 24 * 60 * 60 * 1000;
    const weeksElapsed = Math.max(0, Math.floor((weekStartDate - householdCycleStart) / MS_PER_WEEK));
    const participationWeek = weeksElapsed + 1;

    const challenges = await WeeklyChallengeDef.find({
      active: true,
      cycleWeek: cycleWeekIndex,
      curriculum
    }).sort({ cycleOrder: 1 }).lean();

    const progress = await getOrCreateProgress(householdId, weekStartDate, cycleWeekIndex);
    const progressLean = progress.toObject ? progress.toObject() : progress;

    const completedMap = new Map(
      (progressLean.completedChallenges || []).map((c) => [c.challengeKey, c])
    );

    const mainChallenges = challenges.filter((c) => c.triggerType !== "bonus");
    const bonusDef = challenges.find((c) => c.triggerType === "bonus") || null;

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
        curriculum: c.curriculum,
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

    const bonus = bonusDef
      ? {
        key: bonusDef.key,
        title: bonusDef.title,
        rewardBites: bonusDef.rewardBites,
        completed: completedMap.has(bonusDef.key),
        rewardGranted: completedMap.get(bonusDef.key)?.rewardGranted ?? false,
        available: allMainCompleted
      }
      : null;

    return {
      available: true,
      curriculum,              // "basic" | "pro" — frontend uses for UI decoration
      cycleWeekIndex,          // internal 1-4 rotation index (not shown to users)
      participationWeek,       // how many weeks user has been doing challenges (shown as "Semana N")
      weekStart: weekStartISO,
      challenges: enrichedChallenges,
      completedCount,
      totalCount: totalMainChallengesCount,
      totalMainChallenges: totalMainChallengesCount,
      progressPercent,
      bonus,
      bonusChallenge: bonus,
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
  return WeeklyChallengeDef.find({}).sort({ curriculum: 1, cycleWeek: 1, cycleOrder: 1 }).lean();
}

export async function adminCreateChallengeDef(data) {
  const def = await WeeklyChallengeDef.create(data);
  return def;
}

export async function adminUpdateChallengeDef(id, data) {
  const allowed = [
    "title", "description", "guidance", "rewardBites",
    "triggerType", "triggerCount", "cycleWeek", "cycleOrder",
    "active", "planCompatibility", "curriculum"
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

/**
 * Returns the full cycle state for a household — used in the admin testing panel.
 */
export async function adminGetHouseholdCycleState(householdId) {
  const weekStartISO = getCurrentWeekStart();
  const weekStartDate = parseWeekStart(weekStartISO);

  const household = await Household.findById(householdId)
    .select("subscriptionPlan weeklyChallengeCycleStartedAt betaPro planSource subscriptionStatus stripeSubscriptionId")
    .lean();
  if (!household) throw new Error("Household not found.");

  const onboarding = await HouseholdOnboarding.findOne({ householdId }).lean();

  const householdCycleStart = household.weeklyChallengeCycleStartedAt ?? null;
  let cycleWeekIndex = null;
  let participationWeek = null;
  if (householdCycleStart) {
    const MS_PER_WEEK = 7 * 24 * 60 * 60 * 1000;
    const weeksElapsed = Math.max(
      0,
      Math.floor((weekStartDate - new Date(householdCycleStart)) / MS_PER_WEEK)
    );
    participationWeek = weeksElapsed + 1;
    cycleWeekIndex = getCycleWeekIndex(weekStartDate, new Date(householdCycleStart));
  }

  const progress = await HouseholdWeeklyProgress.findOne(
    { householdId, weekStart: weekStartDate }
  ).lean();

  // Beta Pro eligibility — read-only inspect, does NOT grant
  const betaProCheck = await inspectBetaProEligibility(householdId).catch(() => ({ result: "error" }));

  return {
    onboardingStatus: onboarding?.status ?? null,
    weeklyChallengeCycleStartedAt: householdCycleStart,
    cycleWeekIndex,
    participationWeek,
    currentWeekStart: weekStartISO,
    currentProgress: progress ? {
      cycleWeekIndex: progress.cycleWeekIndex,
      completedChallenges: (progress.completedChallenges || []).map((c) => ({
        key: c.challengeKey,
        rewardGranted: c.rewardGranted,
        completedAt: c.completedAt
      })),
      bonusGranted: progress.bonusGranted
    } : null,
    betaPro: household.betaPro ?? null,
    betaProEligibility: betaProCheck
  };
}

/**
 * Resets a household's cycle to Week 1 of this calendar week.
 * Deletes the current week's progress doc and clears the cycle anchor so the
 * next event re-initializes it to "this Monday = Week 1".
 */
export async function adminResetHouseholdCycle(householdId) {
  const weekStartISO = getCurrentWeekStart();
  const weekStartDate = parseWeekStart(weekStartISO);

  await Household.updateOne(
    { _id: householdId },
    { $unset: { weeklyChallengeCycleStartedAt: "" } }
  );
  await HouseholdWeeklyProgress.deleteOne({ householdId, weekStart: weekStartDate });

  console.log(`[weekly/admin] Cycle reset to Week 1 for household=${householdId}`);
  return { ok: true };
}

/**
 * Forces the household's cycle anchor so that the current calendar week
 * corresponds to the given cycleWeekIndex (1-4).
 * E.g. setWeek=2 means "this week is the household's cycle Week 2".
 *
 * This adjusts weeklyChallengeCycleStartedAt backward by (setWeek-1) weeks,
 * then deletes the current week's progress doc so fresh challenges are loaded.
 */
export async function adminSetHouseholdCycleWeek(householdId, setWeek) {
  const week = Math.min(4, Math.max(1, Number(setWeek) || 1));
  const weekStartISO = getCurrentWeekStart();
  const weekStartDate = parseWeekStart(weekStartISO);

  // The cycle anchor must be (week - 1) weeks before the current weekStart
  const MS_PER_WEEK = 7 * 24 * 60 * 60 * 1000;
  const newCycleStart = new Date(weekStartDate.getTime() - (week - 1) * MS_PER_WEEK);

  await Household.updateOne(
    { _id: householdId },
    { $set: { weeklyChallengeCycleStartedAt: newCycleStart } }
  );
  await HouseholdWeeklyProgress.deleteOne({ householdId, weekStart: weekStartDate });

  console.log(`[weekly/admin] Cycle week forced to ${week} for household=${householdId} (anchor=${newCycleStart.toISOString().slice(0, 10)})`);
  return { ok: true, cycleWeekIndex: week, newCycleStart };
}

export async function adminForceCompleteChallenge(householdId, challengeKey) {
  const onboarding = await HouseholdOnboarding.findOne({ householdId }).lean();
  if (!onboarding || onboarding.status !== "completed") {
    throw new Error("Onboarding not completed for this household.");
  }

  const weekStartISO = getCurrentWeekStart();
  const weekStartDate = parseWeekStart(weekStartISO);

  // Use per-household cycle anchor (same logic as triggerWeeklyChallenge) — NOT global config.
  const household = await Household.findById(householdId)
    .select("weeklyChallengeCycleStartedAt subscriptionPlan planSource betaPro").lean();

  let householdCycleStart = household?.weeklyChallengeCycleStartedAt ?? null;
  if (!householdCycleStart) {
    householdCycleStart = weekStartDate;
    await Household.updateOne(
      { _id: householdId, weeklyChallengeCycleStartedAt: null },
      { $set: { weeklyChallengeCycleStartedAt: weekStartDate } }
    );
  }

  const cycleWeekIndex = getCycleWeekIndex(weekStartDate, new Date(householdCycleStart));

  const def = await WeeklyChallengeDef.findOne({ key: challengeKey }).lean();
  if (!def) throw new Error(`Challenge not found: ${challengeKey}`);

  let progress = await getOrCreateProgress(householdId, weekStartDate, cycleWeekIndex);
  const completedKeys = new Set((progress.completedChallenges || []).map((c) => c.challengeKey));
  if (!completedKeys.has(challengeKey)) {
    await _markChallengeComplete(progress._id, def);
    progress = await HouseholdWeeklyProgress.findById(progress._id).lean();
    await grantWeeklyReward(householdId, challengeKey, def.rewardBites, progress);
  }

  const allChallenges = await WeeklyChallengeDef.find({
    active: true,
    cycleWeek: cycleWeekIndex,
    curriculum: def.curriculum || "basic"
  }).sort({ cycleOrder: 1 }).lean();

  const cycleConfig = await getOrCreateCycleConfig();
  const latestProgress = await HouseholdWeeklyProgress.findById(progress._id).lean();
  await checkAndGrantBonus(householdId, latestProgress, allChallenges, cycleConfig.bonusBites);

  // Attempt Beta Pro unlock — only relevant for basic curriculum
  let betaProResult = null;
  if ((def.curriculum || "basic") === "basic") {
    betaProResult = await checkAndGrantBetaPro(householdId);
  }

  return {
    ok: true,
    message: `Challenge ${challengeKey} force-completed.`,
    betaPro: betaProResult
  };
}
