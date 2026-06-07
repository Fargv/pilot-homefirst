import { Household } from "./models/Household.js";
import { BitesTransaction } from "./models/BitesTransaction.js";
import { BitesConfig } from "./models/BitesConfig.js";
import { normalizeSubscriptionPlan } from "./subscriptionService.js";

// Economy: 100 Bites = 1.99 EUR (see bitesConstants.js)
const DEFAULT_MONTHLY_GRANT = { basic: 100, pro: 300, premium: 1000 };
const DEFAULT_MAX_CARRY_OVER = { basic: 500, pro: 1000, premium: 5000 };

// baseBitePrice represents the price for 100 Bites (1.99 EUR = 100 Bites)
const DEFAULT_BASE_BITE_PRICE = 1.99;

const DEFAULT_BUNDLES = [
  { name: "Starter", bitesAmount: 500, price: 8.95, discountPercent: 10, badge: "", highlighted: false, active: true, sortOrder: 1 },
  { name: "Popular", bitesAmount: 1500, price: 22.38, discountPercent: 25, badge: "Popular", highlighted: true, active: true, sortOrder: 2 },
  { name: "Premium", bitesAmount: 4000, price: 47.76, discountPercent: 40, badge: "", highlighted: false, active: true, sortOrder: 3 },
  { name: "Mega", bitesAmount: 10000, price: 79.60, discountPercent: 60, badge: "Mejor valor", highlighted: false, active: true, sortOrder: 4 }
];

export async function getBitesConfig() {
  let config = await BitesConfig.findOne({ key: "bitesEconomy" });
  if (!config) {
    config = await BitesConfig.create({
      key: "bitesEconomy",
      monthlyGrantByPlan: { ...DEFAULT_MONTHLY_GRANT },
      maxFreeCarryOverByPlan: { ...DEFAULT_MAX_CARRY_OVER },
      baseBitePrice: DEFAULT_BASE_BITE_PRICE,
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
  const household = await Household.findById(householdId).lean();
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

  await Household.updateOne(
    { _id: household._id },
    { $set: { freeBitesBalance: newFree, lastMonthlyBitesGrantAt: now } }
  );

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
    wallet: getWalletFromHousehold({ ...household, freeBitesBalance: newFree, lastMonthlyBitesGrantAt: now })
  };
}

export async function spendBites(householdId, amount, reason, metadata = {}) {
  const household = await Household.findById(householdId).lean();
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
  const newSpent = (household.totalBitesSpent ?? 0) + amount;

  await Household.updateOne(
    { _id: household._id },
    { $set: { freeBitesBalance: newFree, purchasedBitesBalance: newPurchased, totalBitesSpent: newSpent } }
  );

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
    wallet: getWalletFromHousehold({ ...household, freeBitesBalance: newFree, purchasedBitesBalance: newPurchased, totalBitesSpent: newSpent }),
    transaction: { id: transaction._id }
  };
}

export async function grantPurchasedBites(householdId, amount, reason, metadata = {}) {
  if (!Number.isFinite(Number(amount)) || Number(amount) < 1) {
    throw Object.assign(new Error("amount debe ser un entero positivo."), { statusCode: 400 });
  }

  const household = await Household.findById(householdId).lean();
  if (!household) throw Object.assign(new Error("Hogar no encontrado."), { statusCode: 404 });

  const newPurchased = (household.purchasedBitesBalance ?? 0) + Number(amount);

  // Transaction record is created first: the idempotency check in
  // applyBitesBundleEntitlementFromAttempt queries this collection, so creating
  // it before updating the balance ensures webhook replays are blocked even if
  // the balance update below fails.
  const transaction = await BitesTransaction.create({
    householdId: household._id,
    type: "purchase",
    amount: Number(amount),
    balanceAfterFree: household.freeBitesBalance ?? 0,
    balanceAfterPurchased: newPurchased,
    reason,
    metadata
  });

  await Household.updateOne(
    { _id: household._id },
    { $set: { purchasedBitesBalance: newPurchased } }
  );

  return {
    wallet: getWalletFromHousehold({ ...household, purchasedBitesBalance: newPurchased }),
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

  const household = await Household.findById(householdId).lean();
  if (!household) throw Object.assign(new Error("Hogar no encontrado."), { statusCode: 404 });

  const config = await getBitesConfig();
  const plan = normalizeSubscriptionPlan(household.subscriptionPlan);

  let newFree = household.freeBitesBalance ?? 0;
  let newPurchased = household.purchasedBitesBalance ?? 0;
  let newSpent = household.totalBitesSpent ?? 0;

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

  if (amount < 0) {
    newSpent += Math.abs(amount);
  }

  await Household.updateOne(
    { _id: household._id },
    { $set: { freeBitesBalance: newFree, purchasedBitesBalance: newPurchased, totalBitesSpent: newSpent } }
  );

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
    wallet: getWalletFromHousehold({ ...household, freeBitesBalance: newFree, purchasedBitesBalance: newPurchased, totalBitesSpent: newSpent }),
    transaction: { id: transaction._id }
  };
}
