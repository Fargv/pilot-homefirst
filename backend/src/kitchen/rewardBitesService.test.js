import assert from "node:assert/strict";
import test from "node:test";
import { Household } from "./models/Household.js";
import { BitesTransaction } from "./models/BitesTransaction.js";
import { grantRewardBites } from "./rewardBitesService.js";

function installFakeModels({ balance = 0 } = {}) {
  const state = {
    balance,
    purchased: 0,
    rewardKeys: new Set(),
    rewardClaims: new Map(),
    transactions: new Map(),
    failNextLedgerWrite: false
  };
  const originals = {
    findById: Household.findById,
    updateOne: Household.updateOne,
    findOneAndUpdate: BitesTransaction.findOneAndUpdate,
    findOne: BitesTransaction.findOne
  };
  const snapshot = () => ({
    _id: "household-1",
    freeBitesBalance: state.balance,
    purchasedBitesBalance: state.purchased,
    grantedBitesRewardKeys: [...state.rewardKeys],
    grantedBitesRewardClaims: [...state.rewardClaims.values()]
  });

  Household.findById = () => ({ lean: async () => snapshot() });
  Household.updateOne = async (filter, update) => {
    const key = filter.grantedBitesRewardKeys?.$ne;
    if (key && state.rewardKeys.has(key)) return { modifiedCount: 0 };
    const amount = update[0].$set.grantedBitesRewardClaims.$concatArrays[1][0].requestedAmount;
    const actualGranted = Math.min(amount, Math.max(0, 500 - state.balance));
    state.balance += actualGranted;
    if (key) {
      state.rewardKeys.add(key);
      state.rewardClaims.set(key, {
        key,
        requestedAmount: amount,
        actualGranted,
        balanceAfterFree: state.balance,
        balanceAfterPurchased: state.purchased
      });
    }
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

  return {
    state,
    restore() {
      Household.findById = originals.findById;
      Household.updateOne = originals.updateOne;
      BitesTransaction.findOneAndUpdate = originals.findOneAndUpdate;
      BitesTransaction.findOne = originals.findOne;
    }
  };
}

test("concurrent reward claims credit once and create one ledger entry", async () => {
  const fake = installFakeModels();
  try {
    await Promise.all([
      grantRewardBites({ householdId: "household-1", amount: 25, type: "challenge_reward", reason: "weekly", idempotencyKey: "weekly:h:1" }),
      grantRewardBites({ householdId: "household-1", amount: 25, type: "challenge_reward", reason: "weekly", idempotencyKey: "weekly:h:1" })
    ]);
    assert.equal(fake.state.balance, 25);
    assert.equal(fake.state.transactions.size, 1);
    const transaction = [...fake.state.transactions.values()][0];
    assert.equal(transaction.amount, 25);
    assert.equal(transaction.metadata.actualGranted, 25);
    assert.equal(transaction.balanceAfterFree, 25);
  } finally {
    fake.restore();
  }
});

test("a ledger failure after the balance claim is repaired without a second credit", async () => {
  const fake = installFakeModels();
  try {
    fake.state.failNextLedgerWrite = true;
    await assert.rejects(
      grantRewardBites({ householdId: "household-1", amount: 20, type: "onboarding_reward", reason: "welcome", idempotencyKey: "onboarding:h:welcome" }),
      /injected ledger failure/
    );
    assert.equal(fake.state.balance, 20);
    assert.equal(fake.state.transactions.size, 0);

    const retry = await grantRewardBites({ householdId: "household-1", amount: 20, type: "onboarding_reward", reason: "welcome", idempotencyKey: "onboarding:h:welcome" });
    assert.equal(retry.recovered, true);
    assert.equal(fake.state.balance, 20);
    assert.equal(fake.state.transactions.size, 1);
    const transaction = [...fake.state.transactions.values()][0];
    assert.equal(transaction.amount, 20);
    assert.equal(transaction.metadata.actualGranted, 20);
    assert.equal(transaction.balanceAfterFree, 20);
  } finally {
    fake.restore();
  }
});

test("ledger recovery preserves the capped amount and original snapshot", async () => {
  const fake = installFakeModels({ balance: 490 });
  try {
    fake.state.failNextLedgerWrite = true;
    await assert.rejects(
      grantRewardBites({ householdId: "household-1", amount: 25, type: "challenge_reward", reason: "near-cap", idempotencyKey: "weekly:h:cap" }),
      /injected ledger failure/
    );
    assert.equal(fake.state.balance, 500);

    const retry = await grantRewardBites({ householdId: "household-1", amount: 25, type: "challenge_reward", reason: "near-cap", idempotencyKey: "weekly:h:cap" });
    assert.equal(retry.recovered, true);
    assert.equal(fake.state.balance, 500);
    const transaction = [...fake.state.transactions.values()][0];
    assert.equal(transaction.amount, 10);
    assert.equal(transaction.metadata.rewardBites, 25);
    assert.equal(transaction.metadata.actualGranted, 10);
    assert.equal(transaction.metadata.capped, true);
    assert.equal(transaction.balanceAfterFree, 500);
    assert.equal(transaction.balanceAfterPurchased, 0);
  } finally {
    fake.restore();
  }
});

test("concurrent capped claims create one exact ledger entry", async () => {
  const fake = installFakeModels({ balance: 490 });
  try {
    await Promise.all([
      grantRewardBites({ householdId: "household-1", amount: 25, type: "challenge_reward", reason: "near-cap", idempotencyKey: "weekly:h:cap-concurrent" }),
      grantRewardBites({ householdId: "household-1", amount: 25, type: "challenge_reward", reason: "near-cap", idempotencyKey: "weekly:h:cap-concurrent" })
    ]);
    assert.equal(fake.state.balance, 500);
    assert.equal(fake.state.transactions.size, 1);
    const transaction = [...fake.state.transactions.values()][0];
    assert.equal(transaction.amount, 10);
    assert.equal(transaction.metadata.actualGranted, 10);
    assert.equal(transaction.balanceAfterFree, 500);
  } finally {
    fake.restore();
  }
});

test("a legacy key without history is left pending instead of writing a false zero ledger", async () => {
  const fake = installFakeModels({ balance: 125 });
  try {
    fake.state.rewardKeys.add("legacy:missing-snapshot");
    await assert.rejects(
      grantRewardBites({ householdId: "household-1", amount: 25, type: "challenge_reward", reason: "legacy", idempotencyKey: "legacy:missing-snapshot" }),
      /falta su snapshot histórico/
    );
    assert.equal(fake.state.balance, 125);
    assert.equal(fake.state.transactions.size, 0);
  } finally {
    fake.restore();
  }
});

test("an existing ledger is detected before any wallet credit", async () => {
  const fake = installFakeModels({ balance: 125 });
  try {
    fake.state.transactions.set("legacy:ledger-exists", {
      _id: "legacy-tx",
      amount: 25,
      balanceAfterFree: 125,
      balanceAfterPurchased: 0,
      metadata: { idempotencyKey: "legacy:ledger-exists", actualGranted: 25 }
    });
    const result = await grantRewardBites({
      householdId: "household-1",
      amount: 25,
      type: "challenge_reward",
      reason: "legacy",
      idempotencyKey: "legacy:ledger-exists"
    });
    assert.equal(result.recovered, true);
    assert.equal(result.transactionId, "legacy-tx");
    assert.equal(fake.state.balance, 125);
  } finally {
    fake.restore();
  }
});
