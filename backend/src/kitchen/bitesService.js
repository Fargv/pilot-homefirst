import { Household } from "./models/Household.js";
import { BitesTransaction } from "./models/BitesTransaction.js";
import { BitesConfig } from "./models/BitesConfig.js";
import { normalizeSubscriptionPlan } from "./subscriptionService.js";

const DEFAULT_MONTHLY_GRANT = { basic: 1, pro: 3, premium: 10 };
const DEFAULT_MAX_CARRY_OVER = { basic: 5, pro: 10, premium: 50 };

const DEFAULT_BUNDLES = [
  { name: "Starter", bitesAmount: 5, price: 8.99, badge: "", highlighted: false, active: true, sortOrder: 1 },
  { name: "Popular", bitesAmount: 15, price: 26.99, badge: "Popular", highlighted: true, active: true, sortOrder: 2 },
  { name: "Premium", bitesAmount: 40, price: 59.99, badge: "", highlighted: false, active: true, sortOrder: 3 },
  { name: "Mega", bitesAmount: 100, price: 99.99, badge: "Mejor valor", highlighted: false, active: true, sortOrder: 4 }
];

export async function getBitesConfig() {
  let config = await BitesConfig.findOne({ key: "bitesEconomy" });
  if (!config) {
    config = await BitesConfig.create({
      key: "bitesEconomy",
      monthlyGrantByPlan: { ...DEFAULT_MONTHLY_GRANT },
      maxFreeCarryOverByPlan: { ...DEFAULT_MAX_CARRY_OVER },
      bundles: DEFAULT_BUNDLES
    });
  }
  return config.toObject ? config.toObject() : config;
}

export function getMonthlyGrant(config, plan) {
  const normalized = normalizeSubscriptionPlan(plan);
  return config.monthlyGrantByPlan?.[normalized] ?? DEFAULT_MONTHLY_GRANT[normalized] ?? 0;
}

export function getMaxCarryOver(config, plan) {
  const normalized = normalizeSubscriptionPlan(plan);
  return config.maxFreeCarryOverByPlan?.[normalized] ?? DEFAULT_MAX_CARRY_OVER[normalized] ?? 0;
}

export function getWalletFromHousehold(household) {
  const free = household.freeBitesBalance ?? 0;
  const purchased = household.purchasedBitesBalance ?? 0;
  return {
    freeBitesBalance: free,
    purchasedBitesBalance: purchased,
    totalBites: free + purchased,
    totalBitesSpent: household.totalBitesSpent ?? 0,
    lastMonthlyBitesGrantAt: household.lastMonthlyBitesGrantAt ?? null
  };
}

export function daysUntilNextGrant() {
  const now = new Date();
  const next = new Date(now.getFullYear(), now.getMonth() + 1, 1);
  return Math.max(1, Math.ceil((next - now) / (1000 * 60 * 60 * 24)));
}

export async function grantMonthlyBites(householdId, adminUserId = null) {
  const household = await Household.findById(householdId);
  if (!household) throw Object.assign(new Error("Hogar no encontrado."), { statusCode: 404 });

  const config = await getBitesConfig();
  const plan = normalizeSubscriptionPlan(household.subscriptionPlan);
  const grantAmount = getMonthlyGrant(config, plan);
  const maxCarryOver = getMaxCarryOver(config, plan);

  const now = new Date();
  const lastGrant = household.lastMonthlyBitesGrantAt;
  if (lastGrant) {
    const d = new Date(lastGrant);
    const sameMonth = d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth();
    if (sameMonth) {
      return { skipped: true, reason: "already_granted_this_month", wallet: getWalletFromHousehold(household) };
    }
  }

  const currentFree = household.freeBitesBalance ?? 0;
  const newFree = Math.min(currentFree + grantAmount, maxCarryOver);
  const actualGranted = newFree - currentFree;

  household.freeBitesBalance = newFree;
  household.lastMonthlyBitesGrantAt = now;
  await household.save();

  await BitesTransaction.create({
    householdId: household._id,
    type: "monthly_grant",
    amount: grantAmount,
    balanceAfterFree: newFree,
    balanceAfterPurchased: household.purchasedBitesBalance ?? 0,
    reason: `Recarga mensual del plan ${plan}`,
    createdBy: adminUserId || null,
    metadata: { plan, grantAmount, actualGranted, capped: actualGranted < grantAmount, maxCarryOver }
  });

  return {
    skipped: false,
    granted: grantAmount,
    actualGranted,
    capped: actualGranted < grantAmount,
    wallet: getWalletFromHousehold(household)
  };
}

