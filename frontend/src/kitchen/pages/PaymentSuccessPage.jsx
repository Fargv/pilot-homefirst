import React, { useEffect, useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import KitchenLayout from "../Layout.jsx";
import { apiRequest, devApplyLatestSubscription } from "../api.js";
import { useAuth } from "../auth.jsx";

const isTestMode = import.meta.env.VITE_PAYMENTS_MODE === "test";
const STRIPE_ENABLED = import.meta.env.VITE_STRIPE_ENABLED === "true";

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
  const purchaseType = searchParams.get("type") || "subscription";
  const isPack = purchaseType === "pack";
  const { refreshUser } = useAuth();

  const [checking, setChecking] = useState(!isPack);
  const [activePlan, setActivePlan] = useState(null);
  const [planUpdated, setPlanUpdated] = useState(false);
  const [devFallbackUsed, setDevFallbackUsed] = useState(false);
  const pollCountRef = useRef(0);
  const timerRef = useRef(null);

  useEffect(() => {
    if (isPack) return; // packs: no polling needed, webhook handles entitlement asynchronously

    let cancelled = false;

    const checkPlan = async () => {
      try {
        const data = await apiRequest("/api/kitchen/household/summary");
        if (cancelled) return;
        const plan = String(data?.household?.subscriptionPlan || "basic").toLowerCase();
        setActivePlan(plan);

        if (PAID_PLANS.has(plan)) {
          setPlanUpdated(true);
          setChecking(false);
          refreshUser().catch(() => {});
          return;
        }

        pollCountRef.current += 1;

        if (pollCountRef.current < POLL_MAX_ATTEMPTS) {
          timerRef.current = setTimeout(checkPlan, POLL_INTERVAL_MS);
          return;
        }

        // Polls exhausted. In DEV test mode, try the fallback endpoint once.
        if (isTestMode && STRIPE_ENABLED && !devFallbackUsed) {
          setDevFallbackUsed(true);
          try {
            if (import.meta.env.DEV) {
              console.log("[PaymentSuccess] Polls exhausted — trying DEV fallback apply-latest-subscription");
            }
            const fallbackData = await devApplyLatestSubscription();
            if (cancelled) return;
            const fallbackPlan = String(fallbackData?.household?.subscriptionPlan || "basic").toLowerCase();
            setActivePlan(fallbackPlan);
            if (PAID_PLANS.has(fallbackPlan)) {
              setPlanUpdated(true);
              setChecking(false);
              refreshUser().catch(() => {});
              return;
            }
          } catch (fallbackErr) {
            if (import.meta.env.DEV) {
              console.warn("[PaymentSuccess] DEV fallback failed", fallbackErr?.message);
            }
          }
        }

        setChecking(false);
        refreshUser().catch(() => {});
      } catch {
        if (!cancelled) setChecking(false);
      }
    };

    timerRef.current = setTimeout(checkPlan, POLL_DELAY_MS);

    return () => {
      cancelled = true;
      clearTimeout(timerRef.current);
    };
  }, [isPack, refreshUser, devFallbackUsed]);

  const title = isTestMode ? "Pago de prueba completado" : "Pago completado";

  let bodyText;
  if (isPack) {
    bodyText = isTestMode
      ? "Pack adquirido en modo prueba. Estará disponible en tu biblioteca en unos instantes."
      : "Pack adquirido correctamente. Ya está disponible en tu biblioteca.";
  } else if (checking) {
    bodyText = "Verificando tu plan… un momento.";
  } else if (planUpdated && activePlan) {
    bodyText = null; // rendered inline with PlanLabel
  } else {
    bodyText = "Pago registrado. La licencia puede tardar unos segundos en actualizarse. Vuelve a la configuración para comprobar el estado.";
  }

  return (
    <KitchenLayout>
      <div className="payment-result-page">
        {isTestMode && (
          <div className="payment-test-mode-banner" role="status">
            Pago de prueba · No se ha cobrado dinero real
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

          <h1 className="payment-result-title">{title}</h1>

          {bodyText ? (
            <p className="payment-result-body kitchen-muted">{bodyText}</p>
          ) : planUpdated && activePlan ? (
            <p className="payment-result-body kitchen-muted">
              Tu plan se ha actualizado correctamente{isTestMode ? " en el entorno de prueba" : ""}.{" "}
              Ahora tienes el plan <PlanLabel plan={activePlan} /> activo.
            </p>
          ) : null}

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
            {isPack ? (
              <>
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
                  Ir a configuración
                </button>
              </>
            ) : (
              <>
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
              </>
            )}
          </div>
        </div>
      </div>
    </KitchenLayout>
  );
}
