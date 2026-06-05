/**
 * detectStepIngredients.js
 *
 * Auto-suggest which recipe ingredients are used in a given step,
 * by matching step text against ingredient names.
 *
 * Rules:
 * - Case-insensitive, accent-insensitive.
 * - Basic plural tolerance (adds optional trailing 's').
 * - Conservative: skips uncertain matches.
 * - Preserves ingredientId when available.
 * - Returns [] rather than crashing on bad input.
 */

const STOPWORDS = new Set([
  "de", "del", "la", "el", "los", "las", "un", "una", "unos", "unas",
  "y", "o", "e", "u", "con", "sin", "en", "a", "al", "por",
]);

function normalize(str) {
  return String(str || "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .trim();
}

function tokenize(str) {
  return normalize(str)
    .split(/[\s,]+/)
    .map((w) => w.replace(/[^a-z0-9]/g, ""))
    .filter((w) => w.length >= 3 && !STOPWORDS.has(w));
}

// Escape special regex characters
function reEscape(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

// Word-boundary match with optional plural 's'
function wordBoundaryMatch(stepNorm, token) {
  const re = new RegExp(`(?:^|[^a-z])${reEscape(token)}s?(?:[^a-z]|$)`);
  return re.test(stepNorm);
}

/**
 * Detect which recipe ingredients are referenced in a step's text.
 *
 * @param {string} stepText — plain text of the step instruction
 * @param {Array<{name: string, ingredientId?: string|null, quantity?: any}>} recipeIngredients
 * @returns {Array<{name: string, ingredientId: string|null}>}
 */
export function detectStepIngredients(stepText, recipeIngredients) {
  if (!stepText || !Array.isArray(recipeIngredients) || recipeIngredients.length === 0) {
    return [];
  }

  const stepNorm = normalize(stepText);
  const results = [];

  for (const ing of recipeIngredients) {
    const ingName = String(ing.name || "").trim();
    if (!ingName) continue;

    const tokens = tokenize(ingName);
    if (tokens.length === 0) continue;

    let matched = false;

    if (tokens.length === 1) {
      // Single meaningful token — require word-boundary match
      matched = wordBoundaryMatch(stepNorm, tokens[0]);
    } else {
      // Multi-token: check full normalized name first (safest)
      const fullNorm = normalize(ingName).replace(/\s+/g, " ");
      if (stepNorm.includes(fullNorm)) {
        matched = true;
      } else {
        // Require at least 2 significant tokens to match
        const significantTokens = tokens.filter((t) => t.length >= 4);
        if (significantTokens.length === 0) {
          // All tokens are short — require ALL to appear
          matched = tokens.every((t) => wordBoundaryMatch(stepNorm, t));
        } else {
          const matchingCount = significantTokens.filter((t) => wordBoundaryMatch(stepNorm, t)).length;
          // Require at least half the significant tokens, and at least 2 if there are ≥2
          const required = significantTokens.length >= 2 ? Math.max(2, Math.ceil(significantTokens.length * 0.6)) : 1;
          matched = matchingCount >= required;
        }
      }
    }

    if (matched) {
      results.push({
        name: ingName,
        ingredientId: ing.ingredientId || null,
      });
    }
  }

  return results;
}
