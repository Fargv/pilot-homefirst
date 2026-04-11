const API = (import.meta.env.VITE_API_URL || "").replace(/\/+$/, "");

let clerkTokenGetter = null;

export class ApiRequestError extends Error {
  constructor(message, details = {}) {
    super(message);
    this.name = "ApiRequestError";
    this.path = details.path || "";
    this.url = details.url || "";
    this.status = details.status || 0;
    this.body = details.body || {};
  }
}

export function buildApiUrl(path = "") {
  if (!path) return API;
  const normalizedPath = path.startsWith("/") ? path : `/${path}`;
  return `${API}${normalizedPath}`;
}

export function getToken() {
  return localStorage.getItem("kitchen_token") || sessionStorage.getItem("kitchen_token");
}

export function hasLegacyToken() {
  return Boolean(getToken());
}

export function setToken(token) {
  if (token) {
    localStorage.setItem("kitchen_token", token);
    sessionStorage.removeItem("kitchen_token");
    return;
  }
  localStorage.removeItem("kitchen_token");
  sessionStorage.removeItem("kitchen_token");
}

export function registerClerkTokenGetter(getter) {
  clerkTokenGetter = typeof getter === "function" ? getter : null;
}

async function getAuthorizationHeader(authMode = "auto") {
  if (authMode === "clerk") {
    if (!clerkTokenGetter) return null;

    try {
      const clerkToken = await clerkTokenGetter();
      return clerkToken ? `Bearer ${clerkToken}` : null;
    } catch {
      return null;
    }
  }

  const legacyToken = getToken();
  if (legacyToken) return `Bearer ${legacyToken}`;

  if (!clerkTokenGetter) return null;

  try {
    const clerkToken = await clerkTokenGetter();
    return clerkToken ? `Bearer ${clerkToken}` : null;
  } catch {
    return null;
  }
}

export async function apiRequest(path, options = {}) {
  const { authMode = "auto", ...fetchOptions } = options;
  const headers = {
    "Content-Type": "application/json",
    ...(fetchOptions.headers || {})
  };

  const authorizationHeader = await getAuthorizationHeader(authMode);
  if (authorizationHeader && !headers.Authorization) {
    headers.Authorization = authorizationHeader;
  }

  const url = buildApiUrl(path);
  const response = await fetch(url, {
    ...fetchOptions,
    headers
  });

  const contentType = String(response.headers.get("content-type") || "").toLowerCase();
  const contentLength = Number.parseInt(response.headers.get("content-length") || "0", 10);
  const canHaveBody = response.status !== 204 && response.status !== 205;
  const shouldParseJson = canHaveBody && (contentType.includes("application/json") || (Number.isFinite(contentLength) && contentLength > 0));
  const data = shouldParseJson ? await response.json().catch(() => ({})) : {};
  if (!response.ok) {
    const message = data?.error || data?.message || "Error inesperado";
    throw new ApiRequestError(message, {
      path,
      url,
      status: response.status,
      body: data
    });
  }

  return data;
}

export function requestForgotPassword(email) {
  return apiRequest("/api/auth/forgot-password", {
    method: "POST",
    body: JSON.stringify({ email })
  });
}

export function requestResetPassword(token, newPassword) {
  return apiRequest("/api/auth/reset-password", {
    method: "POST",
    body: JSON.stringify({ token, newPassword })
  });
}
