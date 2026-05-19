import React, { useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import KitchenLayout from "../Layout.jsx";
import { activatePaymentSession } from "../api.js";
import { useAuth } from "../auth.jsx";

const isTestMode = import.meta.env.VITE_PAYMENTS_MODE === "test";
const STRIPE_ENABLED = import.meta.env.VITE_STRIPE_ENABLED === "true";

const PAID_PLANS = new Set(["pro", "premium"]);

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
  const { setUser } = useAuth();

  const [checking, setChecking] = useState(!isPack);
  const [activePlan, setActivePlan] = useState(null);
  const [planUpdated, setPlanUpdated] = useState(false);
  const [activateError, setActivateError] = useState("");

  useEffect(() => {
    if (isPack || !sessionId) {
      setChecking(false);
      return;
    }

    let cancelled = false;

    const activate = async () => {
      try {
        const data = await activatePaymentSession(sessionId);
        if (cancelled) return;
        if (!data?.household) {
          setActivateError("Respuesta inesperada del servidor. Comprueba que VITE_API_URL apunta al backend correcto.");
          console.warn("[PaymentSuccess] session-activate returned no household", data);
          return;
        }
        const plan = String(data.household.subscriptionPlan || "basic").toLowerCase();
        setActivePlan(plan);
        if (PAID_PLANS.has(plan)) {
          setPlanUpdated(true);
          // Update the plan in auth context without triggering loading=true.
          // refreshUser() sets loading=true which unmounts this component via
          // RequireAuth, causing an infinite remount + re-activation loop.
          setUser(prev => prev ? {
            ...prev,
            subscriptionPlan: plan,
            subscriptionStatus: "active",
            isPro: true
          } : prev);
        }
      } catch (err) {
        if (cancelled) return;
        const msg = err?.body?.code === "ATTEMPT_NOT_FOUND"
          ? "No se encontró el intento de pago. Si completaste el checkout, el plan se actualizará en breve."
          : err?.body?.code === "NOT_PAID"
          ? "El pago no se completó en Stripe. Inténtalo de nuevo."
          : err?.message || "No se pudo activar el plan automáticamente.";
        setActivateError(msg);
        console.warn("[PaymentSuccess] session-activate failed", err?.body?.code, err?.message);
      } finally {
        if (!cancelled) setChecking(false);
      }
    };

    activate();

    return () => { cancelled = true; };
  }, [isPack, sessionId, setUser]);

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
  } else if (activateError) {
    bodyText = `Pago registrado, pero no se pudo activar la licencia automáticamente. ${activateError}`;
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
