import mongoose from "mongoose";

const KitchenUserSchema = new mongoose.Schema(
  {
    username: { type: String, required: true, unique: true, trim: true },
    email: { type: String, unique: true, sparse: true, lowercase: true, trim: true, default: null },
    firstName: { type: String, trim: true },
    lastName: { type: String, trim: true },
    displayName: { type: String, required: true, trim: true },
    initials: { type: String, trim: true, default: "" },
    colorId: { type: String, trim: true, default: "" },
    isPlaceholder: { type: Boolean, default: false },
    claimedAt: { type: Date, default: null },
    passwordHash: { type: String, default: null },
    role: { type: String, enum: ["owner", "member", "admin", "user"], default: "member" },
    householdId: { type: mongoose.Schema.Types.ObjectId, ref: "Household" },
    createdByUserId: { type: mongoose.Schema.Types.ObjectId, ref: "KitchenUser", default: null },
    globalRole: { type: String, enum: ["diod", null], default: null },
    activeHouseholdId: { type: mongoose.Schema.Types.ObjectId, ref: "Household" }
  },
  { timestamps: true }
);

KitchenUserSchema.methods.toSafeJSON = function toSafeJSON() {
  return {
    id: this._id,
    username: this.username,
    email: this.email,
    firstName: this.firstName,
    lastName: this.lastName,
    displayName: this.displayName,
    initials: this.initials || "",
    colorId: this.colorId || "",
    isPlaceholder: this.isPlaceholder,
    claimedAt: this.claimedAt ?? null,
    role: this.role,
    householdId: this.householdId ?? null,
    createdByUserId: this.createdByUserId ?? null,
    globalRole: this.globalRole ?? null,
    activeHouseholdId: this.activeHouseholdId ?? null
  };
};

export const KitchenUser = mongoose.model("KitchenUser", KitchenUserSchema);
