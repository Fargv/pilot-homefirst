import React, { useEffect, useState } from "react";
import { BrowserRouter, Link, Route, Routes, useLocation, useNavigate } from "react-router-dom";
import { AuthProvider } from "./kitchen/auth";
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
import "./kitchen/kitchen.css";

const API = import.meta.env.VITE_API_URL;

function HomePage() {
  const [msg, setMsg] = useState("—");

  async function ping() {
    setMsg("Llamando al backend...");
    const r = await fetch(buildApiUrl("/health"));
    const data = await r.json();
    setMsg(JSON.stringify(data, null, 2));
  }

  return (
    <div style={{ fontFamily: "system-ui", padding: 24, maxWidth: 900 }}>
      <h1>Piloto HomeFirst 🧪</h1>
      <p>Backend: <code>{API}</code></p>
      <div style={{ marginBottom: 16 }}>
        <Link to="/kitchen/semana">Ir a Kitchen</Link>
      </div>

      <button onClick={ping} style={{ padding: "10px 14px", cursor: "pointer" }}>
        Probar /health
      </button>

      <pre style={{ marginTop: 16, background: "#111", color: "#0f0", padding: 12, borderRadius: 8 }}>
        {msg}
      </pre>
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
          navigate("/kitchen/login", { replace: true });
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
          <Route path="/" element={<HomePage />} />
          <Route path="/bootstrap" element={<BootstrapPage />} />
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
        </Routes>
      </AuthProvider>
    </BrowserRouter>
  );
}
