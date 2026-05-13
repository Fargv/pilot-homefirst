import { buildApiUrl } from "../api.js";

export function resolvePackCoverImageUrl(coverImage, fallback = null) {
  const value = String(coverImage || "").trim();
  if (!value) return fallback;
  if (/^(https?:|data:)/i.test(value)) return value;
  if (value.startsWith("/uploads/")) return buildApiUrl(value);
  return value;
}
