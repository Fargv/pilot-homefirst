const POST_AUTH_REDIRECT_KEY = "kitchen_post_auth_redirect";

function isSafeRelativePath(value) {
  return typeof value === "string" && value.startsWith("/") && !value.startsWith("//");
}

export function storePostAuthRedirect(destination) {
  if (typeof window === "undefined" || !isSafeRelativePath(destination)) return;
  window.sessionStorage.setItem(POST_AUTH_REDIRECT_KEY, destination);
}

export function consumePostAuthRedirect() {
  if (typeof window === "undefined") return "";
  const value = window.sessionStorage.getItem(POST_AUTH_REDIRECT_KEY) || "";
  window.sessionStorage.removeItem(POST_AUTH_REDIRECT_KEY);
  return isSafeRelativePath(value) ? value : "";
}

export function resolvePostAuthRedirect(searchParams, fallback = "/kitchen/semana") {
  const next = searchParams?.get("next") || "";
  if (isSafeRelativePath(next)) {
    consumePostAuthRedirect();
    return next;
  }

  const stored = consumePostAuthRedirect();
  if (stored) return stored;

  return fallback;
}

export function buildReturnTo(location) {
  if (!location) return "/kitchen/semana";
  const path = `${location.pathname || ""}${location.search || ""}${location.hash || ""}`;
  return isSafeRelativePath(path) ? path : "/kitchen/semana";
}
