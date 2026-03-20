const DEFAULT_SHARE_BASE_URL = "http://localhost:5173";

function normalizeWeekStartFromDate(date) {
  const utcDate = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  const day = utcDate.getUTCDay();
  const diff = (day === 0 ? -6 : 1) - day;
  utcDate.setUTCDate(utcDate.getUTCDate() + diff);
  return utcDate.toISOString().slice(0, 10);
}

export function normalizeWeekParam(value, fallback = "") {
  const safeValue = String(value || "").trim();
  if (!safeValue) return fallback;
  const parsed = new Date(`${safeValue}T00:00:00Z`);
  if (Number.isNaN(parsed.getTime())) return fallback;
  return normalizeWeekStartFromDate(parsed);
}

export function getShareBaseUrl() {
  const configuredBaseUrl = String(
    import.meta.env.VITE_APP_SHARE_URL || import.meta.env.VITE_APP_URL || ""
  ).trim();

  if (configuredBaseUrl) {
    return configuredBaseUrl.replace(/\/+$/, "");
  }

  if (typeof window !== "undefined" && window.location?.origin) {
    return window.location.origin.replace(/\/+$/, "");
  }

  return DEFAULT_SHARE_BASE_URL;
}

export function buildAppShareUrl(path, searchParams) {
  const normalizedPath = String(path || "").startsWith("/") ? path : `/${String(path || "")}`;
  const url = new URL(normalizedPath, `${getShareBaseUrl()}/`);

  if (searchParams instanceof URLSearchParams) {
    url.search = searchParams.toString();
  } else if (searchParams && typeof searchParams === "object") {
    Object.entries(searchParams).forEach(([key, value]) => {
      if (value === undefined || value === null || value === "") return;
      url.searchParams.set(key, String(value));
    });
  }

  return url.toString();
}

export function buildWeekShareUrl(weekStart) {
  return buildAppShareUrl("/kitchen/semana", { week: normalizeWeekParam(weekStart) });
}

export function buildShoppingShareUrl(weekStart) {
  return buildAppShareUrl("/kitchen/compra", { week: normalizeWeekParam(weekStart) });
}

export function buildInviteShareUrl(token) {
  return buildAppShareUrl(`/invite/${encodeURIComponent(String(token || "").trim())}`);
}
