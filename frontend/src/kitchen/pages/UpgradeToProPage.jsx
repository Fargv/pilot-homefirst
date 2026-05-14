import React, { useEffect, useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import KitchenLayout from "../Layout.jsx";
import { apiRequest, createCheckoutSession, createCustomerPortalSession } from "../api.js";
import { getPlanLimits, isUnlimitedLicenseLimit } from "../subscription.js";

const STRIPE_ENABLED = import.meta.env.VITE_STRIPE_ENABLED === "true";
const PAYMENTS_MODE = import.meta.env.VITE_PAYMENTS_MODE || "disabled";
const IS_TEST_MODE = PAYMENTS_MODE === "test";

const PRICE_IDS = {
  pro: import.meta.env.VITE_STRIPE_PRO_PRICE_ID || "",
  premium: import.meta.env.VITE_STRIPE_PREMIUM_PRICE_ID || ""
};

const PLANS = [
  {
    id: "basic",
    name: "Basic",
    price: "Gratis",
    tagline: "El plan base, con lo esencial para organizar tu semana.",
    features: [
      { label: "Planificación semanal completa", included: true },
      { label: "Randomización día a día", included: true },
      { label: "Lista de la compra", included: true },
      { label: "Randomización de semana completa", included: false },
      { label: "Presupuesto y control de gasto", included: false }
    ]
  },
  {
    id: "pro",
    name: "Pro",
    price: "€4.99/mes",
    tagline: "La opción recomendada para familias activas.",
    recommended: true,
    features: [
      { label: "Planificación semanal completa", included: true },
      { label: "Randomización día a día", included: true },
      { label: "Lista de la compra", included: true },
      { label: "Randomización de semana completa", included: true },
      { label: "Presupuesto y control de gasto", included: true }
    ]
  },
  {
    id: "premium",
    name: "Premium",
    price: "€8.99/mes",
    tagline: "Para hogares que quieren el máximo y soporte ampliado.",
    features: [
      { label: "Todo lo de Pro", included: true },
      { label: "Usuarios ilimitados", included: true },
      { label: "Comensales ilimitados", included: true },
      { label: "Acceso prioritario a nuevas funciones", included: true },
      { label: "Soporte beta ampliado", included: true }
    ]
  }
];

function CheckIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden="true" style={{ flexShrink: 0 }}>
      <circle cx="8" cy="8" r="8" fill="#16a34a" />
      <path d="M4.5 8l2.5 2.5L11.5 5.5" stroke="#fff" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function CrossIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden="true" style={{ flexShrink: 0 }}>
      <circle cx="8" cy="8" r="8" fill="#e5e7eb" />
      <path d="M5.5 5.5l5 5M10.5 5.5l-5 5" stroke="#9ca3af" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  );
}

