import mongoose from "mongoose";

const IngredientOverrideSchema = new mongoose.Schema(
  {
    displayName: { type: String, required: true, trim: true },
    canonicalName: { type: String, required: true, index: true },
    status: { type: String, enum: ["need", "have", "bought"], default: "need" }
  },
  { _id: false }
);

const WeekDaySchema = new mongoose.Schema(
  {
    date: { type: Date, required: true },
    cookUserId: { type: mongoose.Schema.Types.ObjectId, ref: "KitchenUser" },
    cookTiming: { type: String, enum: ["previous_day", "same_day"], default: "previous_day" },
    servings: { type: Number, default: 4 },
    mainDishId: { type: mongoose.Schema.Types.ObjectId, ref: "KitchenDish" },
    sideDishId: { type: mongoose.Schema.Types.ObjectId, ref: "KitchenDish" },
    ingredientOverrides: { type: [IngredientOverrideSchema], default: [] }
  },
  { _id: false }
);

const KitchenWeekPlanSchema = new mongoose.Schema(
  {
    weekStart: { type: Date, required: true, unique: true },
    days: { type: [WeekDaySchema], default: [] }
  },
  { timestamps: true }
);

export const KitchenWeekPlan = mongoose.model("KitchenWeekPlan", KitchenWeekPlanSchema);
