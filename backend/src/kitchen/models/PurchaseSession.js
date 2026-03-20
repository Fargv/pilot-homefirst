import mongoose from "mongoose";

const PurchaseSessionSchema = new mongoose.Schema(
  {
    householdId: { type: mongoose.Schema.Types.ObjectId, ref: "Household", required: true, index: true },
    weekStart: { type: Date, required: true, index: true },
    status: {
      type: String,
      enum: ["draft", "pending_confirmation", "completed", "cancelled"],
      default: "draft",
      index: true
    },
    itemIds: { type: [mongoose.Schema.Types.ObjectId], default: [] },
    storeId: { type: mongoose.Schema.Types.ObjectId, ref: "Store", default: null },
    amount: { type: Number, min: 0, default: null },
    createdByUserId: { type: mongoose.Schema.Types.ObjectId, ref: "KitchenUser", default: null },
    updatedByUserId: { type: mongoose.Schema.Types.ObjectId, ref: "KitchenUser", default: null },
    completedByUserId: { type: mongoose.Schema.Types.ObjectId, ref: "KitchenUser", default: null },
    promptedAt: { type: Date, default: null },
    completedAt: { type: Date, default: null }
  },
  { timestamps: true }
);

PurchaseSessionSchema.index({ householdId: 1, status: 1, updatedAt: -1 });
PurchaseSessionSchema.index({ householdId: 1, completedAt: -1 });

export const PurchaseSession = mongoose.model("PurchaseSession", PurchaseSessionSchema);
