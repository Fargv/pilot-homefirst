export const DEFAULT_SUBSCRIPTIONS_ENABLED = true;
export const SUBSCRIPTION_FUNCTIONAL_CAPABILITIES = Object.freeze([
  "budget", "fullWeekRandomization", "singleDayRandomization",
  "dietRandomization", "dinners", "basics"
]);

export function createSubscriptionsConfigReader({ read, cacheTtlMs = 30_000, logger = console } = {}) {
  let cachedValue = DEFAULT_SUBSCRIPTIONS_ENABLED;
  let cacheExpiresAt = 0;
  let pendingRead = null;
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
      pendingRead = readValue().then((value) => {
        cachedValue = value;
        cacheExpiresAt = Date.now() + cacheTtlMs;
        return value;
      }).finally(() => { pendingRead = null; });
      return pendingRead;
    },
    reset() { cachedValue = DEFAULT_SUBSCRIPTIONS_ENABLED; cacheExpiresAt = 0; pendingRead = null; }
  };
}
