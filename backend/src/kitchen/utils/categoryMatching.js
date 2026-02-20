import { CATALOG_SCOPES } from "./catalogScopes.js";

export const DEFAULT_CATEGORY_NAME = "Otros";
export const DEFAULT_CATEGORY_SLUG = "otros";
export const DEFAULT_CATEGORY_COLOR_BG = "#EEF2FF";
export const DEFAULT_CATEGORY_COLOR_TEXT = "#3730A3";

export function slugifyCategory(value = "") {
  const trimmed = value.trim().toLowerCase();
  if (!trimmed) return "";

  const noAccents = trimmed.normalize("NFD").replace(/\p{Diacritic}/gu, "");
  const noPunctuation = noAccents.replace(/[^\w\s-]/g, "");
  return noPunctuation.replace(/\s+/g, "-").replace(/-+/g, "-").replace(/^-|-$/g, "");
}

export function normalizeCategoryKey(value = "") {
  return String(value || "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .replace(/[^a-z0-9\s-]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

export async function ensureDefaultCategory({ Category, householdId, scope = CATALOG_SCOPES.HOUSEHOLD }) {
  const filter = {
    slug: DEFAULT_CATEGORY_SLUG,
    scope,
    isArchived: { $ne: true }
  };
  if (scope !== CATALOG_SCOPES.MASTER) {
    filter.householdId = householdId;
  }

  const existing = await Category.findOne(filter);
  if (existing) return existing;

  return Category.create({
    name: DEFAULT_CATEGORY_NAME,
    slug: DEFAULT_CATEGORY_SLUG,
    colorBg: DEFAULT_CATEGORY_COLOR_BG,
    colorText: DEFAULT_CATEGORY_COLOR_TEXT,
    scope,
    householdId: scope === CATALOG_SCOPES.MASTER ? undefined : householdId
  });
}

