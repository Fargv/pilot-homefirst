export function normalizeEmail(email) {
  return String(email || "").trim().toLowerCase();
}

export function isValidEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

export function normalizeRole(role) {
  if (!role) return "member";
  const value = String(role).toLowerCase();
  if (value === "owner" || value === "admin") return "owner";
  if (value === "member" || value === "usuario" || value === "user") return "member";
  return "member";
}

export function buildDisplayName({ firstName, lastName, displayName, name }) {
  const first = String(firstName || name || "").trim();
  const last = String(lastName || "").trim();
  const full = [first, last].filter(Boolean).join(" ").trim();
  if (full) return full;
  return String(displayName || "").trim();
}

export function buildInitials(value) {
  const safeValue = String(value || "").trim();
  if (!safeValue) return "";
  const parts = safeValue.split(/\s+/).filter(Boolean);
  if (!parts.length) return "";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return `${parts[0][0]}${parts[1][0]}`.toUpperCase().slice(0, 3);
}

export function normalizeInitials(initials, fallbackName = "") {
  const safeInitials = String(initials || "").trim().toUpperCase().slice(0, 3);
  if (safeInitials) return safeInitials;
  return buildInitials(fallbackName);
}

const COLOR_IDS = new Set(["lavender", "mint", "coral", "sky", "sand", "butter", "ocean", "rose"]);
const LEGACY_COLOR_MAP = {
  peach: "butter",
  sage: "mint",
  mauve: "rose"
};

export function normalizeColorId(colorId) {
  const value = String(colorId || "").trim().toLowerCase();
  if (!value) return "";
  if (COLOR_IDS.has(value)) return value;
  if (LEGACY_COLOR_MAP[value]) return LEGACY_COLOR_MAP[value];
  return "";
}
