import React from "react";
import { useNavigate } from "react-router-dom";

export default function DinnerUpgradeBanner({ onClose, className = "" }) {
  const navigate = useNavigate();

  return (
    <div className={`dinner-upgrade-banner ${className}`.trim()} role="region" aria-label="Función Pro">
      <div className="dinner-upgrade-banner-icon" aria-hidden="true">
        <svg viewBox="0 0 24 24" width="22" height="22" fill="none">
          <path d="M21 12.79A9 9 0 1111.21 3a7 7 0 009.79 9.79z" fill="currentColor" opacity=".18" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" />
          <path d="M21 12.79A9 9 0 1111.21 3a7 7 0 009.79 9.79z" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" />
          <path d="M15 9l-4.5 4.5M15 13.5L10.5 9" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" opacity="0" />
        </svg>
      </div>
      <div className="dinner-upgrade-banner-body">
        <p className="dinner-upgrade-banner-title">Las cenas están disponibles en Pro</p>
        <p className="dinner-upgrade-banner-desc">Desbloquea planificación completa semanal con comidas y cenas.</p>
      </div>
      <div className="dinner-upgrade-banner-actions">
        <button
          type="button"
          className="kitchen-button dinner-upgrade-banner-cta"
          onClick={() => navigate(`/kitchen/upgrade?from=${encodeURIComponent(window.location.pathname)}`)}
        >
          Upgrade License
        </button>
        {onClose ? (
          <button
            type="button"
            className="dinner-upgrade-banner-close"
            onClick={onClose}
            aria-label="Cerrar"
          >
            <svg viewBox="0 0 16 16" width="14" height="14" fill="none" aria-hidden="true">
              <path d="M3 3l10 10M13 3L3 13" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
            </svg>
          </button>
        ) : null}
      </div>
    </div>
  );
}
