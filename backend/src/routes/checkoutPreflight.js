import {
  buildSubscriptionsDisabledPayload,
  isSubscriptionCheckoutBlocked
} from "../kitchen/subscriptionCommerceCore.js";

const VALID_TYPES = ["pack", "subscription", "bites"];

export function createCheckoutPreflight({
  isPaymentsEnabled = () => true,
  getSubscriptionsEnabled = async () => true
} = {}) {
  return async function checkoutPreflight(req, res, next) {
    try {
      if (!isPaymentsEnabled()) {
        return res.status(403).json({
          ok: false,
          code: "PAYMENTS_DISABLED",
          error: "Los pagos no están activados en este entorno."
        });
      }

      const { type } = req.body || {};
      if (!type || !VALID_TYPES.includes(type)) {
        return res.status(400).json({
          ok: false,
          error: `Tipo de pago inválido. Valores permitidos: ${VALID_TYPES.join(", ")}.`
        });
      }

      if (isSubscriptionCheckoutBlocked(type, await getSubscriptionsEnabled())) {
        return res.status(403).json(buildSubscriptionsDisabledPayload());
      }

      return next();
    } catch (error) {
      return next(error);
    }
  };
}
