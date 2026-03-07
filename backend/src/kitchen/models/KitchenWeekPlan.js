import mongoose from "mongoose";

const IngredientOverrideSchema = new mongoose.Schema(
  {
    displayName: { type: String, required: true, trim: true },
    canonicalName: { type: String, required: true, index: true },
    ingredientId: { type: mongoose.Schema.Types.ObjectId, ref: "KitchenIngredient" },
    status: { type: String, enum: ["need", "have", "bought"], default: "need" }
  },
  { _id: false }
);

const WeekDaySchema = new mongoose.Schema(
  {
    date: { type: Date, required: true },
    mealType: { type: String, enum: ["lunch", "dinner"], default: "lunch" },
    cookUserId: { type: mongoose.Schema.Types.ObjectId, ref: "KitchenUser" },
    attendeeIds: { type: [mongoose.Schema.Types.ObjectId], ref: "KitchenUser" },
    attendeeCount: { type: Number },
    cookTiming: { type: String, enum: ["previous_day", "same_day"], default: "previous_day" },
    servings: { type: Number, default: 4 },
    mainDishId: { type: mongoose.Schema.Types.ObjectId, ref: "KitchenDish" },
    includeMainIngredients: { type: Boolean, default: true },
    sideDishId: { type: mongoose.Schema.Types.ObjectId, ref: "KitchenDish" },
    includeSideIngredients: { type: Boolean, default: true },
    isLeftovers: { type: Boolean, default: false },
    leftoversSourceDate: { type: Date, default: null },
    leftoversSourceMealType: { type: String, enum: ["lunch", "dinner", null], default: null },
    leftoversSourceDishId: { type: mongoose.Schema.Types.ObjectId, ref: "KitchenDish", default: null },
    leftoversSourceDishName: { type: String, default: null, trim: true },
    ingredientOverrides: { type: [IngredientOverrideSchema], default: [] },
    baseIngredientExclusions: { type: [String], default: [] }
  },
  { _id: false }
);

const KitchenWeekPlanSchema = new mongoose.Schema(
  {
    weekStart: { type: Date, required: true },
    householdId: { type: mongoose.Schema.Types.ObjectId, ref: "Household", index: true },
    days: { type: [WeekDaySchema], default: [] }
  },
  { timestamps: true }
);

KitchenWeekPlanSchema.index(
  { householdId: 1, weekStart: 1 },
  { unique: true, partialFilterExpression: { householdId: { $exists: true } } }
);

export const KitchenWeekPlan = mongoose.model("KitchenWeekPlan", KitchenWeekPlanSchema);
