import React from "react";
import { Navigate, useLocation } from "react-router-dom";
import { buildReturnTo, storePostAuthRedirect } from "./authRedirect.js";
import { AppLoadingScreen } from "./components/WeekPageSkeleton.jsx";
import { isUserAuthenticated, useAuth } from "./auth";

function ClerkApiUnavailableScreen({ onRetry }) {
  return (
    <div
      style={{
        minHeight: "100dvh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        flexDirection: "column",
        gap: 16,
        padding: "24px 20px",
        textAlign: "center",
        background: "var(--surface-bg, #f8fafc)"
      }}
    >
      <div
        style={{
          maxWidth: 420,
          background: "#fff",
          borderRadius: 16,
          padding: "28px 24px",
          boxShadow: "0 2px 16px rgba(0,0,0,0.08)",
          border: "1px solid var(--border-muted, #e5e7eb)"
        }}
      >
        <div style={{ fontSize: 32, marginBottom: 12 }}>⚡</div>
        <h2 style={{ margin: "0 0 8px", fontSize: 18, fontWeight: 700, color: "var(--text-primary, #111827)" }}>
          Acceso temporalmente no disponible
        </h2>
        <p style={{ margin: "0 0 20px", fontSize: 14, color: "var(--text-muted, #6b7280)", lineHeight: 1.6 }}>
          El proveedor de autenticación está experimentando problemas temporales.
          Tu sesión es válida — inténtalo de nuevo en unos segundos.
        </p>
        <button
          type="button"
          className="kitchen-button"
          style={{ width: "100%", marginBottom: 10 }}
          onClick={onRetry}
        >
          Reintentar acceso
        </button>
        <p style={{ margin: 0, fontSize: 12, color: "var(--text-muted, #9ca3af)" }}>
          Si el problema persiste, recarga la página o contacta con soporte.
        </p>
      </div>
    </div>
  );
}

export default function RequireAuth({ children, roles }) {
  const { user, loading, onboardingRequired, clerkSignedIn, lastAuthError, refreshUser } = useAuth();
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

  if (clerkSignedIn && !isAuthenticated && !onboardingRequired && !lastAuthError) {
    return (
      <AppLoadingScreen
        title="Preparando Lunchfy"
        subtitle="Estamos abriendo tu cocina con tu sesion segura."
      />
    );
  }

  // Clerk API outage: show friendly retry screen instead of the generic complete flow.
  if (clerkSignedIn && !isAuthenticated && !onboardingRequired && lastAuthError?.code === "CLERK_API_UNAVAILABLE") {
    return (
      <ClerkApiUnavailableScreen
        onRetry={() => refreshUser({ authMode: "clerk" })}
      />
    );
  }

  if (clerkSignedIn && !isAuthenticated && !onboardingRequired && lastAuthError) {
    return <Navigate to="/auth/clerk/complete" replace />;
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
    if (location.pathname.startsWith("/admin")) {
      return <Navigate to="/admin/login" replace />;
    }
    return <Navigate to="/kitchen/semana" replace />;
  }

  return children;
}
