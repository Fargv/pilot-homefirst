import crypto from "node:crypto";
import { Household } from "./models/Household.js";
import { BitesTransaction } from "./models/BitesTransaction.js";

const FREE_BITE_CARRY_OVER_CAP = 500;

function isDuplicateKeyError(error) {
  return Number(error?.code) === 11000;
}

function transactionIdFor(idempotencyKey) {
  return crypto.createHash("sha256").update(idempotencyKey).digest("hex").slice(0, 24);
}

function buildTransactionMetadata(metadata, idempotencyKey, actualGranted, requestedAmount) {
  return {
    ...(metadata || {}),
    idempotencyKey,
    actualGranted,
    capped: actualGranted < Number(requestedAmount ?? metadata?.rewardBites ?? actualGranted)
  };
}

function findRewardClaim(household, idempotencyKey) {
  return (household?.grantedBitesRewardClaims || [])
    .find((claim) => claim.key === idempotencyKey);
}

function buildBalanceClaimPipeline(idempotencyKey, numericAmount) {
  const balanceBeforeFree = { $ifNull: ["$freeBitesBalance", 0] };
  const balanceBeforePurchased = { $ifNull: ["$purchasedBitesBalance", 0] };
  const actualGranted = {
    $min: [
      numericAmount,
      { $max: [0, { $subtract: [FREE_BITE_CARRY_OVER_CAP, balanceBeforeFree] }] }
    ]
  };
  const balanceAfterFree = { $add: [balanceBeforeFree, actualGranted] };

  return [
    {
      $set: {
        freeBitesBalance: balanceAfterFree,
        grantedBitesRewardKeys: {
          $concatArrays: [{ $ifNull: ["$grantedBitesRewardKeys", []] }, [idempotencyKey]]
        },
        grantedBitesRewardClaims: {
          $concatArrays: [
            { $ifNull: ["$grantedBitesRewardClaims", []] },
            [{
              key: idempotencyKey,
              requestedAmount: numericAmount,
              actualGranted,
              balanceAfterFree,
              balanceAfterPurchased: balanceBeforePurchased
            }]
          ]
        }
      }
    }
  ];
}

async function ensureRewardTransaction({
  household,
  amount,
  requestedAmount,
  balanceAfterFree,
  balanceAfterPurchased,
  type,
  reason,
  idempotencyKey,
  metadata,
  recovered
}) {
  const transactionId = transactionIdFor(idempotencyKey);
  const actualGranted = Number(metadata?.actualGranted ?? amount);
  const transactionMetadata = {
    ...buildTransactionMetadata(metadata, idempotencyKey, actualGranted, requestedAmount),
    ...(recovered ? { recovered: true } : {})
  };

  try {
    return await BitesTransaction.findOneAndUpdate(
      { _id: transactionId, "metadata.idempotencyKey": idempotencyKey },
      {
        $setOnInsert: {
          _id: transactionId,
          householdId: household._id,
          type,
          amount: actualGranted,
          balanceAfterFree: Number(balanceAfterFree),
          balanceAfterPurchased: Number(balanceAfterPurchased),
          reason,
          metadata: transactionMetadata
        }
      },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );
  } catch (error) {
    // A concurrent retry can win the unique idempotency index between the
    // lookup and upsert. Treat that as the same successful ledger entry.
    if (!isDuplicateKeyError(error)) throw error;
    return BitesTransaction.findOne({ "metadata.idempotencyKey": idempotencyKey });
  }
}

/**
 * Credits a reward once and repairs its BitesTransaction on retry.
 *
 * The household pipeline is the balance idempotency boundary and stores the
 * effective amount/snapshot in the same atomic document update. The ledger is
 * therefore repaired from historical claim data, never from the current
 * balance (which may already include another reward or be capped at 500).
 */
export async function grantRewardBites({
  householdId,
  amount,
  type,
  reason,
  idempotencyKey,
  metadata = {}
}) {
  const numericAmount = Number(amount);
  const key = String(idempotencyKey || "").trim();
  if (!Number.isFinite(numericAmount) || numericAmount <= 0) {
    return { applied: false, reason: "zero_or_invalid_amount" };
  }
  if (!key) throw new Error("idempotencyKey es obligatorio para una recompensa.");

  const household = await Household.findById(householdId).lean();
  if (!household) return { applied: false, reason: "household_not_found" };

  // Check the ledger before touching the wallet. This protects households
  // created before the claim-history field or before the partial index was
  // present, where the idempotency key may not yet be in the wallet marker.
  const existingTransaction = await BitesTransaction.findOne({ "metadata.idempotencyKey": key });
  if (existingTransaction) {
    return {
      applied: false,
      recovered: true,
      transactionId: existingTransaction._id || null,
      wallet: {
        freeBitesBalance: household.freeBitesBalance ?? 0,
        purchasedBitesBalance: household.purchasedBitesBalance ?? 0
      }
    };
  }

  const balanceUpdate = await Household.updateOne(
    { _id: household._id, grantedBitesRewardKeys: { $ne: key } },
    buildBalanceClaimPipeline(key, numericAmount)
  );

  const latestHousehold = await Household.findById(household._id).lean();
  if (!latestHousehold) return { applied: false, reason: "household_not_found" };

  const claim = findRewardClaim(latestHousehold, key);
  if (!claim) {
    // A key-only legacy marker does not contain enough history to reconstruct
    // the effective credit safely. If its ledger already exists, reuse it;
    // otherwise leave the reward pending rather than fabricate a zero ledger.
    const recoveredTransaction = await BitesTransaction.findOne({ "metadata.idempotencyKey": key });
    if (recoveredTransaction) {
      return {
        applied: false,
        recovered: true,
        transactionId: recoveredTransaction._id || null,
        wallet: {
          freeBitesBalance: latestHousehold.freeBitesBalance ?? 0,
          purchasedBitesBalance: latestHousehold.purchasedBitesBalance ?? 0
        }
      };
    }
    throw new Error(`No se puede recuperar la recompensa ${key}: falta su snapshot histórico.`);
  }

  const requestedAmount = Number(claim.requestedAmount);
  const actualGranted = Number(claim.actualGranted);
  const balanceAfterFree = Number(claim.balanceAfterFree);
  const balanceAfterPurchased = Number(claim.balanceAfterPurchased);
  if (
    !Number.isFinite(requestedAmount)
    || !Number.isFinite(actualGranted)
    || actualGranted < 0
    || actualGranted > requestedAmount
    || !Number.isFinite(balanceAfterFree)
    || !Number.isFinite(balanceAfterPurchased)
  ) {
    throw new Error(`No se puede recuperar la recompensa ${key}: snapshot histórico inválido.`);
  }
  const transaction = await ensureRewardTransaction({
    household: latestHousehold,
    amount: actualGranted,
    requestedAmount,
    balanceAfterFree,
    balanceAfterPurchased,
    type,
    reason,
    idempotencyKey: key,
    metadata: {
      ...metadata,
      rewardBites: requestedAmount,
      actualGranted
    },
    recovered: balanceUpdate.modifiedCount !== 1
  });

  return {
    applied: balanceUpdate.modifiedCount === 1,
    recovered: balanceUpdate.modifiedCount !== 1,
    transactionId: transaction?._id || null,
    wallet: {
      freeBitesBalance: latestHousehold.freeBitesBalance ?? 0,
      purchasedBitesBalance: latestHousehold.purchasedBitesBalance ?? 0
    }
  };
}
