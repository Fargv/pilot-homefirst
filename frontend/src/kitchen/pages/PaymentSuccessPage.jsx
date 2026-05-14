import React from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import KitchenLayout from "../Layout.jsx";

const isTestMode = import.meta.env.VITE_PAYMENTS_MODE === "test";

export default function PaymentSuccessPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const sessionId = searchParams.get("session_id");

  return (
    <KitchenLayout>
      <div className="payment-result-page">
        {isTestMode && (
          <div className="payment-test-mode-banner" role="status">
            MODO TEST — Ningún cargo real ha sido realizado
          </div>
        )}

        <div className="payment-result-card">
          <div className="payment-result-icon payment-result-icon--success" aria-hidden="true">
            <svg viewBox="0 0 64 64" fill="none">
              <circle cx="32" cy="32" r="32" fill="#dcfce7" />
              <path
                d="M20 32l9 9 15-15"
                stroke="#16a34a"
                strokeWidth="3.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </div>

          <h1 className="payment-result-title">
            {isTestMode ? "Pago de prueba completado" : "Pago completado"}
          </h1>

          <p className="payment-result-body kitchen-muted">
            {isTestMode
              ? "Hemos recibido tu intento de compra en modo test. No se ha realizado ningún cargo real. Tu solicitud ha sido registrada."
              : "Tu pago ha sido procesado correctamente. En breve verás los cambios en tu cuenta."}
          </p>

          {isTestMode && (
            <p className="payment-result-note kitchen-muted" style={{ fontSize: "0.8rem" }}>
              Este es un entorno beta. Los pagos en modo test no activan planes ni descargan packs automáticamente.
            </p>
          )}

          {sessionId && import.meta.env.DEV && (
            <p className="payment-result-session kitchen-muted" style={{ fontSize: "0.75rem", wordBreak: "break-all" }}>
              Session ID: {sessionId}
            </p>
          )}

          <div className="payment-result-actions">
            <button
              type="button"
              className="kitchen-button"
              onClick={() => navigate("/kitchen/catalogo")}
            >
              Ver catálogo
            </button>
            <button
              type="button"
              className="kitchen-button secondary"
              onClick={() => navigate("/kitchen/configuracion")}
            >
              Configuración
            </button>
          </div>
        </div>
      </div>
    </KitchenLayout>
  );
}
