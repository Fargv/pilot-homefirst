import assert from "node:assert/strict";
import test from "node:test";
import { unlockPackWithBites } from "./bitesPackUnlockCore.js";

function createFakeWallet() {
  const state = { balance: 100, chargedKeys: new Set(), ownership: null, failDelivery: true };
  const spendBites = async (_householdId, amount, _reason, metadata) => {
    if (!state.chargedKeys.has(metadata.idempotencyKey)) {
      state.chargedKeys.add(metadata.idempotencyKey);
      state.balance -= amount;
    }
    return { wallet: { totalBites: state.balance } };
  };
  const upsertOwnership = async () => {
    if (state.failDelivery) {
      state.failDelivery = false;
      throw new Error("temporary ownership write failure");
    }
    state.ownership = { status: "owned" };
    return state.ownership;
  };
  return { state, spendBites, upsertOwnership };
}

test("a failed pack delivery can be retried without a second Bites charge", async () => {
  const fake = createFakeWallet();
  const pack = { _id: "pack-1", title: "Bienvenida", bitesCost: 40 };

  await assert.rejects(
    unlockPackWithBites({ householdId: "household-1", pack, spendBites: fake.spendBites, upsertOwnership: fake.upsertOwnership }),
    /temporary ownership write failure/
  );
  assert.equal(fake.state.balance, 60);

  const retry = await unlockPackWithBites({
    householdId: "household-1",
    pack,
    spendBites: fake.spendBites,
    upsertOwnership: fake.upsertOwnership
  });
  assert.equal(retry.ownership.status, "owned");
  assert.equal(fake.state.balance, 60);
  assert.deepEqual([...fake.state.chargedKeys], ["pack-unlock:household-1:pack-1"]);
});

test("concurrent unlock retries share one stable idempotency key", async () => {
  const fake = createFakeWallet();
  fake.state.failDelivery = false;
  const pack = { _id: "pack-2", title: "Pack", bitesCost: 25 };
  await Promise.all([
    unlockPackWithBites({ householdId: "household-1", pack, spendBites: fake.spendBites, upsertOwnership: fake.upsertOwnership }),
    unlockPackWithBites({ householdId: "household-1", pack, spendBites: fake.spendBites, upsertOwnership: fake.upsertOwnership })
  ]);
  assert.equal(fake.state.balance, 75);
  assert.equal(fake.state.chargedKeys.size, 1);
});
