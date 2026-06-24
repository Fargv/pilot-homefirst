export const DEFAULT_THEME_ID = "tomato-cream";
export const DEFAULT_DARK_THEME_ID = "jet-whale";

export const APP_THEME_IDS = [
  // New professional default themes (Basic)
  "tomato-cream",
  "soft-blue-kitchen",
  // New premium themes
  "blush-tomato",
  // Existing premium light themes
  "royal-pink",
  "sulu-fir",
  "sage-cream",
  "peach-vanilla",
  "lavender-mist",
  // Legacy basic light (kept for existing users)
  "periwinkle-lavender",
  // Basic dark
  "jet-whale",
  // Premium dark themes
  "bright-stone",
  "turquoise-black",
  "midnight-forest",
  "deep-ocean",
  "warm-ember"
];

const BASIC_ACCESS = new Set(["free", "basic", "pro", "premium"]);
const PREMIUM_ACCESS = new Set(["pro", "premium"]);

const THEME_PLAN_ACCESS = {
  // New default themes — available to all plans
  "tomato-cream": BASIC_ACCESS,
  "soft-blue-kitchen": BASIC_ACCESS,
  // New premium
  "blush-tomato": PREMIUM_ACCESS,
  // Existing premium light
  "royal-pink": PREMIUM_ACCESS,
  "sulu-fir": PREMIUM_ACCESS,
  "sage-cream": PREMIUM_ACCESS,
  "peach-vanilla": PREMIUM_ACCESS,
  "lavender-mist": PREMIUM_ACCESS,
  // Legacy basic light
  "periwinkle-lavender": BASIC_ACCESS,
  // Basic dark
  "jet-whale": BASIC_ACCESS,
  // Premium dark
  "bright-stone": PREMIUM_ACCESS,
  "turquoise-black": PREMIUM_ACCESS,
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
