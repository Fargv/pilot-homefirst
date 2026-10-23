export const MONETIZATION_CONFIG_KEY = "default";

export function parseStrictBoolean(value) {
  if (typeof value === "boolean") return { ok: true, value };
  return { ok: false, value: null };
}

export function createInvalidSubscriptionsEnabledError() {
  const error = new Error("subscriptionsEnabled debe ser un booleano estricto.");
  error.code = "SUBSCRIPTIONS_ENABLED_INVALID";
  return error;
}

export function buildSubscriptionsEnabledUpdate({ subscriptionsEnabled, updatedBy }) {
  const parsed = parseStrictBoolean(subscriptionsEnabled);
  if (!parsed.ok) throw createInvalidSubscriptionsEnabledError();

  return {
    subscriptionsEnabled: parsed.value,
    updatedBy: updatedBy || null
  };
}

export function serializeMonetizationConfig(document) {
  return {
    key: MONETIZATION_CONFIG_KEY,
    subscriptionsEnabled: typeof document?.subscriptionsEnabled === "boolean"
      ? document.subscriptionsEnabled
      : true,
    updatedBy: document?.updatedBy ? String(document.updatedBy) : null,
    updatedAt: document?.updatedAt || null
  };
}
