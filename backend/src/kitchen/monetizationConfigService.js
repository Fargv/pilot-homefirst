import { MonetizationConfig } from "./models/MonetizationConfig.js";
import { createSubscriptionsConfigReader, DEFAULT_SUBSCRIPTIONS_ENABLED } from "./monetizationConfigCore.js";
export { DEFAULT_SUBSCRIPTIONS_ENABLED };

/**
 * Reads the persisted switch once per short cache window. A missing document
 * uses the conservative default; read failures fail open so
 * a configuration outage cannot unexpectedly remove current access.
 */
const reader = createSubscriptionsConfigReader({ read: () => MonetizationConfig.findOne({ key: "default" }).lean() });
export const getSubscriptionsEnabled = reader.getSubscriptionsEnabled;
export const resetMonetizationConfigCache = reader.reset;
