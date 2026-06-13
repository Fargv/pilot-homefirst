import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import {
  DEFAULT_THEME_ID,
  DEFAULT_DARK_THEME_ID,
  getAppTheme,
  getDefaultThemeIdForMode,
  getSystemPreferredThemeId,
  isAppThemeId,
  resolveThemeIdForAccess,
  APP_THEMES
} from "./appThemes.js";

const STORAGE_KEY = "hf-theme";
const LAST_LIGHT_KEY = "hf-theme-last-light";
const LAST_DARK_KEY = "hf-theme-last-dark";
const ThemeContext = createContext(null);

function normalizeStoredTheme(value) {
  if (isAppThemeId(value)) return value;
  if (value === "light" || value === "system") return DEFAULT_THEME_ID;
  if (value === "dark") return DEFAULT_DARK_THEME_ID;
  return DEFAULT_THEME_ID;
}

// First run (no explicit choice): follow the OS color scheme.
function readInitialTheme() {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored != null) return normalizeStoredTheme(stored);
  } catch {}
  return getSystemPreferredThemeId();
}

function rememberThemeForMode(themeId) {
  try {
    const mode = getAppTheme(themeId).mode;
    localStorage.setItem(mode === "dark" ? LAST_DARK_KEY : LAST_LIGHT_KEY, themeId);
  } catch {}
}

function readLastThemeForMode(mode) {
  try {
    const stored = localStorage.getItem(mode === "dark" ? LAST_DARK_KEY : LAST_LIGHT_KEY);
    if (isAppThemeId(stored) && getAppTheme(stored).mode === mode) return stored;
  } catch {}
  return getDefaultThemeIdForMode(mode);
}

function applyTheme(themeDef) {
  const root = document.documentElement;
  root.setAttribute("data-theme", themeDef.mode);
  root.setAttribute("data-app-theme", themeDef.id);
  Object.entries(themeDef.tokens || {}).forEach(([name, value]) => {
    root.style.setProperty(name, value);
  });
  root.style.setProperty("--hf-bg", "var(--app-bg)");
  root.style.setProperty("--hf-surface", "var(--surface)");
  root.style.setProperty("--hf-surface-soft", "var(--app-bg-soft)");
  root.style.setProperty("--hf-text", "var(--text-primary)");
  root.style.setProperty("--hf-muted", "var(--text-muted)");
  root.style.setProperty("--hf-border", "var(--border-soft)");
  root.style.setProperty("--hf-shadow-soft", "var(--card-shadow)");
  root.style.colorScheme = themeDef.mode;
}

export function ThemeProvider({ children }) {
  const [theme, setThemeState] = useState(readInitialTheme);
  const [canUsePremiumThemes, setCanUsePremiumThemes] = useState(false);

  const themeId = useMemo(
    () => resolveThemeIdForAccess(theme, canUsePremiumThemes),
    [canUsePremiumThemes, theme]
  );
  const appTheme = useMemo(() => getAppTheme(themeId), [themeId]);
  const resolvedTheme = appTheme.mode;

  useEffect(() => {
    applyTheme(appTheme);
    rememberThemeForMode(appTheme.id);
  }, [appTheme]);

  const setTheme = useCallback((next) => {
    const normalized = normalizeStoredTheme(next);
    setThemeState(normalized);
    try { localStorage.setItem(STORAGE_KEY, normalized); } catch {}
  }, []);

  // Light/Dark toggle: jump to the last theme used in the target mode
  // (or that mode's Basic default), resolved against the user's access.
  const setMode = useCallback((mode) => {
    const target = resolveThemeIdForAccess(readLastThemeForMode(mode), canUsePremiumThemes);
    setTheme(target);
    return target;
  }, [canUsePremiumThemes, setTheme]);

  const syncThemeFromUser = useCallback((nextThemeId, options = {}) => {
    const normalized = normalizeStoredTheme(nextThemeId);
    const nextCanUsePremiumThemes = Boolean(options.canUsePremiumThemes);
    setCanUsePremiumThemes(nextCanUsePremiumThemes);
    setThemeState(normalized);
    try { localStorage.setItem(STORAGE_KEY, normalized); } catch {}
  }, []);

  const value = useMemo(
    () => ({
      theme,
      themeId,
      appTheme,
      resolvedTheme,
      mode: resolvedTheme,
      themes: APP_THEMES,
      canUsePremiumThemes,
      setTheme,
      setMode,
      setCanUsePremiumThemes,
      syncThemeFromUser
    }),
    [appTheme, canUsePremiumThemes, resolvedTheme, setMode, setTheme, syncThemeFromUser, theme, themeId]
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme() {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error("useTheme must be used inside ThemeProvider");
  return ctx;
}
