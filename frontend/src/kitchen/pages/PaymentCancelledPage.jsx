import React from "react";
import { useNavigate } from "react-router-dom";
import KitchenLayout from "../Layout.jsx";

const isTestMode = import.meta.env.VITE_PAYMENTS_MODE === "test";

export default function PaymentCancelledPage() {
  const navigate = useNavigate();

  return (
    <KitchenLayout>
      <div className="payment-result-page">
        {isTestMode && (
          <div className="payment-test-mode-banner" role="status">
            MODO TEST — Ningún cargo real ha sido realizado
          </div>
        )}

        <div className="payment-result-card">
          <div className="payment-result-icon payment-result-icon--cancelled" aria-hidden="true">
            <svg viewBox="0 0 64 64" fill="none">
              <circle cx="32" cy="32" r="32" fill="#f3f4f6" />
              <path
                d="M22 22l20 20M42 22L22 42"
                stroke="#9ca3af"
                strokeWidth="3.5"
                strokeLinecap="round"
              />
            </svg>
          </div>

          <h1 className="payment-result-title">Pago cancelado</h1>

          <p className="payment-result-body kitchen-muted">
            Has cancelado el proceso de pago. No se ha realizado ningún cargo.
            Puedes volver e intentarlo cuando quieras.
          </p>

          <div className="payment-result-actions">
            <button
              type="button"
              className="kitchen-button"
              onClick={() => navigate(-1)}
            >
              ← Volver
            </button>
            <button
              type="button"
              className="kitchen-button secondary"
              onClick={() => navigate("/kitchen/catalogo")}
            >
              Ver catálogo
            </button>
          </div>
        </div>
      </div>
    </KitchenLayout>
  );
}
