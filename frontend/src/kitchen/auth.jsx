import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { apiRequest, getToken, setToken } from "./api.js";

const AuthContext = createContext(null);

export function isUserAuthenticated(user) {
  return Boolean(user);
}

export function AuthProvider({ children }) {
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
    if (getToken()) {
      fetchMe();
    } else {
      setLoading(false);
    }
  }, [fetchMe]);

  const login = async (email, password) => {
    const data = await apiRequest("/api/kitchen/auth/login", {
      method: "POST",
      body: JSON.stringify({ email, password })
    });
    setToken(data.token);
    setUser(data.user);
    return data.user;
  };

  const logout = async () => {
    try {
      await apiRequest("/api/kitchen/auth/logout", { method: "POST" });
    } finally {
      setToken(null);
      setUser(null);
    }
  };

  const value = useMemo(() => ({ user, loading, login, logout }), [user, loading]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error("AuthProvider faltante");
  return context;
}
