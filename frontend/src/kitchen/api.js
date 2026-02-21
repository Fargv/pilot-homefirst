const API = (import.meta.env.VITE_API_URL || "").replace(/\/+$/, "");

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

export function setToken(token) {
  if (token) {
    localStorage.setItem("kitchen_token", token);
    sessionStorage.removeItem("kitchen_token");
    return;
  }
  localStorage.removeItem("kitchen_token");
  sessionStorage.removeItem("kitchen_token");
}

export async function apiRequest(path, options = {}) {
  const token = getToken();
  const headers = {
    "Content-Type": "application/json",
    ...(options.headers || {})
  };

  if (token) headers.Authorization = `Bearer ${token}`;

  const url = buildApiUrl(path);
  const response = await fetch(url, {
    ...options,
    headers
  });

  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const message = data?.error || "Error inesperado";
    throw new ApiRequestError(message, {
      path,
      url,
      status: response.status,
      body: data
    });
  }

  return data;
}
