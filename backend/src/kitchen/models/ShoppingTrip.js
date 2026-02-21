import mongoose from "mongoose";

const ShoppingTripSchema = new mongoose.Schema(
  {
    householdId: { type: mongoose.Schema.Types.ObjectId, ref: "Household", index: true, required: true },
    storeId: { type: mongoose.Schema.Types.ObjectId, ref: "Store", default: null },
    totalAmount: { type: Number, default: null },
    currency: { type: String, default: "EUR" },
    startedAt: { type: Date, default: Date.now },
    closedAt: { type: Date, default: null },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "KitchenUser", required: true },
    notes: { type: String, default: "" }
  },
  { timestamps: true }
);

ShoppingTripSchema.index({ householdId: 1, closedAt: 1, startedAt: -1 });

export const ShoppingTrip = mongoose.model("ShoppingTrip", ShoppingTripSchema, "shoppingTrips");
