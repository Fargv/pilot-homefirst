import mongoose from "mongoose";

const WeeklyChallengeDef = mongoose.model(
  "WeeklyChallengeDef",
  new mongoose.Schema(
    {
      key: { type: String, required: true, unique: true, trim: true },
      title: { type: String, required: true, trim: true },
      description: { type: String, default: "", trim: true },
      guidance: { type: String, default: "", trim: true },
      rewardBites: { type: Number, required: true, min: 0, default: 10 },
      triggerType: { type: String, required: true, trim: true },
      triggerCount: { type: Number, default: 1, min: 1 },
      cycleWeek: { type: Number, default: null, min: 1, max: 4 }, // null = pool/unassigned
      cycleOrder: { type: Number, default: 999 },
      active: { type: Boolean, default: true },
      // "basic" = shown only to basic/free users (basic curriculum)
      // "pro"   = shown only to pro/premium/beta_pro users (pro curriculum)
      curriculum: { type: String, enum: ["basic", "pro"], default: "basic" },
      // Preserved for backward compat and fine-grained gating within a curriculum.
      // ["all"] | ["basic"] | ["pro", "premium"] etc.
      planCompatibility: { type: [String], default: ["all"] }
    },
    { timestamps: true }
  )
);

export { WeeklyChallengeDef };
