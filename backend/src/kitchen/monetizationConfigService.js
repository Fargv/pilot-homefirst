import { MonetizationConfig } from "./models/MonetizationConfig.js";

export const DEFAULT_SUBSCRIPTIONS_ENABLED = true;
const CONFIG_KEY = "default";
const CACHE_TTL_MS = 30_000;

let cachedSubscriptionsEnabled = DEFAULT_SUBSCRIPTIONS_ENABLED;
let cacheExpiresAt = 0;
let pendingRead = null;

function parseSubscriptionsEnabled(value) {
  return typeof value === "boolean" ? value : DEFAULT_SUBSCRIPTIONS_ENABLED;
}

/**
 * Reads the persisted switch once per short cache window. A missing document
 * is created with the conservative default; read/write failures fail open so
 * a configuration outage cannot unexpectedly remove current access.
 */
export async function getSubscriptionsEnabled({ forceRefresh = false } = {}) {
  if (!forceRefresh && cacheExpiresAt > Date.now()) return cachedSubscriptionsEnabled;
  if (pendingRead) return pendingRead;

  pendingRead = (async () => {
    try {
      const document = await MonetizationConfig.findOneAndUpdate(
        { key: CONFIG_KEY },
        { $setOnInsert: { key: CONFIG_KEY, subscriptionsEnabled: DEFAULT_SUBSCRIPTIONS_ENABLED } },
        { upsert: true, new: true, setDefaultsOnInsert: true }
      ).lean();
      cachedSubscriptionsEnabled = parseSubscriptionsEnabled(document?.subscriptionsEnabled);
    } catch (error) {
      cachedSubscriptionsEnabled = DEFAULT_SUBSCRIPTIONS_ENABLED;
      console.error("[monetization] config read failed; using conservative default", error.message);
    } finally {
      cacheExpiresAt = Date.now() + CACHE_TTL_MS;
      pendingRead = null;
    }
    return cachedSubscriptionsEnabled;
  })();

  return pendingRead;
}

export function resetMonetizationConfigCache() {
  cachedSubscriptionsEnabled = DEFAULT_SUBSCRIPTIONS_ENABLED;
  cacheExpiresAt = 0;
  pendingRead = null;
}
