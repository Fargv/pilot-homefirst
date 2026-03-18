import React from "react";
import { Navigate } from "react-router-dom";
import { AppLoadingScreen } from "./components/WeekPageSkeleton.jsx";
import { isUserAuthenticated, useAuth } from "./auth";

export default function RequireAuth({ children, roles }) {
  const { user, loading } = useAuth();
  const isAuthenticated = isUserAuthenticated(user);

  if (loading) {
    return (
      <AppLoadingScreen
        title="Cargando sesion"
        subtitle="Estamos restaurando tu acceso y preparando la vista principal."
      />
    );
  }

  if (!isAuthenticated) return <Navigate to="/login" replace />;

  if (roles && !roles.includes(user.role)) {
    return <Navigate to="/kitchen/semana" replace />;
  }

  return children;
}
