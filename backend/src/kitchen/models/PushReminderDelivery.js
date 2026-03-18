import mongoose from "mongoose";

const PushReminderDeliverySchema = new mongoose.Schema(
  {
    reminderType: { type: String, required: true, trim: true },
    targetKey: { type: String, required: true, trim: true },
    userId: { type: mongoose.Schema.Types.ObjectId, ref: "KitchenUser", required: true, index: true },
    householdId: { type: mongoose.Schema.Types.ObjectId, ref: "Household", default: null, index: true },
    status: { type: String, enum: ["sent", "skipped"], default: "sent" },
    sentAt: { type: Date, default: () => new Date() },
    metadata: { type: mongoose.Schema.Types.Mixed, default: {} }
  },
  { timestamps: true }
);

PushReminderDeliverySchema.index(
  { reminderType: 1, userId: 1, householdId: 1, targetKey: 1 },
  { unique: true }
);

export const KitchenPushReminderDelivery = mongoose.model("KitchenPushReminderDelivery", PushReminderDeliverySchema);
