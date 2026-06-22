export const PUBLIC_ROUTE_EXACT_PATHS = [
  "/",
  "/bootstrap",
  "/login",
  "/signin",
  "/sign-in",
  "/signup",
  "/sign-up",
  "/auth/clerk",
  "/auth/clerk/complete",
  "/auth/clerk/reset-password",
  "/terminos",
  "/terms",
  "/privacidad",
  "/privacy",
  "/pricing",
  "/help",
];

export const PUBLIC_ROUTE_PREFIXES = [
  "/login/",
  "/signin/",
  "/sign-in/",
  "/signup/",
  "/sign-up/",
  "/auth/clerk/",
  "/invite/",
];

export function isPublicRoutePath(pathname = "/") {
  const normalized = pathname.length > 1 ? pathname.replace(/\/+$/, "") : "/";
  return (
    PUBLIC_ROUTE_EXACT_PATHS.includes(normalized)
    || PUBLIC_ROUTE_PREFIXES.some((prefix) => pathname.startsWith(prefix))
  );
}
