import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { DEFAULT_THEME_ID, getAppTheme, isAppThemeId, resolveThemeIdForAccess, APP_THEMES } from "./appThemes.js";

const STORAGE_KEY = "hf-theme";
const ThemeContext = createContext(null);

function normalizeStoredTheme(value) {
  if (isAppThemeId(value)) return value;
  if (value === "light" || value === "system") return DEFAULT_THEME_ID;
  if (value === "dark") return "jet-whale";
  return DEFAULT_THEME_ID;
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
  const [theme, setThemeState] = useState(() => {
    try {
      return normalizeStoredTheme(localStorage.getItem(STORAGE_KEY));
    } catch {}
    return DEFAULT_THEME_ID;
  });
  const [canUsePremiumThemes, setCanUsePremiumThemes] = useState(false);

  const themeId = useMemo(
    () => resolveThemeIdForAccess(theme, canUsePremiumThemes),
    [canUsePremiumThemes, theme]
  );
  const appTheme = useMemo(() => getAppTheme(themeId), [themeId]);
  const resolvedTheme = appTheme.mode;

  useEffect(() => {
    applyTheme(appTheme);
  }, [appTheme]);

  const setTheme = useCallback((next) => {
    const normalized = normalizeStoredTheme(next);
    setThemeState(normalized);
    try { localStorage.setItem(STORAGE_KEY, normalized); } catch {}
  }, []);

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
      themes: APP_THEMES,
      canUsePremiumThemes,
      setTheme,
      setCanUsePremiumThemes,
      syncThemeFromUser
    }),
    [appTheme, canUsePremiumThemes, resolvedTheme, setTheme, syncThemeFromUser, theme, themeId]
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme() {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error("useTheme must be used inside ThemeProvider");
  return ctx;
}
