import React, { useEffect, useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import KitchenLayout from "../Layout.jsx";
import { apiRequest } from "../api.js";
import { useAuth } from "../auth.jsx";

const isTestMode = import.meta.env.VITE_PAYMENTS_MODE === "test";

const PAID_PLANS = new Set(["pro", "premium"]);
const POLL_DELAY_MS = 2000;
const POLL_INTERVAL_MS = 2500;
const POLL_MAX_ATTEMPTS = 5;

function PlanLabel({ plan }) {
  if (plan === "pro") return <strong>Pro</strong>;
  if (plan === "premium") return <strong>Premium</strong>;
  return <strong>{plan}</strong>;
}

export default function PaymentSuccessPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const sessionId = searchParams.get("session_id");
  const { refreshUser } = useAuth();

  const [checking, setChecking] = useState(true);
  const [activePlan, setActivePlan] = useState(null);
  const [planUpdated, setPlanUpdated] = useState(false);
  const pollCountRef = useRef(0);
  const timerRef = useRef(null);

  useEffect(() => {
    let cancelled = false;

    const checkPlan = async () => {
      try {
        const data = await apiRequest("/api/kitchen/household/summary");
        if (cancelled) return;
        const plan = String(data?.household?.subscriptionPlan || "basic").toLowerCase();
        setActivePlan(plan);

        if (PAID_PLANS.has(plan)) {
          // Plan already upgraded — refresh auth context so the rest of the app sees it
          setPlanUpdated(true);
          setChecking(false);
          refreshUser().catch(() => {});
          return;
        }

        // Not yet upgraded — keep polling up to POLL_MAX_ATTEMPTS
        pollCountRef.current += 1;
        if (pollCountRef.current < POLL_MAX_ATTEMPTS) {
          timerRef.current = setTimeout(checkPlan, POLL_INTERVAL_MS);
        } else {
          // Webhook hasn't fired / entitlements disabled — show pending message
          setChecking(false);
          refreshUser().catch(() => {});
        }
      } catch {
        if (!cancelled) setChecking(false);
      }
    };

    // Brief initial delay to give the webhook time to process before first poll
    timerRef.current = setTimeout(checkPlan, POLL_DELAY_MS);

    return () => {
      cancelled = true;
      clearTimeout(timerRef.current);
    };
  }, [refreshUser]);

  return (
    <KitchenLayout>
      <div className="payment-result-page">
        <div className="payment-test-mode-banner" role="status">
          Pago de prueba · No se ha cobrado dinero real
        </div>

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

          {checking ? (
            <p className="payment-result-body kitchen-muted">
              Verificando tu plan… un momento.
            </p>
          ) : planUpdated && activePlan ? (
            <p className="payment-result-body kitchen-muted">
              Tu plan se ha actualizado correctamente en el entorno de prueba.{" "}
              Ahora tienes el plan <PlanLabel plan={activePlan} /> activo.
            </p>
          ) : (
            <p className="payment-result-body kitchen-muted">
              Pago de prueba registrado. La licencia puede tardar unos segundos en actualizarse.{" "}
              Vuelve a la configuración para comprobar el estado.
            </p>
          )}

          {isTestMode && (
            <p className="payment-result-note kitchen-muted" style={{ fontSize: "0.8rem" }}>
              Entorno de prueba — ningún cargo real ha sido procesado.
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
              onClick={() => navigate("/kitchen/configuracion")}
            >
              Volver a configuración
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
