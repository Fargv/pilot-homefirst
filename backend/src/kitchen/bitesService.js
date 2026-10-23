import crypto from "node:crypto";
import { Household } from "./models/Household.js";
import { BitesTransaction } from "./models/BitesTransaction.js";
import { BitesConfig } from "./models/BitesConfig.js";
import { normalizeSubscriptionPlan } from "./subscriptionService.js";

// Economy: 100 Bites = 1.99 EUR (see bitesConstants.js)
const DEFAULT_MONTHLY_GRANT = { basic: 100, pro: 300, premium: 1000 };
const DEFAULT_MAX_CARRY_OVER = { basic: 500, pro: 1000, premium: 5000 };

// baseBitePrice represents the price for 100 Bites (1.99 EUR = 100 Bites)
const DEFAULT_BASE_BITE_PRICE = 1.99;

function transactionIdFor(idempotencyKey) {
  return crypto.createHash("sha256").update(idempotencyKey).digest("hex").slice(0, 24);
}

function findOperationClaim(household, key) {
  return (household?.bitesOperationClaims || []).find((claim) => claim.key === key);
}

async function ensureOperationTransaction({ household, claim, type, reason, metadata = {}, createdBy = null }) {
  const idempotencyKey = claim.key;
  const transactionMetadata = {
    ...metadata,
    idempotencyKey,
    requestedAmount: claim.requestedAmount,
    actualAmount: claim.actualAmount,
    freeAmount: claim.freeAmount,
    purchasedAmount: claim.purchasedAmount
  };
  try {
    return await BitesTransaction.findOneAndUpdate(
      { _id: transactionIdFor(idempotencyKey), "metadata.idempotencyKey": idempotencyKey },
      {
        $setOnInsert: {
          _id: transactionIdFor(idempotencyKey),
          householdId: household._id,
          type,
          amount: claim.operation === "spend" ? -claim.actualAmount : claim.actualAmount,
          balanceAfterFree: claim.balanceAfterFree,
          balanceAfterPurchased: claim.balanceAfterPurchased,
          reason,
          createdBy: createdBy || null,
          metadata: transactionMetadata
        }
      },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );
  } catch (error) {
    if (Number(error?.code) !== 11000) throw error;
    return BitesTransaction.findOne({ "metadata.idempotencyKey": idempotencyKey });
  }
}

function monthKey(date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
}

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
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const idempotencyKey = `monthly:${householdId}:${monthKey(now)}`;
  const existingClaim = findOperationClaim(household, idempotencyKey);
  if (existingClaim) {
    const transaction = await ensureOperationTransaction({
      household,
      claim: existingClaim,
      type: "monthly_grant",
      reason: `Recarga mensual del plan ${plan}`,
      metadata: { plan, grantAmount, maxCarryOver, recovered: true },
      createdBy: adminUserId
    });
    const latest = await Household.findById(household._id).lean();
    return {
      skipped: true,
      reason: "already_granted_this_month",
      transaction: { id: transaction?._id },
      wallet: getWalletFromHousehold(latest || household)
    };
  }

  const updated = await Household.findOneAndUpdate(
    {
      _id: household._id,
      "bitesOperationClaims.key": { $ne: idempotencyKey },
      $or: [
        { lastMonthlyBitesGrantAt: null },
        { lastMonthlyBitesGrantAt: { $exists: false } },
        { lastMonthlyBitesGrantAt: { $lt: monthStart } }
      ]
    },
    [
      {
        $set: {
          __currentFree: { $ifNull: ["$freeBitesBalance", 0] },
          __currentPurchased: { $ifNull: ["$purchasedBitesBalance", 0] }
        }
      },
      {
        $set: {
          __actualGranted: {
            $min: [grantAmount, { $max: [0, { $subtract: [maxCarryOver, "$__currentFree"] }] }]
          }
        }
      },
      {
        $set: {
          freeBitesBalance: { $add: ["$__currentFree", "$__actualGranted"] },
          lastMonthlyBitesGrantAt: now,
          bitesOperationClaims: {
            $concatArrays: [
              { $ifNull: ["$bitesOperationClaims", []] },
              [{
                key: idempotencyKey,
                operation: "monthly_grant",
                requestedAmount: grantAmount,
                actualAmount: "$__actualGranted",
                freeAmount: "$__actualGranted",
                purchasedAmount: 0,
                balanceAfterFree: { $add: ["$__currentFree", "$__actualGranted"] },
                balanceAfterPurchased: "$__currentPurchased"
              }]
            ]
          }
        }
      },
      { $unset: ["__currentFree", "__currentPurchased", "__actualGranted"] }
    ],
    { new: true, lean: true }
  );

  if (!updated) {
    const current = await Household.findById(household._id).lean();
    const claim = findOperationClaim(current, idempotencyKey);
    if (claim) {
      const transaction = await ensureOperationTransaction({
        household: current || household,
        claim,
        type: "monthly_grant",
        reason: `Recarga mensual del plan ${plan}`,
        metadata: { plan, grantAmount, maxCarryOver, recovered: true },
        createdBy: adminUserId
      });
      return {
        skipped: true,
        reason: "already_granted_this_month",
        transaction: { id: transaction?._id },
        wallet: getWalletFromHousehold(current || household)
      };
    }
    return { skipped: true, reason: "already_granted_this_month", wallet: getWalletFromHousehold(current || household) };
  }

  const claim = findOperationClaim(updated, idempotencyKey);
  const transaction = await ensureOperationTransaction({
    household: updated,
    claim,
    type: "monthly_grant",
    reason: `Recarga mensual del plan ${plan}`,
    metadata: { plan, grantAmount, maxCarryOver },
    createdBy: adminUserId
  });

  return {
    skipped: false,
    granted: grantAmount,
    actualGranted: claim.actualAmount,
    capped: claim.actualAmount < grantAmount,
    transaction: { id: transaction?._id },
    wallet: getWalletFromHousehold(updated)
  };
}

