import mongoose from "mongoose";

const BetaInviteSchema = new mongoose.Schema({
  email: { type: String, required: true, lowercase: true, trim: true, index: true },
  token: { type: String, required: true, unique: true, index: true },
  status: { type: String, enum: ["pending", "sent", "used", "revoked"], default: "pending", index: true },
  expiresAt: { type: Date, required: true, index: true },
  usedAt: { type: Date, default: null },
  usedByUserId: { type: mongoose.Schema.Types.ObjectId, default: null },
  createdHouseholdId: { type: mongoose.Schema.Types.ObjectId, default: null },
  createdByAdminId: { type: mongoose.Schema.Types.ObjectId, default: null },
  sentAt: { type: Date, default: null },
  note: { type: String, default: "", trim: true },
}, { timestamps: true });

export const BetaInvite = mongoose.model("BetaInvite", BetaInviteSchema);
