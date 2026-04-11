import React from "react";
import { Navigate, useLocation } from "react-router-dom";
import { buildReturnTo, storePostAuthRedirect } from "./authRedirect.js";
import { AppLoadingScreen } from "./components/WeekPageSkeleton.jsx";
import { isUserAuthenticated, useAuth } from "./auth";

export default function RequireAuth({ children, roles }) {
  const { user, loading, onboardingRequired } = useAuth();
  const location = useLocation();
  const isAuthenticated = isUserAuthenticated(user);

  if (loading) {
    return (
      <AppLoadingScreen
        title="Cargando sesion"
        subtitle="Estamos restaurando tu acceso y preparando la vista principal."
      />
    );
  }

  if (onboardingRequired) {
    return <Navigate to="/onboarding/clerk" replace />;
  }

  if (!isAuthenticated) {
    const next = buildReturnTo(location);
    storePostAuthRedirect(next);
    return <Navigate to={`/login?next=${encodeURIComponent(next)}`} replace />;
  }

  if (roles && !roles.includes(user.role)) {
    return <Navigate to="/kitchen/semana" replace />;
  }

  return children;
}
