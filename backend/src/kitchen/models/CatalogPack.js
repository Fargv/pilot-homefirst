import mongoose from "mongoose";

const DishIngredientTemplateSchema = new mongoose.Schema(
  {
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
    name: { type: String, required: true, trim: true },
    sidedish: { type: Boolean, default: false },
    isDinner: { type: Boolean, default: false },
    special: { type: Boolean, default: false },
    allowRandom: { type: Boolean, default: true },
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
    active: { type: Boolean, default: true, index: true },
    featured: { type: Boolean, default: false },
    priceBasic: { type: Number, default: 1.99 },
    includedPlans: { type: [String], default: ["pro", "premium"] },
    monthlyCreditCost: { type: Number, default: 1 },
    dishes: { type: [DishTemplateSchema], default: [] },
    releaseDate: { type: Date, default: null },
    freeUntil: { type: Date, default: null },
    sortOrder: { type: Number, default: 0 }
  },
  { timestamps: true }
);

export const CatalogPack = mongoose.model("CatalogPack", CatalogPackSchema);
