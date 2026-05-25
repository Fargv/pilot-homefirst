import mongoose from "mongoose";

const HouseholdWeeklyProgress = mongoose.model(
  "HouseholdWeeklyProgress",
  new mongoose.Schema(
    {
      householdId: { type: mongoose.Schema.Types.ObjectId, ref: "Household", required: true },
      weekStart: { type: Date, required: true }, // the ISO Monday of this calendar week
      cycleWeekIndex: { type: Number, required: true, min: 1, max: 4 },

      // --- Accumulated counters for this calendar week ---
      mealsPlannedCount: { type: Number, default: 0 },    // unique filled lunch slots in week plan
      itemsPurchasedCount: { type: Number, default: 0 },  // unique items marked purchased (uses set)
      dishesCreatedCount: { type: Number, default: 0 },
      catalogPacksInstalledCount: { type: Number, default: 0 },
      ingredientsCreatedCount: { type: Number, default: 0 },
      manualShoppingItemAdded: { type: Boolean, default: false },
      shoppingListCompleted: { type: Boolean, default: false },
      catalogDishUsed: { type: Boolean, default: false },  // true once a catalog-sourced dish is used in the week plan

      // --- Pro curriculum counters ---
      weekRandomized: { type: Boolean, default: false },          // true once full-week randomization used
      basicCreated: { type: Boolean, default: false },            // true once first Básico created
      basicAddedToList: { type: Boolean, default: false },        // true once a Básico is added to the weekly list
      dinnersPlannedCount: { type: Number, default: 0 },          // unique filled dinner slots in week plan
      purchaseFinalizedWithStore: { type: Boolean, default: false }, // true once purchase finalized with store + amount
      budgetConfigured: { type: Boolean, default: false },         // true once weekly budget configured

      // --- Sets (deduplication) ---
      dishIdsUsedThisWeek: [{ type: mongoose.Schema.Types.ObjectId }], // unique dish IDs used in meal plans
      purchasedItemKeys: [{ type: String }],  // canonicalName of purchased items (deduplicate toggle)
      appActiveDays: [{ type: String }],       // ISO date strings "YYYY-MM-DD" of active days

      // --- Completion tracking ---
      completedChallenges: [
        {
          challengeId: { type: mongoose.Schema.Types.ObjectId },
          challengeKey: { type: String },
          completedAt: { type: Date },
          rewardBites: { type: Number },
          rewardGranted: { type: Boolean, default: false }
        }
      ],
      bonusGranted: { type: Boolean, default: false }
    },
    {
      timestamps: true,
      indexes: [{ unique: true, fields: { householdId: 1, weekStart: 1 } }]
    }
  )
);

HouseholdWeeklyProgress.collection
  .createIndex({ householdId: 1, weekStart: 1 }, { unique: true })
  .catch(() => {});

export { HouseholdWeeklyProgress };
