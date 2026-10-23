export const DEFAULT_SUBSCRIPTIONS_ENABLED = true;
export const SUBSCRIPTION_FUNCTIONAL_CAPABILITIES = Object.freeze([
  "budget", "fullWeekRandomization", "singleDayRandomization",
  "dietRandomization", "dinners", "basics", "premiumThemes"
]);

export function createSubscriptionsConfigReader({ read, cacheTtlMs = 30_000, logger = console } = {}) {
  let cachedValue = DEFAULT_SUBSCRIPTIONS_ENABLED;
  let cacheExpiresAt = 0;
  let pendingRead = null;
  let generation = 0;
  const readValue = async () => {
    try {
      const document = await read();
      return typeof document?.subscriptionsEnabled === "boolean" ? document.subscriptionsEnabled : DEFAULT_SUBSCRIPTIONS_ENABLED;
    } catch (error) {
      logger.error("[monetization] config read failed; using conservative default", error.message);
      return DEFAULT_SUBSCRIPTIONS_ENABLED;
    }
  };
  return {
    getSubscriptionsEnabled({ forceRefresh = false } = {}) {
      if (!forceRefresh && cacheExpiresAt > Date.now()) return Promise.resolve(cachedValue);
      if (pendingRead) return pendingRead;
      const readGeneration = generation;
      pendingRead = readValue().then((value) => {
        // A write can invalidate this process while a read is in flight. Do
        // not let the older read repopulate the cache after that invalidation.
        // The already-started caller still receives its old snapshot; callers
        // needing the latest value must issue a new read after invalidation.
        if (readGeneration === generation) {
          cachedValue = value;
          cacheExpiresAt = Date.now() + cacheTtlMs;
        }
        return value;
      }).finally(() => {
        if (readGeneration === generation) pendingRead = null;
      });
      return pendingRead;
    },
    reset() {
      generation += 1;
      cachedValue = DEFAULT_SUBSCRIPTIONS_ENABLED;
      cacheExpiresAt = 0;
      pendingRead = null;
    }
  };
}