export async function spendBites(householdId, amount, reason, metadata = {}) {
  const household = await Household.findById(householdId);
  if (!household) throw Object.assign(new Error("Hogar no encontrado."), { statusCode: 404 });

  const freeBal = household.freeBitesBalance ?? 0;
  const purchasedBal = household.purchasedBitesBalance ?? 0;
  const totalBal = freeBal + purchasedBal;

  if (totalBal < amount) {
    throw Object.assign(new Error("No tienes Bites suficientes."), { statusCode: 402, code: "INSUFFICIENT_BITES" });
  }

  const freeToSpend = Math.min(freeBal, amount);
  const purchasedToSpend = amount - freeToSpend;
  const newFree = freeBal - freeToSpend;
  const newPurchased = purchasedBal - purchasedToSpend;

  household.freeBitesBalance = newFree;
  household.purchasedBitesBalance = newPurchased;
  household.totalBitesSpent = (household.totalBitesSpent ?? 0) + amount;
  await household.save();

  const transaction = await BitesTransaction.create({
    householdId: household._id,
    type: "pack_unlock",
    amount: -amount,
    balanceAfterFree: newFree,
    balanceAfterPurchased: newPurchased,
    reason,
    metadata
  });

  return {
    wallet: getWalletFromHousehold(household),
    transaction: { id: transaction._id }
  };
}

export async function adminGrantBites(householdId, amount, bucket, reason, adminUserId) {
  if (!["free", "purchased"].includes(bucket)) {
    throw Object.assign(new Error("bucket debe ser 'free' o 'purchased'."), { statusCode: 400 });
  }
  if (typeof amount !== "number" || amount === 0 || !Number.isFinite(amount)) {
    throw Object.assign(new Error("amount debe ser un número no-cero."), { statusCode: 400 });
  }

  const household = await Household.findById(householdId);
  if (!household) throw Object.assign(new Error("Hogar no encontrado."), { statusCode: 404 });

  const config = await getBitesConfig();
  const plan = normalizeSubscriptionPlan(household.subscriptionPlan);

  let newFree = household.freeBitesBalance ?? 0;
  let newPurchased = household.purchasedBitesBalance ?? 0;

  if (bucket === "free") {
    if (amount > 0) {
      const maxCarryOver = getMaxCarryOver(config, plan);
      newFree = Math.min(newFree + amount, maxCarryOver);
    } else {
      newFree = Math.max(0, newFree + amount);
    }
  } else {
    newPurchased = Math.max(0, newPurchased + amount);
  }

  household.freeBitesBalance = newFree;
  household.purchasedBitesBalance = newPurchased;
  if (amount < 0) {
    household.totalBitesSpent = (household.totalBitesSpent ?? 0) + Math.abs(amount);
  }
  await household.save();

  const txType = amount > 0 ? "admin_grant" : "admin_remove";
  const transaction = await BitesTransaction.create({
    householdId: household._id,
    type: txType,
    amount,
    balanceAfterFree: newFree,
    balanceAfterPurchased: newPurchased,
    reason: reason || `Admin ${txType}`,
    createdBy: adminUserId || null,
    metadata: { bucket }
  });

  return {
    wallet: getWalletFromHousehold(household),
    transaction: { id: transaction._id }
  };
}
