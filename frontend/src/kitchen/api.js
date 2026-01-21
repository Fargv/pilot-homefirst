const API = import.meta.env.VITE_API_URL;

export function getToken() {
  return localStorage.getItem("kitchen_token");
}

export function setToken(token) {
  if (token) localStorage.setItem("kitchen_token", token);
  else localStorage.removeItem("kitchen_token");
}

export async function apiRequest(path, options = {}) {
  const token = getToken();
  const headers = {
    "Content-Type": "application/json",
    ...(options.headers || {})
  };

  if (token) headers.Authorization = `Bearer ${token}`;

  const response = await fetch(`${API}${path}`, {
    ...options,
    headers
  });

  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const message = data?.error || "Error inesperado";
    throw new Error(message);
  }

  return data;
}
