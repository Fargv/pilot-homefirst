import React from "react";
import { Navigate } from "react-router-dom";
import { useAuth } from "./auth.js";

export default function RequireAuth({ children }) {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <div className="kitchen-card">
        <h3>Cargando sesión...</h3>
        <p className="kitchen-muted">Estamos preparando tu módulo Kitchen.</p>
      </div>
    );
  }

  if (!user) return <Navigate to="/kitchen/login" replace />;

  return children;
}
