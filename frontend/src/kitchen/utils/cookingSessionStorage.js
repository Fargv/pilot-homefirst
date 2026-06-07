const STORAGE_KEY = "lunchfy:cooking_session";

export function saveSession(session) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(session));
  } catch {}
}

export function loadSession() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export function clearSession() {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {}
}
