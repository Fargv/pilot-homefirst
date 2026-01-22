import React from "react";
import { Link } from "react-router-dom";

export default function DashboardPage() {
  return (
    <div className="app-shell">
      <div className="app-panel">
        <h1 className="app-title">Panel</h1>
        <p className="app-subtitle">Aquí verás tu resumen y accesos.</p>
        <div className="app-empty">
          <div className="app-empty-title">Todavía no hay actividad.</div>
          <p className="app-muted">Empieza por el módulo principal.</p>
          <Link className="app-primary-button" to="/kitchen/semana">
            Ir a Kitchen
          </Link>
        </div>
      </div>
    </div>
  );
}
