import mongoose from "mongoose";

const KitchenUserSchema = new mongoose.Schema(
  {
    username: { type: String, required: true, unique: true, trim: true },
    email: { type: String, lowercase: true, trim: true, default: undefined },
    firstName: { type: String, trim: true },
    lastName: { type: String, trim: true },
    displayName: { type: String, required: true, trim: true },
    initials: { type: String, trim: true, default: "" },
    colorId: { type: String, trim: true, default: "" },
    type: { type: String, enum: ["placeholder", "user"], default: "user" },
    hasLogin: { type: Boolean, default: true },
    isPlaceholder: { type: Boolean, default: false },
    active: { type: Boolean, default: true },
    canCook: { type: Boolean, default: true },
    dinnerActive: { type: Boolean, default: true },
    dinnerCanCook: { type: Boolean, default: true },
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

KitchenUserSchema.index(
  { email: 1 },
  { unique: true, partialFilterExpression: { email: { $exists: true } } }
);

KitchenUserSchema.methods.toSafeJSON = function toSafeJSON() {
  const isPlaceholder = this.isPlaceholder || this.type === "placeholder";
  const active = typeof this.active === "boolean" ? this.active : true;
  const canCook = typeof this.canCook === "boolean" ? this.canCook : !isPlaceholder;
  const dinnerActive = typeof this.dinnerActive === "boolean" ? this.dinnerActive : true;
  const dinnerCanCook = typeof this.dinnerCanCook === "boolean" ? this.dinnerCanCook : !isPlaceholder;
  return {
    id: this._id,
    username: this.username,
    email: this.email,
    firstName: this.firstName,
    lastName: this.lastName,
    displayName: this.displayName,
    initials: this.initials || "",
    colorId: this.colorId || "",
    type: this.type || (this.isPlaceholder ? "placeholder" : "user"),
    hasLogin: typeof this.hasLogin === "boolean" ? this.hasLogin : !this.isPlaceholder,
    isPlaceholder: this.isPlaceholder,
    active,
    canCook,
    dinnerActive,
    dinnerCanCook,
    claimedAt: this.claimedAt ?? null,
    role: this.role,
    householdId: this.householdId ?? null,
    createdByUserId: this.createdByUserId ?? null,
    globalRole: this.globalRole ?? null,
    activeHouseholdId: this.activeHouseholdId ?? null
  };
};

export const KitchenUser = mongoose.model("KitchenUser", KitchenUserSchema);
