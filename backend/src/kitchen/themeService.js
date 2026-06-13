export const DEFAULT_THEME_ID = "periwinkle-lavender";
export const DEFAULT_DARK_THEME_ID = "jet-whale";

export const APP_THEME_IDS = [
  "royal-pink",
  "sulu-fir",
  "jet-whale",
  "bright-stone",
  "turquoise-black",
  "periwinkle-lavender",
  "sage-cream",
  "peach-vanilla",
  "lavender-mist",
  "midnight-forest",
  "deep-ocean",
  "warm-ember"
];

const BASIC_ACCESS = new Set(["free", "basic", "pro", "premium"]);
const PREMIUM_ACCESS = new Set(["pro", "premium"]);

// Basic users reach Periwinkle (light) + Jet Stream (dark) via the toggle;
// everything else is Pro/Premium.
const THEME_PLAN_ACCESS = {
  "royal-pink": PREMIUM_ACCESS,
  "sulu-fir": PREMIUM_ACCESS,
  "jet-whale": BASIC_ACCESS,
  "bright-stone": PREMIUM_ACCESS,
  "turquoise-black": PREMIUM_ACCESS,
  "periwinkle-lavender": BASIC_ACCESS,
  "sage-cream": PREMIUM_ACCESS,
  "peach-vanilla": PREMIUM_ACCESS,
  "lavender-mist": PREMIUM_ACCESS,
  "midnight-forest": PREMIUM_ACCESS,
  "deep-ocean": PREMIUM_ACCESS,
  "warm-ember": PREMIUM_ACCESS
};

export function normalizeThemeId(themeId) {
  const normalized = String(themeId || "").trim();
  return APP_THEME_IDS.includes(normalized) ? normalized : DEFAULT_THEME_ID;
}

export function isValidThemeId(themeId) {
  return APP_THEME_IDS.includes(String(themeId || "").trim());
}

export function isThemeAvailableForPlan(themeId, plan) {
  const normalizedThemeId = normalizeThemeId(themeId);
  const normalizedPlan = String(plan || "basic").toLowerCase();
  return Boolean(THEME_PLAN_ACCESS[normalizedThemeId]?.has(normalizedPlan));
}
