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
  const readValue = async ({ failClosed = false } = {}) => {
    try {
      const document = await read();
      return typeof document?.subscriptionsEnabled === "boolean" ? document.subscriptionsEnabled : DEFAULT_SUBSCRIPTIONS_ENABLED;
    } catch (error) {
      logger.error("[monetization] config read failed; using conservative default", error.message);
      return failClosed ? false : DEFAULT_SUBSCRIPTIONS_ENABLED;
    }
  };
  return {
    getSubscriptionsEnabled({ forceRefresh = false, failClosed = false } = {}) {
      if (!forceRefresh && cacheExpiresAt > Date.now()) return Promise.resolve(cachedValue);
      if (pendingRead && forceRefresh) {
        // A critical caller (for example subscription checkout) must not join
        // a read that started before an admin switch. The old promise is left
        // to settle, but its generation is now stale and cannot repopulate
        // this reader's cache.
        generation += 1;
        pendingRead = null;
      }
      if (pendingRead) return pendingRead;
      const readGeneration = generation;
      pendingRead = readValue({ failClosed }).then((value) => {
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
