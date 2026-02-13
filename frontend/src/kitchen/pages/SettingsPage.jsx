import React from "react";
import { useNavigate } from "react-router-dom";
import KitchenLayout from "../Layout.jsx";
import { useAuth } from "../auth";

export default function SettingsPage() {
  const { logout } = useAuth();
  const navigate = useNavigate();

  const handleLogout = async () => {
    try {
      await logout();
    } finally {
      navigate("/login", { replace: true });
    }
  };

  return (
    <KitchenLayout>
      <div className="kitchen-card">
        <h2>Configuración</h2>
        <p className="kitchen-muted">Personaliza tu experiencia en Kitchen.</p>
        <button type="button" className="kitchen-button secondary" onClick={handleLogout}>
          Cerrar sesión
        </button>
      </div>
    </KitchenLayout>
  );
}
