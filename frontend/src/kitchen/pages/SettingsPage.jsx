import React from "react";
import KitchenLayout from "../Layout.jsx";

export default function SettingsPage() {
  return (
    <KitchenLayout>
      <div className="kitchen-card">
        <h2>Configuración</h2>
        <p className="kitchen-muted">Personaliza tu experiencia en Kitchen.</p>
      </div>
    </KitchenLayout>
  );
}
