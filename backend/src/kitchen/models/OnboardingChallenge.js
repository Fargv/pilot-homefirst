import mongoose from "mongoose";

const OnboardingChallengeSchema = new mongoose.Schema(
  {
    key: { type: String, required: true, unique: true, trim: true },
    title: { type: String, required: true, trim: true },
    description: { type: String, default: "", trim: true },
    howTo: { type: String, default: "", trim: true },
    rewardBites: { type: Number, required: true, min: 0, default: 0 },
    order: { type: Number, required: true },
    phase: { type: Number, required: true, min: 1 },
    phaseLabel: { type: String, default: "" },
    triggerType: { type: String, required: true, trim: true },
    triggerCount: { type: Number, default: 1, min: 1 },
    active: { type: Boolean, default: true }
  },
  { timestamps: true }
);

export const OnboardingChallenge = mongoose.model("OnboardingChallenge", OnboardingChallengeSchema);
