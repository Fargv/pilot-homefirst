import mongoose from "mongoose";

const DishIngredientTemplateSchema = new mongoose.Schema(
  {
    ingredientId: { type: mongoose.Schema.Types.ObjectId, default: null },
    categoryId: { type: mongoose.Schema.Types.ObjectId, default: null },
    displayName: { type: String, required: true, trim: true },
    canonicalName: { type: String, required: true, trim: true }
  },
  { _id: false }
);

const RecipeIngredientTemplateSchema = new mongoose.Schema(
  {
    name: { type: String, trim: true },
    quantity: { type: String, trim: true }
  },
  { _id: false }
);

const DishTemplateSchema = new mongoose.Schema(
  {
    dishTemplateId: { type: String, default: null, trim: true },
    name: { type: String, required: true, trim: true },
    teaser: { type: String, default: "", trim: true },
    sidedish: { type: Boolean, default: false },
    isDinner: { type: Boolean, default: false },
    special: { type: Boolean, default: false },
    allowRandom: { type: Boolean, default: true },
    dishCategoryId: { type: mongoose.Schema.Types.ObjectId, default: null },
    ingredients: { type: [DishIngredientTemplateSchema], default: [] },
    recipe: {
      ingredients: { type: [RecipeIngredientTemplateSchema], default: [] },
      steps: { type: mongoose.Schema.Types.Mixed, default: null },
      servings: { type: Number, default: null }
    }
  },
  { _id: false }
);

const CatalogPackSchema = new mongoose.Schema(
  {
    slug: { type: String, required: true, unique: true, trim: true, lowercase: true },
    title: { type: String, required: true, trim: true },
    subtitle: { type: String, default: "", trim: true },
    description: { type: String, default: "", trim: true },
    coverImage: { type: String, default: null },
    tags: { type: [String], default: [] },
    cuisineType: { type: String, default: "", trim: true },
    status: {
      type: String,
      enum: ["draft", "needs_review", "ready", "published"],
      default: "needs_review",
      index: true
    },
    active: { type: Boolean, default: true, index: true },
    featured: { type: Boolean, default: false },
    priceBasic: { type: Number, default: 1.99 },
    includedPlans: { type: [String], default: ["pro", "premium"] },
    monthlyCreditCost: { type: Number, default: 100 },
    dishes: { type: [DishTemplateSchema], default: [] },
    releaseDate: { type: Date, default: null },
    freeUntil: { type: Date, default: null },
    activeFrom: { type: Date, default: null },
    activeUntil: { type: Date, default: null },
    color: { type: String, default: null },
    defaultSpecial: { type: Boolean, default: false },
    defaultAllowRandom: { type: Boolean, default: true },
    sortOrder: { type: Number, default: 0 },
    isDietPack: { type: Boolean, default: false },
    dietLabel: { type: String, default: "", trim: true },
    validationSummary: {
      missingIngredientMappings: { type: Number, default: 0 },
      missingIngredientCategories: { type: Number, default: 0 },
      missingDishCategories: { type: Number, default: 0 },
      ambiguousMatches: { type: Number, default: 0 },
      invalidMappings: { type: Number, default: 0 },
      duplicateIngredientNames: { type: Number, default: 0 },
      unresolvedIssues: { type: Number, default: 0 },
      normalizedIngredients: { type: Number, default: 0 },
      totalIngredients: { type: Number, default: 0 },
      totalDishes: { type: Number, default: 0 }
    },
    reviewIssues: { type: [mongoose.Schema.Types.Mixed], default: [] },
    normalizedAt: { type: Date, default: null },
    reviewedAt: { type: Date, default: null },
    publishedAt: { type: Date, default: null },

    // ── Stripe / Payments ────────────────────────────────────────────────────
    isPaid: { type: Boolean, default: false },
    priceAmount: { type: Number, default: null },
    currency: { type: String, default: "eur", trim: true, lowercase: true },
    stripeProductId: { type: String, default: null, trim: true },
    stripePriceId: { type: String, default: null, trim: true },
    paymentMode: { type: String, enum: ["none", "stripe"], default: "none" },
    purchasedCount: { type: Number, default: 0 },
    lastPurchasedAt: { type: Date, default: null }
  },
  { timestamps: true }
);

export const CatalogPack = mongoose.model("CatalogPack", CatalogPackSchema);
