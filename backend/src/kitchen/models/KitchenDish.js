import mongoose from "mongoose";

const IngredientSchema = new mongoose.Schema(
  {
    ingredientId: { type: mongoose.Schema.Types.ObjectId, ref: "KitchenIngredient" },
    displayName: { type: String, required: true, trim: true },
    canonicalName: { type: String, required: true, index: true }
  },
  { _id: false }
);

const KitchenDishSchema = new mongoose.Schema(
  {
    scope: {
      type: String,
      enum: ["master", "household", "override"],
      default: "household",
      index: true
    },
    householdId: { type: mongoose.Schema.Types.ObjectId, ref: "Household", index: true },
    masterId: { type: mongoose.Schema.Types.ObjectId, ref: "KitchenDish", index: true },
    name: { type: String, required: true, trim: true },
    dishCategoryId: { type: mongoose.Schema.Types.ObjectId, ref: "KitchenDishCategory", default: null, index: true },
    ingredients: { type: [IngredientSchema], default: [] },
    sidedish: { type: Boolean, default: false },
    isDinner: { type: Boolean, default: false },
    special: { type: Boolean, default: false },
    allowRandom: { type: Boolean, default: true },
    active: { type: Boolean, default: true },
    deletedAt: { type: Date, default: null },
    isArchived: { type: Boolean, default: false },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "KitchenUser" },
    source: { type: String, default: null },
    sourcePackId: { type: mongoose.Schema.Types.ObjectId, ref: "CatalogPack", default: null },
    sourcePackSlug: { type: String, default: null },
    sourcePackTitle: { type: String, default: null },
    sourceDishTemplateId: { type: String, default: null, index: true },
    catalogSyncedAt: { type: Date, default: null },
    catalogContentHash: { type: String, default: null },
    userModified: { type: Boolean, default: false, index: true },
    userModifiedAt: { type: Date, default: null },
    importedAt: { type: Date, default: null },
    importedBy: { type: mongoose.Schema.Types.ObjectId, ref: "KitchenUser", default: null },
    sourcePackColor: { type: String, default: null },
    sourcePackIsDietPack: { type: Boolean, default: false },
    recipe: {
      ingredients: {
        type: [{
          name: { type: String },
          quantity: { type: String },
          ingredientId: { type: mongoose.Schema.Types.ObjectId, ref: "KitchenIngredient", default: null },
          _id: false
        }],
        default: []
      },
      steps: { type: mongoose.Schema.Types.Mixed, default: null },
      servings: { type: Number, default: null }
    }
  },
  { timestamps: true }
);

KitchenDishSchema.index({ householdId: 1, scope: 1 });
KitchenDishSchema.index(
  { householdId: 1, masterId: 1, scope: 1 },
  { unique: true, partialFilterExpression: { scope: "override" } }
);

export const KitchenDish = mongoose.model("KitchenDish", KitchenDishSchema);
