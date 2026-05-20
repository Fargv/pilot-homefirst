import mongoose from "mongoose";

const OnboardingSuggestionSchema = new mongoose.Schema(
  {
    type: { type: String, enum: ["ingredient", "dish"], required: true },
    text: { type: String, required: true, trim: true },
    active: { type: Boolean, default: true },
    order: { type: Number, default: 0 }
  },
  { timestamps: true }
);

OnboardingSuggestionSchema.index({ type: 1, active: 1, order: 1 });

export const OnboardingSuggestion = mongoose.model("OnboardingSuggestion", OnboardingSuggestionSchema);