export async function spendBites(householdId, amount, reason, metadata = {}) {
  const spendAmount = Number(amount);
  if (!Number.isFinite(spendAmount) || spendAmount < 1) {
    throw Object.assign(new Error("amount debe ser un entero positivo."), { statusCode: 400 });
  }

  const idempotencyKey = metadata?.idempotencyKey
    || `spend:${householdId}:${crypto.randomUUID()}`;

  const updated = await Household.findOneAndUpdate(
    {
      _id: householdId,
      "bitesOperationClaims.key": { $ne: idempotencyKey },
      $expr: {
        $gte: [
          { $add: [{ $ifNull: ["$freeBitesBalance", 0] }, { $ifNull: ["$purchasedBitesBalance", 0] }] },
          spendAmount
        ]
      }
    },
    [
      {
        $set: {
          __freeBefore: { $ifNull: ["$freeBitesBalance", 0] },
          __purchasedBefore: { $ifNull: ["$purchasedBitesBalance", 0] },
          __freeToSpend: { $min: [{ $ifNull: ["$freeBitesBalance", 0] }, spendAmount] }
        }
      },
      {
        $set: {
          __purchasedToSpend: { $subtract: [spendAmount, "$__freeToSpend"] }
        }
      },
      {
        $set: {
          freeBitesBalance: { $subtract: [{ $ifNull: ["$freeBitesBalance", 0] }, "$__freeToSpend"] },
          purchasedBitesBalance: { $subtract: [{ $ifNull: ["$purchasedBitesBalance", 0] }, "$__purchasedToSpend"] },
          totalBitesSpent: { $add: [{ $ifNull: ["$totalBitesSpent", 0] }, spendAmount] },
          bitesOperationClaims: {
            $concatArrays: [
              { $ifNull: ["$bitesOperationClaims", []] },
              [{
                key: idempotencyKey,
                operation: "spend",
                requestedAmount: spendAmount,
                actualAmount: spendAmount,
                freeAmount: "$__freeToSpend",
                purchasedAmount: "$__purchasedToSpend",
                balanceAfterFree: { $subtract: ["$__freeBefore", "$__freeToSpend"] },
                balanceAfterPurchased: { $subtract: ["$__purchasedBefore", "$__purchasedToSpend"] }
              }]
            ]
          }
        }
      },
      { $unset: ["__freeBefore", "__purchasedBefore", "__freeToSpend", "__purchasedToSpend"] }
    ],
    { new: true, lean: true }
  );

  if (!updated) {
    const current = await Household.findById(householdId).lean();
    if (!current) throw Object.assign(new Error("Hogar no encontrado."), { statusCode: 404 });
    const claim = findOperationClaim(current, idempotencyKey);
    if (!claim) {
      throw Object.assign(new Error("No tienes Bites suficientes."), { statusCode: 402, code: "INSUFFICIENT_BITES" });
    }
    const transaction = await ensureOperationTransaction({
      household: current,
      claim,
      type: "pack_unlock",
      reason,
      metadata
    });
    return {
      skipped: true,
      wallet: getWalletFromHousehold(current),
      transaction: { id: transaction?._id }
    };
  }

  const claim = findOperationClaim(updated, idempotencyKey);
  const transaction = await ensureOperationTransaction({
    household: updated,
    claim,
    type: "pack_unlock",
    reason,
    metadata: { ...metadata, idempotencyKey }
  });

  return {
    wallet: getWalletFromHousehold(updated),
    transaction: { id: transaction._id }
  };
}

