import React, { useEffect } from "react";
import { BrowserRouter, Route, Routes, useLocation, useNavigate } from "react-router-dom";
import { AuthProvider, ClerkEnabledAuthProvider, isUserAuthenticated, useAuth } from "./kitchen/auth";
import { buildApiUrl } from "./kitchen/api.js";
import KitchenLayout from "./kitchen/Layout.jsx";
import RequireAuth from "./kitchen/RequireAuth.jsx";
import AdminUsersPage from "./kitchen/pages/AdminUsersPage.jsx";
import BootstrapPage from "./kitchen/pages/BootstrapPage.jsx";
import ClerkAuthPage from "./kitchen/pages/ClerkAuthPage.jsx";
import ClerkDevAuthPage from "./kitchen/pages/ClerkDevAuthPage.jsx";
import ClerkOnboardingPage from "./kitchen/pages/ClerkOnboardingPage.jsx";
import LoginPage from "./kitchen/pages/LoginPage.jsx";
import SignupPage from "./kitchen/pages/SignupPage.jsx";
import ForgotPasswordPage from "./kitchen/pages/ForgotPasswordPage.jsx";
import ResetPasswordPage from "./kitchen/pages/ResetPasswordPage.jsx";
import WeekPage from "./kitchen/pages/WeekPage.jsx";
import DishesPage from "./kitchen/pages/DishesPage.jsx";
import ShoppingPage from "./kitchen/pages/ShoppingPage.jsx";
import ShoppingBudgetPage from "./kitchen/pages/ShoppingBudgetPage.jsx";
import SwapsPage from "./kitchen/pages/SwapsPage.jsx";
import SettingsPage from "./kitchen/pages/SettingsPage.jsx";
import UpgradeToProPage from "./kitchen/pages/UpgradeToProPage.jsx";
import InviteLandingPage from "./kitchen/pages/InviteLandingPage.jsx";
import DevEnvironmentBanner from "./components/DevEnvironmentBanner.jsx";
import AppErrorBoundary from "./components/AppErrorBoundary.jsx";
import { AppLoadingScreen } from "./kitchen/components/WeekPageSkeleton.jsx";
import "./kitchen/kitchen.css";
import { ActiveWeekProvider } from "./kitchen/weekContext.jsx";

const isDevelopmentEnvironment = import.meta.env.VITE_APP_ENV === "development";
const isClerkDevAuthRouteEnabled = isDevelopmentEnvironment || import.meta.env.DEV;
const clerkPublishableKey = import.meta.env.VITE_CLERK_PUBLISHABLE_KEY;

function HomeRedirect() {
  const { user, loading, onboardingRequired } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (loading) return;
    const destination = onboardingRequired ? "/onboarding/clerk" : isUserAuthenticated(user) ? "/kitchen/semana" : "/login";
    navigate(destination, { replace: true });
  }, [loading, navigate, onboardingRequired, user]);

  return (
    <AppLoadingScreen
      title="Cargando Lunchfy"
      subtitle="Estamos preparando tu acceso y recuperando tu programacion."
    />
  );
}

function BootstrapRedirect() {
  const navigate = useNavigate();
  const location = useLocation();

  useEffect(() => {
    let active = true;
    const checkBootstrap = async () => {
      try {
        const response = await fetch(buildApiUrl("/api/users/bootstrap-needed"));
        const data = await response.json().catch(() => ({}));
        if (!active || !response.ok) return;
        if (data.needed && location.pathname !== "/bootstrap") {
          navigate("/bootstrap", { replace: true });
        }
        if (!data.needed && location.pathname === "/bootstrap") {
          navigate("/login", { replace: true });
        }
      } catch {
        // Sin bloqueo si el backend no responde.
      }
    };
    checkBootstrap();
    return () => {
      active = false;
    };
  }, [location.pathname, navigate]);

  return null;
}

function AppRoutes() {
  return (
    <ActiveWeekProvider>
      <DevEnvironmentBanner />
      <BootstrapRedirect />
      <Routes>
        <Route path="/" element={<HomeRedirect />} />
        <Route path="/bootstrap" element={<BootstrapPage />} />
        <Route path="/login" element={<LoginPage />} />
        {clerkPublishableKey ? <Route path="/auth/clerk" element={<ClerkAuthPage />} /> : null}
        {clerkPublishableKey ? <Route path="/onboarding/clerk" element={<ClerkOnboardingPage />} /> : null}
        {isClerkDevAuthRouteEnabled ? <Route path="/dev/clerk-auth" element={<ClerkDevAuthPage />} /> : null}
        <Route path="/kitchen/login" element={<LoginPage />} />
        <Route path="/register" element={<SignupPage />} />
        <Route path="/kitchen/register" element={<SignupPage />} />
        <Route path="/forgot-password" element={<ForgotPasswordPage />} />
        <Route path="/reset-password" element={<ResetPasswordPage />} />
        <Route path="/invite/:token" element={<InviteLandingPage />} />
        <Route
          path="/kitchen/semana"
          element={(
            <RequireAuth>
              <WeekPage />
            </RequireAuth>
          )}
        />
        <Route
          path="/kitchen/platos"
          element={(
            <RequireAuth>
              <DishesPage />
            </RequireAuth>
          )}
        />
        <Route
          path="/kitchen/compra"
          element={(
            <RequireAuth>
              <ShoppingPage />
            </RequireAuth>
          )}
        />
        <Route
          path="/kitchen/compra/presupuesto"
          element={(
            <RequireAuth>
              <ShoppingBudgetPage />
            </RequireAuth>
          )}
        />
        <Route
          path="/kitchen/cambios"
          element={(
            <RequireAuth>
              <SwapsPage />
            </RequireAuth>
          )}
        />
        <Route
          path="/kitchen/configuracion"
          element={(
            <RequireAuth>
              <SettingsPage />
            </RequireAuth>
          )}
        />
        <Route
          path="/kitchen/upgrade"
          element={(
            <RequireAuth>
              <UpgradeToProPage />
            </RequireAuth>
          )}
        />
        <Route
          path="/admin/usuarios"
          element={(
            <RequireAuth roles={["admin"]}>
              <AdminUsersPage />
            </RequireAuth>
          )}
        />
        <Route
          path="/kitchen"
          element={(
            <RequireAuth>
              <KitchenLayout>
                <div className="kitchen-card">Selecciona una seccion.</div>
              </KitchenLayout>
            </RequireAuth>
          )}
        />
        <Route path="*" element={<HomeRedirect />} />
      </Routes>
    </ActiveWeekProvider>
  );
}

function AuthBoundary() {
  if (clerkPublishableKey) {
    return (
      <ClerkEnabledAuthProvider>
        <AppRoutes />
      </ClerkEnabledAuthProvider>
    );
  }

  return (
    <AuthProvider>
      <AppRoutes />
    </AuthProvider>
  );
}

export default function App() {
  useEffect(() => {
    document.title = isDevelopmentEnvironment ? "Lunchfy DEV" : "Lunchfy";
  }, []);

  return (
    <AppErrorBoundary>
      <BrowserRouter>
        <AuthBoundary />
      </BrowserRouter>
    </AppErrorBoundary>
  );
}
