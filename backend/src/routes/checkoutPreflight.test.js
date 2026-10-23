import assert from "node:assert/strict";
import test from "node:test";
import { createCheckoutPreflight } from "./checkoutPreflight.js";

function createResponse() {
  return {
    statusCode: 200,
    body: null,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(body) {
      this.body = body;
      return this;
    }
  };
}

async function invoke({ type, paymentsEnabled = true, subscriptionsEnabled = true, readSubscriptions = null }) {
  const req = { body: { type } };
  const res = createResponse();
  let nextCalls = 0;
  let nextError = null;
  const middleware = createCheckoutPreflight({
    isPaymentsEnabled: () => paymentsEnabled,
    getSubscriptionsEnabled: readSubscriptions || (async () => subscriptionsEnabled)
  });
  await middleware(req, res, (error) => {
    nextCalls += 1;
    nextError = error || null;
  });
  return { res, nextCalls, nextError };
}

test("checkout route blocks subscription when subscriptions are OFF", async () => {
  const result = await invoke({ type: "subscription", subscriptionsEnabled: false });
  assert.equal(result.res.statusCode, 403);
  assert.deepEqual(result.res.body, {
    ok: false,
    code: "SUBSCRIPTIONS_DISABLED",
    error: "Las suscripciones no están disponibles en este momento."
  });
  assert.equal(result.nextCalls, 0);
});

test("checkout route preserves pack and Bites when subscriptions are OFF", async () => {
  for (const type of ["pack", "bites"]) {
    const result = await invoke({ type, subscriptionsEnabled: false });
    assert.equal(result.res.statusCode, 200);
    assert.equal(result.res.body, null);
    assert.equal(result.nextCalls, 1);
    assert.equal(result.nextError, null);
  }
});

test("checkout route preserves subscriptions when the flag is ON", async () => {
  const result = await invoke({ type: "subscription", subscriptionsEnabled: true });
  assert.equal(result.res.statusCode, 200);
  assert.equal(result.nextCalls, 1);
  assert.equal(result.nextError, null);
});

test("checkout preflight still honors the existing payments switch", async () => {
  const result = await invoke({ type: "pack", paymentsEnabled: false, subscriptionsEnabled: false });
  assert.equal(result.res.statusCode, 403);
  assert.equal(result.res.body.code, "PAYMENTS_DISABLED");
  assert.equal(result.nextCalls, 0);
});

test("subscription checkout fails closed when the persisted switch cannot be read", async () => {
  const result = await invoke({
    type: "subscription",
    readSubscriptions: async ({ failClosed }) => {
      assert.equal(failClosed, true);
      return false;
    }
  });
  assert.equal(result.res.statusCode, 403);
  assert.equal(result.res.body.code, "SUBSCRIPTIONS_DISABLED");
  assert.equal(result.nextCalls, 0);
});

test("pack and Bites checkout stay independent when the switch cannot be read", async () => {
  for (const type of ["pack", "bites"]) {
    const result = await invoke({
      type,
      readSubscriptions: async () => { throw new Error("database unavailable"); }
    });
    assert.equal(result.res.statusCode, 200);
    assert.equal(result.nextCalls, 1);
    assert.equal(result.nextError, null);
  }
});