export async function grantPurchasedBites(householdId, amount, reason, metadata = {}) {
  if (!Number.isFinite(Number(amount)) || Number(amount) < 1) {
    throw Object.assign(new Error("amount debe ser un entero positivo."), { statusCode: 400 });
  }

  const numericAmount = Number(amount);
  const household = await Household.findById(householdId).lean();
  if (!household) throw Object.assign(new Error("Hogar no encontrado."), { statusCode: 404 });

  const purchaseAttemptId = metadata?.purchaseAttemptId ? String(metadata.purchaseAttemptId) : null;
  const idempotencyKey = metadata?.idempotencyKey
    || (purchaseAttemptId ? `purchase:${purchaseAttemptId}` : `purchase:${householdId}:${crypto.randomUUID()}`);
  const existingPurchase = purchaseAttemptId
    ? await BitesTransaction.findOne({ "metadata.purchaseAttemptId": purchaseAttemptId })
    : null;
  if (existingPurchase) {
    return { skipped: true, wallet: getWalletFromHousehold(household), transaction: { id: existingPurchase._id } };
  }
  const existingClaim = findOperationClaim(household, idempotencyKey);
  if (existingClaim) {
    const transaction = await ensureOperationTransaction({
      household,
      claim: existingClaim,
      type: "purchase",
      reason,
      metadata: { ...metadata, idempotencyKey }
    });
    const latest = await Household.findById(household._id).lean();
    return { skipped: true, wallet: getWalletFromHousehold(latest || household), transaction: { id: transaction?._id } };
  }

  const updated = await Household.findOneAndUpdate(
    { _id: household._id, "bitesOperationClaims.key": { $ne: idempotencyKey } },
    [
      {
        $set: {
          __freeBefore: { $ifNull: ["$freeBitesBalance", 0] },
          __purchasedBefore: { $ifNull: ["$purchasedBitesBalance", 0] }
        }
      },
      {
        $set: {
          purchasedBitesBalance: { $add: ["$__purchasedBefore", numericAmount] },
          bitesOperationClaims: {
            $concatArrays: [
              { $ifNull: ["$bitesOperationClaims", []] },
              [{
                key: idempotencyKey,
                operation: "purchase",
                requestedAmount: numericAmount,
                actualAmount: numericAmount,
                freeAmount: 0,
                purchasedAmount: numericAmount,
                balanceAfterFree: "$__freeBefore",
                balanceAfterPurchased: { $add: ["$__purchasedBefore", numericAmount] }
              }]
            ]
          }
        }
      },
      { $unset: ["__freeBefore", "__purchasedBefore"] }
    ],
    { new: true, lean: true }
  );
  if (!updated) {
    const current = await Household.findById(householdId).lean();
    if (!current) throw Object.assign(new Error("Hogar no encontrado."), { statusCode: 404 });
    const claim = findOperationClaim(current, idempotencyKey);
    if (!claim) throw new Error("No se pudo reclamar la compra de Bites de forma idempotente.");
    const transaction = await ensureOperationTransaction({
      household: current,
      claim,
      type: "purchase",
      reason,
      metadata: { ...metadata, idempotencyKey }
    });
    return { skipped: true, wallet: getWalletFromHousehold(current), transaction: { id: transaction?._id } };
  }

  const claim = findOperationClaim(updated, idempotencyKey);
  const transaction = await ensureOperationTransaction({
    household: updated,
    claim,
    type: "purchase",
    reason,
    metadata: { ...metadata, idempotencyKey }
  });

  return {
    wallet: getWalletFromHousehold(updated),
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
