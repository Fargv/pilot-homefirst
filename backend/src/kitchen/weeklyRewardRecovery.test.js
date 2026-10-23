import assert from "node:assert/strict";
import test from "node:test";
import { Household } from "./models/Household.js";
import { BitesTransaction } from "./models/BitesTransaction.js";
import { HouseholdWeeklyProgress } from "./models/HouseholdWeeklyProgress.js";
import { checkAndGrantBonus } from "./weeklyEngine.js";

function installFakeModels() {
  const state = {
    balance: 0,
    purchased: 0,
    rewardKeys: new Set(),
    rewardClaims: new Map(),
    transactions: new Map(),
    failNextLedgerWrite: false,
    progress: {
      _id: "progress-1",
      bonusGranted: false,
      completedChallenges: [
        { challengeKey: "weekly_main", rewardGranted: true }
      ]
    }
  };
  const originals = {
    householdFindById: Household.findById,
    householdUpdateOne: Household.updateOne,
    transactionFindOneAndUpdate: BitesTransaction.findOneAndUpdate,
    transactionFindOne: BitesTransaction.findOne,
    progressUpdateOne: HouseholdWeeklyProgress.updateOne,
    progressFindById: HouseholdWeeklyProgress.findById
  };
  const householdSnapshot = () => ({
    _id: "household-1",
    freeBitesBalance: state.balance,
    purchasedBitesBalance: state.purchased,
    grantedBitesRewardKeys: [...state.rewardKeys],
    grantedBitesRewardClaims: [...state.rewardClaims.values()]
  });
  const progressSnapshot = () => ({
    ...state.progress,
    completedChallenges: state.progress.completedChallenges.map((entry) => ({ ...entry }))
  });

  Household.findById = () => ({ lean: async () => householdSnapshot() });
  Household.updateOne = async (filter, update) => {
    const key = filter.grantedBitesRewardKeys?.$ne;
    if (key && state.rewardKeys.has(key)) return { modifiedCount: 0 };
    const amount = update[0].$set.grantedBitesRewardClaims.$concatArrays[1][0].requestedAmount;
    const actualGranted = Math.min(amount, Math.max(0, 500 - state.balance));
    state.balance += actualGranted;
    state.rewardKeys.add(key);
    state.rewardClaims.set(key, {
      key,
      requestedAmount: amount,
      actualGranted,
      balanceAfterFree: state.balance,
      balanceAfterPurchased: state.purchased
    });
    return { modifiedCount: 1 };
  };
  BitesTransaction.findOneAndUpdate = async (filter, update) => {
    if (state.failNextLedgerWrite) {
      state.failNextLedgerWrite = false;
      throw new Error("injected ledger failure");
    }
    const key = filter["metadata.idempotencyKey"];
    if (!state.transactions.has(key)) {
      state.transactions.set(key, {
        _id: `tx-${state.transactions.size + 1}`,
        ...update.$setOnInsert
      });
    }
    return state.transactions.get(key);
  };
  BitesTransaction.findOne = async (filter) => state.transactions.get(filter["metadata.idempotencyKey"]) || null;
  HouseholdWeeklyProgress.updateOne = async (filter, update) => {
    if (update.$push?.completedChallenges) {
      state.progress.completedChallenges.push(update.$push.completedChallenges);
      state.progress.bonusGranted = true;
      return { modifiedCount: 1 };
    }
    if (update.$set?.["completedChallenges.$.rewardGranted"] === true) {
      const challengeKey = filter.completedChallenges.$elemMatch.challengeKey;
      const entry = state.progress.completedChallenges.find((item) => item.challengeKey === challengeKey);
      if (!entry || entry.rewardGranted === true) return { modifiedCount: 0 };
      entry.rewardGranted = true;
      return { modifiedCount: 1 };
    }
    return { modifiedCount: 1 };
  };
  HouseholdWeeklyProgress.findById = () => ({ lean: async () => progressSnapshot() });

  return {
    state,
    restore() {
      Household.findById = originals.householdFindById;
      Household.updateOne = originals.householdUpdateOne;
      BitesTransaction.findOneAndUpdate = originals.transactionFindOneAndUpdate;
      BitesTransaction.findOne = originals.transactionFindOne;
      HouseholdWeeklyProgress.updateOne = originals.progressUpdateOne;
      HouseholdWeeklyProgress.findById = originals.progressFindById;
    }
  };
}

test("the real weekly bonus route creates a key and recovers a failed ledger", async () => {
  const fake = installFakeModels();
  try {
    const challenges = [
      { _id: "main-id", key: "weekly_main", triggerType: "meal_planned", rewardBites: 10 },
      { _id: "bonus-id", key: "weekly_bonus", triggerType: "bonus", rewardBites: 30 }
    ];
    fake.state.failNextLedgerWrite = true;

    await assert.rejects(
      checkAndGrantBonus("household-1", fake.state.progress, challenges, 30),
      /injected ledger failure/
    );
    assert.equal(fake.state.balance, 30);
    assert.equal(fake.state.transactions.size, 0);

    const bonusEntry = fake.state.progress.completedChallenges.find((entry) => entry.challengeKey === "weekly_bonus");
    assert.equal(bonusEntry.rewardIdempotencyKey, "weekly-progress:progress-1:weekly_bonus");
    assert.equal(bonusEntry.rewardGranted, false);

    await checkAndGrantBonus("household-1", fake.state.progress, challenges, 30);
    assert.equal(fake.state.balance, 30);
    assert.equal(fake.state.transactions.size, 1);
    assert.equal(bonusEntry.rewardGranted, true);
    const transaction = [...fake.state.transactions.values()][0];
    assert.equal(transaction.metadata.idempotencyKey, "weekly-progress:progress-1:weekly_bonus");
    assert.equal(transaction.metadata.actualGranted, 30);
  } finally {
    fake.restore();
  }
});
