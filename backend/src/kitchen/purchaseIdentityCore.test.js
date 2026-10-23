import assert from "node:assert/strict";
import test from "node:test";
import { buildPurchaseIdempotencyKey } from "./purchaseIdentityCore.js";

test("payment retries reuse the PurchaseAttempt identity", () => {
  assert.equal(
    buildPurchaseIdempotencyKey({ purchaseAttemptId: "attempt-1" }),
    "purchase:attempt-1"
  );
  assert.equal(
    buildPurchaseIdempotencyKey({ purchaseAttemptId: "attempt-1", idempotencyKey: "purchase:attempt-1" }),
    "purchase:attempt-1"
  );
});

test("purchased Bites cannot be granted without a persistent payment identity", () => {
  assert.throws(
    () => buildPurchaseIdempotencyKey({}),
    (error) => error.code === "PURCHASE_ATTEMPT_ID_REQUIRED" && error.statusCode === 400
  );
});
