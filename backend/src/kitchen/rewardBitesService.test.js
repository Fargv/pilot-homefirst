import assert from "node:assert/strict";
import test from "node:test";
import { Household } from "./models/Household.js";
import { BitesTransaction } from "./models/BitesTransaction.js";
import { grantRewardBites } from "./rewardBitesService.js";

function installFakeModels() {
  const state = {
    balance: 0,
    purchased: 0,
    rewardKeys: new Set(),
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
    grantedBitesRewardKeys: [...state.rewardKeys]
  });

  Household.findById = () => ({ lean: async () => snapshot() });
  Household.updateOne = async (filter, update) => {
    const key = filter.grantedBitesRewardKeys?.$ne;
    if (key && state.rewardKeys.has(key)) return { modifiedCount: 0 };
    const amount = update[0].$set.freeBitesBalance.$min[0].$add[1];
    state.balance = Math.min(state.balance + amount, 500);
    if (key) state.rewardKeys.add(key);
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
  } finally {
    fake.restore();
  }
});
