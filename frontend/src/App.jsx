import React, { useEffect } from "react";
import { BrowserRouter, Route, Routes, useLocation, useNavigate } from "react-router-dom";
import { AuthProvider, isUserAuthenticated, useAuth } from "./kitchen/auth";
import { buildApiUrl } from "./kitchen/api.js";
import KitchenLayout from "./kitchen/Layout.jsx";
import RequireAuth from "./kitchen/RequireAuth.jsx";
import AdminUsersPage from "./kitchen/pages/AdminUsersPage.jsx";
import BootstrapPage from "./kitchen/pages/BootstrapPage.jsx";
import LoginPage from "./kitchen/pages/LoginPage.jsx";
import WeekPage from "./kitchen/pages/WeekPage.jsx";
import DishesPage from "./kitchen/pages/DishesPage.jsx";
import ShoppingPage from "./kitchen/pages/ShoppingPage.jsx";
import SwapsPage from "./kitchen/pages/SwapsPage.jsx";
import SettingsPage from "./kitchen/pages/SettingsPage.jsx";
import "./kitchen/kitchen.css";

function HomeRedirect() {
  const { user, loading } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (loading) return;
    const destination = isUserAuthenticated(user) ? "/kitchen/semana" : "/login";
    navigate(destination, { replace: true });
  }, [loading, navigate, user]);

  return (
    <div className="kitchen-app">
      <div className="kitchen-container" style={{ maxWidth: 520 }}>
        <div className="kitchen-card">
          <h2>Cargando Lunchfy...</h2>
          <p className="kitchen-muted">
            Estamos preparando tu acceso a Lunchfy. En unos segundos te redirigimos.
          </p>
        </div>
      </div>
    </div>
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

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <BootstrapRedirect />
        <Routes>
          <Route path="/" element={<HomeRedirect />} />
          <Route path="/bootstrap" element={<BootstrapPage />} />
          <Route path="/login" element={<LoginPage />} />
          <Route path="/kitchen/login" element={<LoginPage />} />
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
                  <div className="kitchen-card">Selecciona una sección.</div>
                </KitchenLayout>
              </RequireAuth>
            )}
          />
          <Route path="*" element={<HomeRedirect />} />
        </Routes>
      </AuthProvider>
    </BrowserRouter>
  );
}