export default function UpgradeToProPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [summaryLoading, setSummaryLoading] = useState(true);
  const [loadingPlanId, setLoadingPlanId] = useState("");
  const [portalLoading, setPortalLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [requestedPlan, setRequestedPlan] = useState("");
  const [subscriptionPlan, setSubscriptionPlan] = useState("basic");
  const [hasActiveStripeSubscription, setHasActiveStripeSubscription] = useState(false);
  const [householdLicense, setHouseholdLicense] = useState(null);

  const from = searchParams.get("from") || "";
  const backPath = from || "/kitchen/configuracion";

  const selectedPlan = useMemo(
    () => PLANS.find((plan) => plan.id === requestedPlan) || null,
    [requestedPlan]
  );

  useEffect(() => {
    let active = true;
    const loadSummary = async () => {
      setSummaryLoading(true);
      try {
        const data = await apiRequest("/api/kitchen/household/summary");
        if (!active) return;
        setSubscriptionPlan(String(data?.household?.subscriptionPlan || "basic").toLowerCase());
        setRequestedPlan(String(data?.household?.subscriptionRequestedPlan || "").toLowerCase());
        setHasActiveStripeSubscription(Boolean(data?.household?.hasActiveStripeSubscription));
        setHouseholdLicense(data?.household?.license || null);
      } catch (loadError) {
        if (!active) return;
        setError(loadError.message || "No se pudo cargar la suscripción actual.");
      } finally {
        if (active) setSummaryLoading(false);
      }
    };
    void loadSummary();
    return () => { active = false; };
  }, []);

  const handlePlanAction = async (planId) => {
    if (planId === "basic") return;
    setLoadingPlanId(planId);
    setError("");
    setSuccess("");

    // ── Stripe Checkout path ────────────────────────────────────────────────
    if (STRIPE_ENABLED && PRICE_IDS[planId]) {
      try {
        const { url } = await createCheckoutSession({
          type: "subscription",
          planKey: planId,
          targetName: `Plan ${planId}`,
          stripePriceId: PRICE_IDS[planId]
        });
        window.location.href = url;
      } catch (checkoutError) {
        console.error("[upgrade] createCheckoutSession failed", checkoutError);
        if (checkoutError.body?.code === "SUBSCRIPTION_ACTIVE") {
          setError("Ya tienes una suscripción activa. Usa el portal de facturación para cambiar de plan.");
        } else {
          setError(checkoutError.message || "No se pudo iniciar el proceso de pago. Inténtalo de nuevo.");
        }
        setLoadingPlanId("");
      }
      return;
    }

    // ── Fallback: legacy "request" flow (beta / payments disabled) ──────────
    try {
      await apiRequest("/api/subscription/request", {
        method: "POST",
        body: JSON.stringify({ plan: planId })
      });
      setRequestedPlan(planId);
      setSuccess(
        PAYMENTS_MODE === "disabled"
          ? "Solicitud enviada. Un administrador activará tu plan durante la beta."
          : "Solicitud enviada."
      );
    } catch (requestError) {
      setError(requestError.message || "No se pudo enviar la solicitud.");
    } finally {
      setLoadingPlanId("");
    }
  };

  const handleOpenPortal = async () => {
    setPortalLoading(true);
    setError("");
    try {
      const { url } = await createCustomerPortalSession();
      window.location.href = url;
    } catch (portalError) {
      setError(portalError.message || "No se pudo abrir el portal de facturación.");
      setPortalLoading(false);
    }
  };

  const getButtonLabel = (plan) => {
    const { id } = plan;
    if (subscriptionPlan === id) return "Plan actual";
    if (loadingPlanId === id) return STRIPE_ENABLED && PRICE_IDS[id] ? "Redirigiendo..." : "Enviando...";
    if (id === "basic") return "Mantener Basic";

    if (STRIPE_ENABLED && PRICE_IDS[id]) {
      return IS_TEST_MODE ? `Probar compra — ${plan.price}` : `Suscribirse — ${plan.price}`;
    }

    if (requestedPlan === id) return "✓ Solicitud enviada";
    return `Solicitar ${plan.name}`;
  };

  return (
    <KitchenLayout>
      <div className="upgrade-page">

        {IS_TEST_MODE && STRIPE_ENABLED && (
          <div className="payment-test-mode-banner" role="status">
            MODO TEST — Los pagos son simulados. No se realizarán cargos reales.
          </div>
        )}

        <div className="upgrade-hero">
          <button
            type="button"
            className="kitchen-button secondary"
            onClick={() => navigate(backPath)}
          >
            ← Volver
          </button>
          <div className="upgrade-hero-copy">
            <span className="upgrade-eyebrow">Planes</span>
            <h1>{subscriptionPlan === "premium" ? "Cambiar suscripción" : "Desbloquea todo"}</h1>
            <p className="kitchen-muted">
              {STRIPE_ENABLED
                ? IS_TEST_MODE
                  ? "Elige el plan que mejor se adapte a tu hogar. Estás en entorno de pruebas — ningún cargo será real."
                  : "Elige el plan que mejor se adapte a tu hogar."
                : "Elige el plan que mejor se adapte a tu hogar. Durante la beta, la activación la realiza un administrador — sin pagos por ahora."}
            </p>
            {subscriptionPlan && !summaryLoading ? (
              <span className={`upgrade-current-plan-chip upgrade-current-plan-${subscriptionPlan}`}>
                Plan actual: <strong>{subscriptionPlan === "premium" ? "Premium" : subscriptionPlan === "pro" ? "Pro" : "Basic"}</strong>
              </span>
            ) : null}
          </div>
        </div>

        {error ? <div className="kitchen-alert error">{error}</div> : null}
        {success ? <div className="kitchen-alert success">{success}</div> : null}
        {summaryLoading ? <p className="kitchen-muted">Cargando...</p> : null}

        {STRIPE_ENABLED && hasActiveStripeSubscription && !summaryLoading && (
          <div className="upgrade-portal-section">
            <p className="kitchen-muted" style={{ marginBottom: 8 }}>
              Tienes una suscripción activa gestionada por Stripe.
            </p>
            <button
              type="button"
              className="kitchen-button secondary"
              onClick={handleOpenPortal}
              disabled={portalLoading}
            >
              {portalLoading ? "Abriendo portal..." : "Gestionar suscripción"}
            </button>
          </div>
        )}

        <div className="upgrade-plan-grid">
          {PLANS.map((plan) => {
            const isLoading = loadingPlanId === plan.id;
            const isRequested = requestedPlan === plan.id;
            const isCurrent = subscriptionPlan === plan.id;
            const limits = getPlanLimits(plan.id);
            const hasStripePrice = Boolean(STRIPE_ENABLED && PRICE_IDS[plan.id]);

            return (
              <article
                key={plan.id}
                className={`upgrade-plan-card ${plan.recommended ? "is-recommended" : ""} ${isCurrent ? "is-current" : ""}`}
              >
                {plan.recommended ? <span className="upgrade-badge">Recomendado</span> : null}
                {isCurrent && !plan.recommended ? <span className="upgrade-badge is-current-badge">Plan actual</span> : null}

                <div className="upgrade-plan-head">
                  <h2>{plan.name}</h2>
                  <strong className="upgrade-plan-price">{plan.price}</strong>
                </div>
                <p className="upgrade-plan-tagline">{plan.tagline}</p>

                <ul className="upgrade-feature-list">
                  {plan.features.map((feature) => (
                    <li key={feature.label} className={`upgrade-feature-item ${feature.included ? "is-included" : "is-excluded"}`}>
                      {feature.included ? <CheckIcon /> : <CrossIcon />}
                      <span>{feature.label}</span>
                    </li>
                  ))}
                  <li className="upgrade-feature-item is-included">
                    <CheckIcon />
                    <span>
                      {isUnlimitedLicenseLimit(limits.maxUsers) ? "Usuarios ilimitados" : `Hasta ${limits.maxUsers} usuarios`}
                    </span>
                  </li>
                </ul>

                <button
                  type="button"
                  className={`kitchen-button ${plan.recommended ? "" : "secondary"} ${hasStripePrice && !isCurrent ? "payment-checkout-btn" : ""}`}
                  onClick={() => isCurrent || plan.id === "basic" ? null : handlePlanAction(plan.id)}
                  disabled={Boolean(loadingPlanId) || isCurrent || plan.id === "basic"}
                >
                  {getButtonLabel(plan)}
                </button>

                {hasStripePrice && !isCurrent && IS_TEST_MODE && (
                  <p className="kitchen-muted" style={{ fontSize: "0.72rem", marginTop: 6, textAlign: "center" }}>
                    Pago de prueba — no se cobrarán fondos reales
                  </p>
                )}
              </article>
            );
          })}
        </div>

        {!STRIPE_ENABLED && selectedPlan && !summaryLoading ? (
          <div className="upgrade-footnote">
            <strong>{selectedPlan.name} solicitado</strong>
            <span className="kitchen-muted">
              Tu hogar ha solicitado este plan. Se activará en cuanto un administrador lo confirme durante la beta.
            </span>
          </div>
        ) : null}

        <div style={{ textAlign: "center", marginTop: 16 }}>
          <button
            type="button"
            className="kitchen-button secondary"
            onClick={() => navigate(backPath)}
          >
            ← Volver
          </button>
        </div>
      </div>
    </KitchenLayout>
  );
}
