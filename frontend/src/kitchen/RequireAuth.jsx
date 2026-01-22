import React from "react";
import { Navigate } from "react-router-dom";
import { isUserAuthenticated, useAuth } from "./auth";

export default function RequireAuth({ children, roles }) {
  const { user, loading } = useAuth();
  const isAuthenticated = isUserAuthenticated(user);

  if (loading) {
    return (
      <div className="kitchen-card">
        <h3>Cargando sesión...</h3>
        <p className="kitchen-muted">Estamos preparando tu módulo Kitchen.</p>
      </div>
    );
  }

  if (!isAuthenticated) return <Navigate to="/login" replace />;

  if (roles && !roles.includes(user.role)) {
    return <Navigate to="/kitchen/semana" replace />;
  }

  return children;
}
