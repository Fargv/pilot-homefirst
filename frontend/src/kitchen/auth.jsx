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

  const fetchMe = useCallback(async () => {
    try {
      const data = await apiRequest("/api/kitchen/auth/me");
      setUser(data.user);
    } catch {
      setUser(null);
      setToken(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (hasLegacyToken()) {
      fetchMe();
      return;
    }

    if (!clerk) {
      setLoading(false);
      return;
    }

    if (!clerk.isLoaded) return;

    if (clerk.isSignedIn) {
      fetchMe();
      return;
    }

    setLoading(false);
  }, [clerk, fetchMe]);

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
    if (!clerk?.isLoaded || hasLegacyToken()) return;

    if (clerk.isSignedIn) {
      fetchMe();
      return;
    }

    setUser(null);
    setLoading(false);
  }, [clerk?.isLoaded, clerk?.isSignedIn, fetchMe]);

  const login = async (email, password) => {
    const data = await apiRequest("/api/kitchen/auth/login", {
      method: "POST",
      body: JSON.stringify({ email, password })
    });
    setToken(data.token);
    setUser(data.user);
    return data.user;
  };

  const establishSession = useCallback((token, nextUser) => {
    setToken(token ?? null);
    setUser(nextUser ?? null);
    setLoading(false);
  }, []);

  const clearSession = useCallback(() => {
    setToken(null);
    setUser(null);
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
    () => ({ user, loading, login, logout, establishSession, clearSession, refreshUser: fetchMe, setUser }),
    [user, loading, logout, establishSession, clearSession, fetchMe]
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

  return (
    <AuthProvider
      clerk={{
        getToken,
        isLoaded,
        isSignedIn,
        signOut: (...args) => clerk.signOut(...args)
      }}
    >
      {children}
    </AuthProvider>
  );
}
