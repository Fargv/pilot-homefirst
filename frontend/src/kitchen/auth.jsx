import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { useAuth as useClerkAuth, useClerk } from "@clerk/react";
import { apiRequest, getToken, hasLegacyToken, registerClerkTokenGetter, setToken } from "./api.js";

const AuthContext = createContext(null);
let globalClerkBootstrapInFlight = null;

export function isUserAuthenticated(user) {
  return Boolean(user);
}

export function AuthProvider({ children, clerk = null }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [onboardingRequired, setOnboardingRequired] = useState(false);
  const [lastAuthError, setLastAuthError] = useState(null);
  const localFetchInFlightRef = useRef(null);

  const fetchMe = useCallback(async ({ authMode = "auto" } = {}) => {
    const inFlightKey = authMode;
    const existingLocalRequest = localFetchInFlightRef.current;
    if (existingLocalRequest?.key === inFlightKey) {
      if (authMode === "clerk" && import.meta.env.DEV) {
        console.info("[clerk][dev] Reusing local in-flight Clerk /me bootstrap");
      }
      return existingLocalRequest.promise;
    }

    const runFetch = async () => {
      try {
        setLoading(true);
        if (authMode === "clerk" && import.meta.env.DEV) {
          console.info("[clerk][dev] Starting Clerk /me bootstrap");
        }
        const data = await apiRequest("/api/kitchen/auth/me", { authMode });
        if (authMode === "clerk") {
          setToken(null);
        }
        setUser(data.user);
        setOnboardingRequired(Boolean(data.user?.onboardingRequired));
        setLastAuthError(null);
        if (authMode === "clerk" && import.meta.env.DEV) {
          console.info("[clerk][dev] Clerk /me bootstrap resolved", {
            userId: data.user?.id,
            email: data.user?.email,
            onboardingRequired: Boolean(data.user?.onboardingRequired)
          });
        }
        return data.user;
      } catch (error) {
        const nextAuthError = {
          message: error?.message || "No se pudo validar la sesion.",
          status: error?.status || 0,
          code: error?.body?.code || "AUTH_ERROR",
          body: error?.body || {}
        };
        if (authMode === "clerk" && (error?.status === 428 || error?.body?.onboardingRequired)) {
          setUser(null);
          setOnboardingRequired(true);
          setLastAuthError(nextAuthError);
          setLoading(false);
          if (import.meta.env.DEV) {
            console.info("[clerk][dev] Clerk /me bootstrap requires onboarding", nextAuthError);
          }
          return { onboardingRequired: true, authProvider: "clerk", error: nextAuthError };
        }
        if (authMode === "clerk" && import.meta.env.DEV) {
          console.warn("[clerk][dev] No se pudo resolver /me con token de Clerk", {
            message: error?.message,
            status: error?.status,
            body: error?.body
          });
        }
        setUser(null);
        setOnboardingRequired(false);
        setLastAuthError(nextAuthError);
        if (authMode !== "clerk") {
          setToken(null);
        }
        return authMode === "clerk" ? { authProvider: "clerk", error: nextAuthError } : null;
      } finally {
        setLoading(false);
        if (localFetchInFlightRef.current?.key === inFlightKey) {
          localFetchInFlightRef.current = null;
        }
        if (authMode === "clerk" && globalClerkBootstrapInFlight === requestPromise) {
          globalClerkBootstrapInFlight = null;
        }
      }
    };

    if (authMode === "clerk" && globalClerkBootstrapInFlight) {
      if (import.meta.env.DEV) {
        console.info("[clerk][dev] Reusing global in-flight Clerk /me bootstrap");
      }
      const reusedPromise = globalClerkBootstrapInFlight.then((result) => {
        if (result?.onboardingRequired) {
          setUser(null);
          setOnboardingRequired(true);
          setLastAuthError(result.error || null);
          return result;
        }
        if (result?.id) {
          setToken(null);
          setUser(result);
          setOnboardingRequired(Boolean(result.onboardingRequired));
          setLastAuthError(null);
          return result;
        }
        if (result?.error) {
          setUser(null);
          setOnboardingRequired(false);
          setLastAuthError(result.error);
        }
        return result;
      }).finally(() => {
        setLoading(false);
        if (localFetchInFlightRef.current?.key === inFlightKey) {
          localFetchInFlightRef.current = null;
        }
      });
      localFetchInFlightRef.current = { key: inFlightKey, promise: reusedPromise };
      return reusedPromise;
    }

    const requestPromise = runFetch();
    localFetchInFlightRef.current = { key: inFlightKey, promise: requestPromise };
    if (authMode === "clerk") {
      globalClerkBootstrapInFlight = requestPromise;
    }
    return requestPromise;
  }, []);

  useEffect(() => {
    if (!clerk) {
      registerClerkTokenGetter(null);
      return undefined;
    }

    registerClerkTokenGetter(async () => {
      if (!clerk.isLoaded || !clerk.isSignedIn) return null;
      return clerk.getToken();
    });

    return () => {
      registerClerkTokenGetter(null);
    };
  }, [clerk]);

  useEffect(() => {
    if (!clerk) {
      if (hasLegacyToken()) {
        fetchMe();
      } else {
        setLoading(false);
      }
      return;
    }

    if (!clerk.isLoaded) return;

    if (clerk.isSignedIn) {
      fetchMe({ authMode: "clerk" });
      return;
    }

    if (hasLegacyToken()) {
      fetchMe();
      return;
    }

    setUser(null);
    setOnboardingRequired(false);
    setLoading(false);
  }, [clerk, fetchMe]);

  const login = async (email, password) => {
    const data = await apiRequest("/api/kitchen/auth/login", {
      method: "POST",
      body: JSON.stringify({ email, password })
    });
    setToken(data.token);
    setUser(data.user);
    setOnboardingRequired(false);
    return data.user;
  };

  const establishSession = useCallback((token, nextUser) => {
    setToken(token ?? null);
    setUser(nextUser ?? null);
    setOnboardingRequired(Boolean(nextUser?.onboardingRequired));
    setLastAuthError(null);
    setLoading(false);
  }, []);

  const clearSession = useCallback(() => {
    setToken(null);
    setUser(null);
    setOnboardingRequired(false);
    setLastAuthError(null);
    setLoading(false);
  }, []);

  const logout = useCallback(() => {
    const token = getToken();
    clearSession();

    if (clerk?.isSignedIn) {
      void clerk.signOut().catch(() => {
        // La sesion local ya quedo invalidada; ignoramos errores remotos.
      });
    }

    if (!token) return;

    void apiRequest("/api/kitchen/auth/logout", {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` }
    }).catch(() => {
      // La sesion local ya quedo invalidada; ignoramos errores remotos.
    });
  }, [clearSession, clerk]);

  const value = useMemo(
    () => ({
      user,
      loading,
      onboardingRequired,
      lastAuthError,
      clerkLoaded: clerk?.isLoaded ?? false,
      clerkSignedIn: clerk?.isSignedIn ?? false,
      login,
      logout,
      establishSession,
      clearSession,
      refreshUser: fetchMe,
      setUser,
      setOnboardingRequired
    }),
    [user, loading, onboardingRequired, lastAuthError, clerk, logout, establishSession, clearSession, fetchMe]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error("AuthProvider faltante");
  return context;
}

export function ClerkEnabledAuthProvider({ children }) {
  const { getToken, isLoaded, isSignedIn } = useClerkAuth();
  const clerk = useClerk();
  const clerkAuth = useMemo(
    () => ({
      getToken,
      isLoaded,
      isSignedIn,
      signOut: (...args) => clerk.signOut(...args)
    }),
    [clerk, getToken, isLoaded, isSignedIn]
  );

  return (
    <AuthProvider clerk={clerkAuth}>
      {children}
    </AuthProvider>
  );
}
