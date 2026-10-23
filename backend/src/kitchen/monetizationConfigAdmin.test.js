import assert from "node:assert/strict";
import { createServer } from "node:http";
import test from "node:test";
import { app } from "../index.js";
import { requireDiod } from "./middleware.js";
import {
  buildSubscriptionsEnabledUpdate,
  parseStrictBoolean
} from "./monetizationConfigAdminCore.js";
import {
  createMonetizationConfigStore
} from "./monetizationConfigService.js";
import { createSubscriptionsConfigReader } from "./monetizationConfigCore.js";
import { resolveHouseholdCapabilities } from "./capabilityResolver.js";

function createResponse() {
  return {
    statusCode: 200,
    body: null,
    status(code) { this.statusCode = code; return this; },
    json(body) { this.body = body; return this; }
  };
}

test("monetization endpoints reject unauthenticated access", async (t) => {
  const server = createServer(app);
  await new Promise((resolve) => server.listen(0, resolve));
  t.after(() => server.close());
  const { port } = server.address();

  const response = await fetch(`http://127.0.0.1:${port}/api/admin/monetization-config`);
  assert.equal(response.status, 401);
});

test("monetization access is DIOD-only", () => {
  const unauthorized = createResponse();
  let nextCalls = 0;
  requireDiod({ kitchenUser: null }, unauthorized, () => { nextCalls += 1; });
  assert.equal(unauthorized.statusCode, 401);
  assert.equal(nextCalls, 0);

  const member = createResponse();
  requireDiod({ kitchenUser: { globalRole: null } }, member, () => { nextCalls += 1; });
  assert.equal(member.statusCode, 403);
  assert.equal(nextCalls, 0);

  const diod = createResponse();
  requireDiod({ kitchenUser: { globalRole: "diod" } }, diod, () => { nextCalls += 1; });
  assert.equal(diod.statusCode, 200);
  assert.equal(nextCalls, 1);
});

test("strict boolean validation rejects strings, numbers, and missing values", () => {
  assert.deepEqual(parseStrictBoolean(true), { ok: true, value: true });
  assert.deepEqual(parseStrictBoolean(false), { ok: true, value: false });
  for (const invalid of ["true", "false", 1, 0, null, undefined, {}]) {
    assert.deepEqual(parseStrictBoolean(invalid), { ok: false, value: null });
    assert.throws(
      () => buildSubscriptionsEnabledUpdate({ subscriptionsEnabled: invalid, updatedBy: "admin" }),
      /booleano estricto/
    );
  }
});

test("read uses the default without persisting a document", async () => {
  let reads = 0;
  let writes = 0;
  const store = createMonetizationConfigStore({
    model: {
      findOne() {
        reads += 1;
        return { lean: async () => null };
      },
      async findOneAndUpdate() {
        writes += 1;
        return null;
      }
    },
    resetCache() {}
  });

  assert.deepEqual(await store.read(), {
    key: "default",
    subscriptionsEnabled: true,
    updatedBy: null,
    updatedAt: null
  });
  assert.equal(reads, 1);
  assert.equal(writes, 0);
});

test("update persists actor and timestamps, then invalidates local cache", async () => {
  let updateArgs = null;
  let resetCalls = 0;
  const updatedAt = new Date("2026-10-23T10:00:00.000Z");
  const store = createMonetizationConfigStore({
    model: {
      findOne() { return { lean: async () => null }; },
      async findOneAndUpdate(...args) {
        updateArgs = args;
        return {
          key: "default",
          subscriptionsEnabled: args[1].$set.subscriptionsEnabled,
          updatedBy: args[1].$set.updatedBy,
          updatedAt
        };
      }
    },
    resetCache() { resetCalls += 1; }
  });

  const result = await store.update({ subscriptionsEnabled: false, updatedBy: "507f1f77bcf86cd799439011" });
  assert.equal(result.subscriptionsEnabled, false);
  assert.equal(result.updatedBy, "507f1f77bcf86cd799439011");
  assert.equal(result.updatedAt, updatedAt);
  assert.equal(updateArgs[0].key, "default");
  assert.equal(updateArgs[1].$set.subscriptionsEnabled, false);
  assert.equal(updateArgs[1].$set.updatedBy, "507f1f77bcf86cd799439011");
  assert.equal(updateArgs[2].upsert, true);
  assert.equal(resetCalls, 1);
});

test("cache invalidation is reversible and does not depend on process-local state", async () => {
  let persisted = true;
  const reader = createSubscriptionsConfigReader({ read: async () => ({ subscriptionsEnabled: persisted }) });

  assert.equal(await reader.getSubscriptionsEnabled(), true);
  persisted = false;
  // A separate process would keep its short-lived cache until its TTL; an
  // update in this process explicitly resets its own reader.
  reader.reset();
  assert.equal(await reader.getSubscriptionsEnabled(), false);
  persisted = true;
  reader.reset();
  assert.equal(await reader.getSubscriptionsEnabled(), true);
});

test("switch reversibility never mutates active subscription or catalog purchase state", async () => {
  const household = {
    subscriptionPlan: "pro",
    subscriptionStatus: "active",
    stripeSubscriptionId: "sub_real_or_test_untouched",
    subscriptionEndsAt: new Date("2027-01-01T00:00:00.000Z"),
    catalogIncludedPacks: ["pack-owned"]
  };
  const before = structuredClone(household);

  const off = await resolveHouseholdCapabilities(household, { subscriptionsEnabled: false });
  const on = await resolveHouseholdCapabilities(household, { subscriptionsEnabled: true });

  assert.equal(off.subscriptionsEnabled, false);
  assert.equal(on.subscriptionsEnabled, true);
  assert.deepEqual(household, before);
  assert.equal(off.catalogIncludedPacks, null);
  assert.equal(on.catalogIncludedPacks, null);
});
