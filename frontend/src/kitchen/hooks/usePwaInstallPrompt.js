import { useCallback, useEffect, useState } from "react";

const DISMISSED_KEY = "lunchfy_pwa_install_dismissed";
const INSTALLED_KEY = "lunchfy_pwa_installed";
const DISMISS_TTL_MS = 7 * 24 * 60 * 60 * 1000;

// Module-level singleton so both the banner and settings share the same deferred prompt.
let _deferredPrompt = null;
const _subscribers = new Set();

function _notify() {
  _subscribers.forEach((fn) => fn());
}

if (typeof window !== "undefined") {
  window.addEventListener("beforeinstallprompt", (e) => {
    // Don't call e.preventDefault(): modern Chrome no longer auto-shows the
    // mini-infobar, and preventing it without an immediate prompt() logs the
    // "must call prompt()" console warning. We just stash the event so the
    // custom install button/banner can trigger prompt() later.
    _deferredPrompt = e;
    _notify();
  });
  window.addEventListener("appinstalled", () => {
    _deferredPrompt = null;
    try {
      localStorage.setItem(INSTALLED_KEY, "1");
    } catch {}
    _notify();
  });
}

export function isStandaloneMode() {
  if (typeof window === "undefined") return false;
  return (
    window.matchMedia("(display-mode: standalone)").matches ||
    window.navigator.standalone === true ||
    document.referrer.includes("android-app://")
  );
}

export function isMobileDevice() {
  if (typeof navigator === "undefined") return false;
  const ua = navigator.userAgent || navigator.vendor || "";
  // iPads with iOS 13+ report Mac UA but have maxTouchPoints > 1.
  return /android|ipad|iphone|ipod/i.test(ua) || (navigator.maxTouchPoints > 1 && /Mac/.test(ua));
}

export function isIosSafari() {
  if (typeof navigator === "undefined") return false;
  const ua = navigator.userAgent || "";
  const isIos = /ipad|iphone|ipod/i.test(ua) || (navigator.maxTouchPoints > 1 && /Mac/.test(ua));
  const isSafari = /Safari/i.test(ua) && !/Chrome|CriOS|FxiOS|EdgiOS/i.test(ua);
  return isIos && isSafari;
}

function wasAlreadyInstalled() {
  try {
    return localStorage.getItem(INSTALLED_KEY) === "1";
  } catch {
    return false;
  }
}

function wasDismissedRecently() {
  try {
    const raw = localStorage.getItem(DISMISSED_KEY);
    if (!raw) return false;
    return Date.now() - Number(raw) < DISMISS_TTL_MS;
  } catch {
    return false;
  }
}

/**
 * @param {{ ignoreDismissed?: boolean }} options
 *   ignoreDismissed — set true in Settings so the panel always shows unless installed/standalone.
 */
export function usePwaInstallPrompt({ ignoreDismissed = false } = {}) {
  const [deferredPrompt, setDeferredPrompt] = useState(_deferredPrompt);
  // Increment to force re-evaluation of localStorage flags.
  const [tick, setTick] = useState(0);

  useEffect(() => {
    const update = () => {
      setDeferredPrompt(_deferredPrompt);
      setTick((t) => t + 1);
    };
    _subscribers.add(update);
    return () => _subscribers.delete(update);
  }, []);

  const mobile = isMobileDevice();
  const standalone = isStandaloneMode();
  const ios = isIosSafari();
  const installed = wasAlreadyInstalled();
  const dismissedRecently = !ignoreDismissed && wasDismissedRecently();

  const shouldShow = mobile && !standalone && !installed && !dismissedRecently;

  const promptInstall = useCallback(async () => {
    if (!_deferredPrompt) return;
    try {
      _deferredPrompt.prompt();
      const { outcome } = await _deferredPrompt.userChoice;
      if (outcome === "accepted") {
        try {
          localStorage.setItem(INSTALLED_KEY, "1");
        } catch {}
      }
    } catch {}
    _deferredPrompt = null;
    _notify();
  }, []);

  const dismiss = useCallback((permanent = false) => {
    try {
      if (permanent) {
        localStorage.setItem(INSTALLED_KEY, "1");
      } else {
        localStorage.setItem(DISMISSED_KEY, String(Date.now()));
      }
    } catch {}
    setTick((t) => t + 1);
  }, []);

  // Expose a dev helper to reset all flags from the browser console.
  if (typeof window !== "undefined" && !window.__lunchfyPwaReset) {
    window.__lunchfyPwaReset = () => {
      try {
        localStorage.removeItem(DISMISSED_KEY);
        localStorage.removeItem(INSTALLED_KEY);
      } catch {}
      _notify();
      console.info("PWA install flags cleared. Reload the page.");
    };
  }

  return {
    shouldShow,
    isIos: ios,
    isStandalone: standalone,
    isMobile: mobile,
    canInstall: Boolean(deferredPrompt),
    promptInstall,
    dismiss,
    // Expose tick so callers can use it as a render dependency if needed.
    _tick: tick,
  };
}
