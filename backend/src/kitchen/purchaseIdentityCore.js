export function buildPurchaseIdempotencyKey(metadata = {}) {
  const purchaseAttemptId = metadata?.purchaseAttemptId ? String(metadata.purchaseAttemptId).trim() : "";
  if (!purchaseAttemptId) {
    throw Object.assign(new Error("purchaseAttemptId es obligatorio para acreditar una compra."), {
      statusCode: 400,
      code: "PURCHASE_ATTEMPT_ID_REQUIRED"
    });
  }
  return `purchase:${purchaseAttemptId}`;
}
