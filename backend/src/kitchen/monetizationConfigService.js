import { MonetizationConfig } from "./models/MonetizationConfig.js";
import {
  createSubscriptionsConfigReader,
  DEFAULT_SUBSCRIPTIONS_ENABLED
} from "./monetizationConfigCore.js";
import {
  MONETIZATION_CONFIG_KEY,
  buildSubscriptionsEnabledUpdate,
  serializeMonetizationConfig
} from "./monetizationConfigAdminCore.js";
export { DEFAULT_SUBSCRIPTIONS_ENABLED };

/**
 * Reads the persisted switch once per short cache window. A missing document
 * uses the conservative default; read failures fail open so
 * a configuration outage cannot unexpectedly remove current access.
 */
const reader = createSubscriptionsConfigReader({ read: () => MonetizationConfig.findOne({ key: "default" }).lean() });
export const getSubscriptionsEnabled = reader.getSubscriptionsEnabled;
export const resetMonetizationConfigCache = reader.reset;

function leanIfSupported(query) {
  return typeof query?.lean === "function" ? query.lean() : query;
}

export function createMonetizationConfigStore({
  model = MonetizationConfig,
  resetCache = resetMonetizationConfigCache
} = {}) {
  return {
    async read() {
      const document = await leanIfSupported(model.findOne({ key: MONETIZATION_CONFIG_KEY }));
      // A missing document is a valid state. Reading must not create one.
      return serializeMonetizationConfig(document);
    },

    async update({ subscriptionsEnabled, updatedBy }) {
      const update = buildSubscriptionsEnabledUpdate({ subscriptionsEnabled, updatedBy });
      const document = await model.findOneAndUpdate(
        { key: MONETIZATION_CONFIG_KEY },
        {
          $set: update,
          $setOnInsert: { key: MONETIZATION_CONFIG_KEY }
        },
        {
          new: true,
          upsert: true,
          runValidators: true,
          setDefaultsOnInsert: true
        }
      );

      // This invalidates the current process. Other Render instances may
      // still serve their short-lived cached value until their TTL expires;
      // callers must not assume cross-process invalidation is immediate.
      resetCache();
      return serializeMonetizationConfig(document);
    }
  };
}

const monetizationConfigStore = createMonetizationConfigStore();
export const getMonetizationConfig = monetizationConfigStore.read;
export const updateSubscriptionsEnabled = monetizationConfigStore.update;
