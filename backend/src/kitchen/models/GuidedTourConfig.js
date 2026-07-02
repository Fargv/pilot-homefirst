import mongoose from "mongoose";

// Singleton (key "default") global switch for the guided tour, editable from
// the DIOD admin panel. When disabled, the tour never auto-launches — not even
// for brand-new households — and admin resends are rejected.
const GuidedTourConfig = mongoose.model(
  "GuidedTourConfig",
  new mongoose.Schema(
    {
      key: { type: String, required: true, unique: true, default: "default" },
      enabled: { type: Boolean, default: true },
      version: { type: Number, default: 1, min: 1 },
      updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: "KitchenUser", default: null }
    },
    { timestamps: true }
  )
);

export { GuidedTourConfig };
