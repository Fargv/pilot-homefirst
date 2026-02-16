import mongoose from "mongoose";

const KitchenAuditLogSchema = new mongoose.Schema(
  {
    action: { type: String, required: true },
    actorUserId: { type: mongoose.Schema.Types.ObjectId, ref: "KitchenUser" },
    data: { type: Object, default: {} },
    householdId: { type: mongoose.Schema.Types.ObjectId, ref: "Household", index: true }
  },
  { timestamps: true }
);

export const KitchenAuditLog = mongoose.model("KitchenAuditLog", KitchenAuditLogSchema);
