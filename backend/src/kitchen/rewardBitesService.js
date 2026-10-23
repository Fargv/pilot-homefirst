import { Household } from "./models/Household.js";
import { BitesTransaction } from "./models/BitesTransaction.js";

const FREE_BITE_CARRY_OVER_CAP = 500;

function isDuplicateKeyError(error) {
  return Number(error?.code) === 11000;
}

function buildTransactionMetadata(metadata, idempotencyKey, actualGranted) {
  return {
    ...(metadata || {}),
    idempotencyKey,
    actualGranted,
    capped: actualGranted < Number(metadata?.rewardBites ?? actualGranted)
  };
}

async function ensureRewardTransaction({
  household,
  amount,
  type,
  reason,
  idempotencyKey,
  metadata,
  recovered
}) {
  const balanceAfterFree = Number(household.freeBitesBalance ?? 0);
  const balanceAfterPurchased = Number(household.purchasedBitesBalance ?? 0);
  const actualGranted = Number(metadata?.actualGranted ?? amount);
  const transactionMetadata = {
    ...buildTransactionMetadata(metadata, idempotencyKey, actualGranted),
    ...(recovered ? { recovered: true } : {})
  };

  try {
    return await BitesTransaction.findOneAndUpdate(
      { "metadata.idempotencyKey": idempotencyKey },
      {
        $setOnInsert: {
          householdId: household._id,
          type,
          amount,
          balanceAfterFree,
          balanceAfterPurchased,
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
 * Credits a reward exactly once and repairs its BitesTransaction on retry.
 * The household pipeline update is the balance idempotency boundary; the
 * unique transaction key makes concurrent ledger recovery safe.
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

  const balanceUpdate = await Household.updateOne(
    { _id: household._id, grantedBitesRewardKeys: { $ne: key } },
    [
      {
        $set: {
          freeBitesBalance: {
            $min: [
              { $add: [{ $ifNull: ["$freeBitesBalance", 0] }, numericAmount] },
              FREE_BITE_CARRY_OVER_CAP
            ]
          },
          grantedBitesRewardKeys: {
            $concatArrays: [{ $ifNull: ["$grantedBitesRewardKeys", []] }, [key]]
          }
        }
      }
    ]
  );

  const latestHousehold = await Household.findById(household._id).lean();
  if (!latestHousehold) return { applied: false, reason: "household_not_found" };

  const transaction = await ensureRewardTransaction({
    household: latestHousehold,
    amount: numericAmount,
    type,
    reason,
    idempotencyKey: key,
    metadata: {
      ...metadata,
      rewardBites: numericAmount,
      actualGranted: balanceUpdate.modifiedCount === 1
        ? Math.min(numericAmount, Math.max(0, FREE_BITE_CARRY_OVER_CAP - Number(household.freeBitesBalance ?? 0)))
        : 0
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
