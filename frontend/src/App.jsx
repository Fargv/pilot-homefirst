import React, { useEffect } from "react";
import { BrowserRouter, Route, Routes, useLocation, useNavigate } from "react-router-dom";
import { AuthProvider, ClerkEnabledAuthProvider, isUserAuthenticated, useAuth } from "./kitchen/auth";
import { buildApiUrl } from "./kitchen/api.js";
import KitchenLayout from "./kitchen/Layout.jsx";
import RequireAuth from "./kitchen/RequireAuth.jsx";
import AdminUsersPage from "./kitchen/pages/AdminUsersPage.jsx";
import AdminLoginPage from "./kitchen/pages/AdminLoginPage.jsx";
import AdminPanelPage from "./kitchen/pages/AdminPanelPage.jsx";
import AdminForgotPasswordPage from "./kitchen/pages/AdminForgotPasswordPage.jsx";
import AdminResetPasswordPage from "./kitchen/pages/AdminResetPasswordPage.jsx";
import BootstrapPage from "./kitchen/pages/BootstrapPage.jsx";
import ClerkAuthPage from "./kitchen/pages/ClerkAuthPage.jsx";
import ClerkOnboardingPage from "./kitchen/pages/ClerkOnboardingPage.jsx";
import WeekPage from "./kitchen/pages/WeekPage.jsx";
import DishesPage from "./kitchen/pages/DishesPage.jsx";
import ShoppingPage from "./kitchen/pages/ShoppingPage.jsx";
import ShoppingBudgetPage from "./kitchen/pages/ShoppingBudgetPage.jsx";
import SwapsPage from "./kitchen/pages/SwapsPage.jsx";
import SettingsPage from "./kitchen/pages/SettingsPage.jsx";
import UpgradeToProPage from "./kitchen/pages/UpgradeToProPage.jsx";
import CatalogPage from "./kitchen/pages/CatalogPage.jsx";
import InviteLandingPage from "./kitchen/pages/InviteLandingPage.jsx";
import PaymentSuccessPage from "./kitchen/pages/PaymentSuccessPage.jsx";
import PaymentCancelledPage from "./kitchen/pages/PaymentCancelledPage.jsx";
import DevEnvironmentBanner from "./components/DevEnvironmentBanner.jsx";
import AppErrorBoundary from "./components/AppErrorBoundary.jsx";
import PwaInstallPrompt from "./kitchen/components/PwaInstallPrompt.jsx";
import { AppLoadingScreen } from "./kitchen/components/WeekPageSkeleton.jsx";
import "./kitchen/kitchen.css";
import { QueryClientProvider } from "@tanstack/react-query";
import { queryClient } from "./kitchen/queryClient.js";
import { ActiveWeekProvider } from "./kitchen/weekContext.jsx";
import { OnboardingProvider } from "./kitchen/contexts/OnboardingContext.jsx";
import { WeeklyChallengeProvider } from "./kitchen/contexts/WeeklyChallengeContext.jsx";

const isDevelopmentEnvironment = import.meta.env.VITE_APP_ENV === "development";
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
    <QueryClientProvider client={queryClient}>
    <ActiveWeekProvider>
      <OnboardingProvider>
      <WeeklyChallengeProvider>
      <DevEnvironmentBanner />
      <PwaInstallPrompt />
      <BootstrapRedirect />
      <Routes>
        <Route path="/" element={<HomeRedirect />} />
        <Route path="/bootstrap" element={<BootstrapPage />} />
        <Route path="/sign-in/*" element={<ClerkAuthPage mode="sign-in" />} />
        <Route path="/login/*" element={<ClerkAuthPage mode="sign-in" />} />
        <Route path="/signup/*" element={<ClerkAuthPage mode="sign-up" />} />
        <Route path="/auth/clerk" element={<ClerkAuthPage mode="choice" />} />
        <Route path="/auth/clerk/sign-in/*" element={<ClerkAuthPage mode="sign-in" />} />
        <Route path="/auth/clerk/sign-up/*" element={<ClerkAuthPage mode="sign-up" />} />
        <Route path="/auth/clerk/reset-password/*" element={<ClerkAuthPage mode="reset-password" />} />
        <Route path="/auth/clerk/complete" element={<ClerkAuthPage mode="complete" />} />
        <Route path="/onboarding/clerk" element={<ClerkOnboardingPage />} />
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
          path="/kitchen/catalogo"
          element={(
            <RequireAuth>
              <CatalogPage />
            </RequireAuth>
          )}
        />
        <Route
          path="/payments/success"
          element={(
            <RequireAuth>
              <PaymentSuccessPage />
            </RequireAuth>
          )}
        />
        <Route
          path="/payments/cancelled"
          element={(
            <RequireAuth>
              <PaymentCancelledPage />
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
        <Route path="/admin/login" element={<AdminLoginPage />} />
        <Route path="/admin/forgot-password" element={<AdminForgotPasswordPage />} />
        <Route path="/admin/reset-password" element={<AdminResetPasswordPage />} />
        <Route path="/admin" element={<AdminPanelPage />} />
        <Route path="/admin/architecture" element={<AdminPanelPage />} />
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
      </WeeklyChallengeProvider>
      </OnboardingProvider>
    </ActiveWeekProvider>
    </QueryClientProvider>
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
