import crypto from "crypto";

export function normalizePersonalizationForHash(personalization) {
  return personalization === undefined ? null : personalization;
}

export function catalogMetadataHash(template, normalizeTemplate) {
  const normalized = normalizeTemplate(template);
  if (template.personalization !== undefined) normalized.personalization = normalizePersonalizationForHash(template.personalization);
  return crypto.createHash("sha256").update(JSON.stringify(normalized)).digest("hex");
}

export function copyPersonalizationFromTemplate(template, dish) {
  if (template.personalization === undefined) {
    if (typeof dish.set === "function") dish.set("personalization", undefined);
    else delete dish.personalization;
  }
  else dish.personalization = template.personalization;
  return dish;
}

export function catalogRecipeContentHash(template = {}) {
  const recipe = template.recipe || {};
  const content = {
    name: template.name || "",
    isDinner: Boolean(template.isDinner),
    ingredients: Array.isArray(template.ingredients) ? template.ingredients : [],
    recipe: {
      ingredients: Array.isArray(recipe.ingredients) ? recipe.ingredients : [],
      steps: recipe.steps ?? null,
      robotSteps: recipe.robotSteps ?? null,
      servings: recipe.servings ?? null,
      baseServings: recipe.baseServings ?? null,
      prepMinutes: recipe.prepMinutes ?? null,
      cookMinutes: recipe.cookMinutes ?? null
    }
  };
  return `sha256:${createHash(content)}`;
}

function createHash(value) {
  return crypto.createHash("sha256").update(JSON.stringify(value)).digest("hex");
}
