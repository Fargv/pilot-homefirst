import mongoose from "mongoose";

const InvitationSchema = new mongoose.Schema(
  {
    householdId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Household",
      required: true,
      index: true
    },
    tokenHash: { type: String, required: true, unique: true, index: true },
    role: { type: String, enum: ["member", "owner", "admin", "user"], default: "member" },
    createdByUserId: { type: mongoose.Schema.Types.ObjectId, ref: "KitchenUser", required: true },
    expiresAt: { type: Date, required: true, index: true },
    usedAt: { type: Date, default: null },
    usedByUserId: { type: mongoose.Schema.Types.ObjectId, ref: "KitchenUser", default: null }
  },
  { timestamps: true }
);

export const Invitation = mongoose.model("Invitation", InvitationSchema);
