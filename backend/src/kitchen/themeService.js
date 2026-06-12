export const DEFAULT_THEME_ID = "royal-pink";

export const APP_THEME_IDS = [
  DEFAULT_THEME_ID,
  "sulu-fir",
  "jet-whale",
  "bright-stone",
  "turquoise-black",
  "periwinkle-lavender"
];

const THEME_PLAN_ACCESS = {
  [DEFAULT_THEME_ID]: new Set(["free", "basic", "pro", "premium"]),
  "sulu-fir": new Set(["pro", "premium"]),
  "jet-whale": new Set(["pro", "premium"]),
  "bright-stone": new Set(["pro", "premium"]),
  "turquoise-black": new Set(["pro", "premium"]),
  "periwinkle-lavender": new Set(["pro", "premium"])
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
