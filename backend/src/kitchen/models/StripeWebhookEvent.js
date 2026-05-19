import mongoose from "mongoose";

const { Schema } = mongoose;

const stripeWebhookEventSchema = new Schema({
  eventId: { type: String, required: true, unique: true },
  eventType: { type: String, default: "" },
  processedAt: { type: Date, default: Date.now }
});

// Auto-delete after 7 days — matches Stripe's webhook retry window
stripeWebhookEventSchema.index({ processedAt: 1 }, { expireAfterSeconds: 7 * 24 * 60 * 60 });

export const StripeWebhookEvent = mongoose.model("StripeWebhookEvent", stripeWebhookEventSchema);
