import mongoose from "mongoose";

const WeeklyCycleConfig = mongoose.model(
  "WeeklyCycleConfig",
  new mongoose.Schema(
    {
      key: { type: String, required: true, unique: true, default: "default" },
      cycleStartDate: { type: Date, required: true }, // a Monday; week 1 of cycle starts here
      paused: { type: Boolean, default: false },
      bonusBites: { type: Number, default: 5, min: 0 }
    },
    { timestamps: true }
  )
);

export { WeeklyCycleConfig };
