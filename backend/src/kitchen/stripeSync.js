import Stripe from "stripe";
import { config } from "../config.js";

let _stripe = null;

function getStripe() {
  if (!config.stripe.secretKey) return null;
  if (!_stripe) _stripe = new Stripe(config.stripe.secretKey);
  return _stripe;
}

export function isStripeSyncAvailable() {
  return Boolean(config.stripe.secretKey);
}

/**
 * Core: create/update a Stripe Product and create a new Price.
 * Prices are immutable in Stripe — a new Price is always created on sync.
 * The old Price is archived (set inactive) when replaced.
 *
 * @param {{ name, description?, stripeProductId?, stripePriceId?, unitAmountCents, currency, metadata? }} opts
 * @returns {{ stripeProductId: string, stripePriceId: string }}
 */
async function _syncToStripe({ name, description, stripeProductId, stripePriceId, unitAmountCents, currency, metadata }) {
  const stripe = getStripe();
  if (!stripe) throw new Error("Stripe no configurado — añade STRIPE_SECRET_KEY al servidor.");

  if (!Number.isFinite(unitAmountCents) || unitAmountCents <= 0) {
    throw new Error("El importe debe ser un número entero positivo en céntimos (ej: 999 = 9,99 €).");
  }

  const productName = String(name || "Producto").trim() || "Producto";
  const productDescription = String(description || "").trim() || undefined;
  const resolvedCurrency = String(currency || "eur").toLowerCase();
  let productId = String(stripeProductId || "").trim() || null;

  if (productId) {
    await stripe.products.update(productId, { name: productName, description: productDescription });
  } else {
    const product = await stripe.products.create({
      name: productName,
      description: productDescription,
      metadata: metadata || {}
    });
    productId = product.id;
  }

  const oldPriceId = String(stripePriceId || "").trim();
  if (oldPriceId.startsWith("price_")) {
    try { await stripe.prices.update(oldPriceId, { active: false }); } catch (_) {}
  }

  const price = await stripe.prices.create({
    product: productId,
    unit_amount: unitAmountCents,
    currency: resolvedCurrency,
    metadata: metadata || {}
  });

  return { stripeProductId: productId, stripePriceId: price.id };
}

/**
 * Syncs a CatalogPack to Stripe.
 * pack.priceAmount must be in cents (e.g. 999 = €9.99).
 */
export async function syncPackToStripe(pack) {
  return _syncToStripe({
    name: String(pack.slug || pack.title || "pack").trim(),
    description: pack.title || pack.description,
    stripeProductId: pack.stripeProductId,
    stripePriceId: pack.stripePriceId,
    unitAmountCents: Number(pack.priceAmount),
    currency: pack.currency,
    metadata: { packId: String(pack._id), slug: String(pack.slug || "") }
  });
}

/**
 * Syncs a Bites Bundle to Stripe.
 * bundle.price is in euros (e.g. 9.99), converted to cents internally.
 */
export async function syncBundleToStripe(bundle) {
  return _syncToStripe({
    name: bundle.name,
    stripeProductId: bundle.stripeProductId,
    stripePriceId: bundle.stripePriceId,
    unitAmountCents: Math.round(Number(bundle.price) * 100),
    currency: bundle.currency || "eur",
    metadata: { bundleId: String(bundle._id), type: "bites_bundle" }
  });
}

/**
 * Updates only the Stripe Product name/description (no price change).
 * Called when title or description changes without a price change.
 */
export async function updateStripeProduct(stripeProductId, { title, description } = {}) {
  const stripe = getStripe();
  if (!stripe || !stripeProductId) return false;
  try {
    await stripe.products.update(stripeProductId, {
      name: String(title || "Producto").trim() || "Producto",
      description: String(description || "").trim() || undefined
    });
    return true;
  } catch (err) {
    console.warn("[stripeSync] updateStripeProduct failed:", err.message);
    return false;
  }
}
