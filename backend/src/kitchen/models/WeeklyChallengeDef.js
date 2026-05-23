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
      planCompatibility: { type: [String], default: ["all"] } // ["all"] | ["basic"] | ["pro","premium"] etc
    },
    { timestamps: true }
  )
);

export { WeeklyChallengeDef };
