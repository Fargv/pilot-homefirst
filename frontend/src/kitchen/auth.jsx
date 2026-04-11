import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { useAuth as useClerkAuth, useClerk } from "@clerk/react";
import { apiRequest, getToken, hasLegacyToken, registerClerkTokenGetter, setToken } from "./api.js";

const AuthContext = createContext(null);

export function isUserAuthenticated(user) {
  return Boolean(user);
}

export function AuthProvider({ children, clerk = null }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [onboardingRequired, setOnboardingRequired] = useState(false);

  const fetchMe = useCallback(async ({ authMode = "auto" } = {}) => {
    try {
      const data = await apiRequest("/api/kitchen/auth/me", { authMode });
      if (authMode === "clerk") {
        setToken(null);
      }
      setUser(data.user);
      setOnboardingRequired(Boolean(data.user?.onboardingRequired));
      return data.user;
    } catch (error) {
      if (authMode === "clerk" && error?.status === 428) {
        setUser(null);
        setOnboardingRequired(true);
        setLoading(false);
        return { onboardingRequired: true, authProvider: "clerk" };
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
      if (authMode !== "clerk") {
        setToken(null);
      }
      return null;
    } finally {
      setLoading(false);
    }
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
    setLoading(false);
  }, []);

  const clearSession = useCallback(() => {
    setToken(null);
    setUser(null);
    setOnboardingRequired(false);
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
    () => ({ user, loading, onboardingRequired, login, logout, establishSession, clearSession, refreshUser: fetchMe, setUser, setOnboardingRequired }),
    [user, loading, onboardingRequired, logout, establishSession, clearSession, fetchMe]
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
