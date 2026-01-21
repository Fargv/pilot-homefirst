export function normalizeEmail(email) {
  return String(email || "").trim().toLowerCase();
}

export function isValidEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

export function normalizeRole(role) {
  if (!role) return "user";
  const value = String(role).toLowerCase();
  if (value === "admin") return "admin";
  if (value === "usuario") return "user";
  return "user";
}

export function buildDisplayName({ firstName, lastName, displayName, name }) {
  const first = String(firstName || name || "").trim();
  const last = String(lastName || "").trim();
  const full = [first, last].filter(Boolean).join(" ").trim();
  if (full) return full;
  return String(displayName || "").trim();
}
