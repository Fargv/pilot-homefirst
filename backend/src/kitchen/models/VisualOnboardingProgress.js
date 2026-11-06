import mongoose from "mongoose";

const VisualOnboardingProgressSchema = new mongoose.Schema(
  {
    householdId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Household",
      required: true
    },
    flowVersion: { type: Number, required: true, min: 1 },
    status: {
      type: String,
      enum: ["not_started", "in_progress", "completed", "skipped"],
      default: "not_started",
      required: true
    },
    currentStep: { type: Number, min: 0, max: 100, default: 0, required: true },
    // Draft-only answers. These are deliberately not household preferences.
    responses: {
      weekSelection: {
        type: String,
        enum: ["current_week", "next_week"],
        default: undefined
      }
    },
    revision: { type: Number, min: 0, default: 0, required: true }
  },
  { timestamps: true, strict: "throw" }
);

VisualOnboardingProgressSchema.index(
  { householdId: 1, flowVersion: 1 },
  { unique: true, name: "household_flow_version_unique" }
);

export const VisualOnboardingProgress = mongoose.model(
  "VisualOnboardingProgress",
  VisualOnboardingProgressSchema
);
