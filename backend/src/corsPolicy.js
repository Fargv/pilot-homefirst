const NETLIFY_DEV_HOST = "homefirst-dev.netlify.app";
const NETLIFY_DEV_PREVIEW_HOST_PATTERN = /^deploy-preview-\d+--homefirst-dev\.netlify\.app$/;

export function isDevEnvironment(env = process.env) {
  return env.NODE_ENV !== "production"
    && env.APP_ENV !== "production"
    && (env.NODE_ENV === "development" || env.APP_ENV === "development");
}

export function isAllowedDevNetlifyOrigin(origin) {
  if (typeof origin !== "string" || !origin) return false;
  if (/^https:\/\/[^/]+:443(?:\/|$)/i.test(origin)) return false;

  let parsed;
  try {
    parsed = new URL(origin);
  } catch {
    return false;
  }

  if (parsed.protocol !== "https:" || parsed.port || parsed.username || parsed.password || parsed.pathname !== "/" || parsed.search || parsed.hash) {
    return false;
  }

  return parsed.hostname === NETLIFY_DEV_HOST
    || NETLIFY_DEV_PREVIEW_HOST_PATTERN.test(parsed.hostname);
}
