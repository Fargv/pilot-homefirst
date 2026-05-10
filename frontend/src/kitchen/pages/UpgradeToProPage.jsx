import React, { useEffect, useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import KitchenLayout from "../Layout.jsx";
import { apiRequest } from "../api.js";
import { getPlanLimits, isUnlimitedLicenseLimit } from "../subscription.js";

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
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [requestedPlan, setRequestedPlan] = useState("");
  const [subscriptionPlan, setSubscriptionPlan] = useState("basic");
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

  const requestPlan = async (planId) => {
    setLoadingPlanId(planId);
    setError("");
    setSuccess("");
    try {
      await apiRequest("/api/subscription/request", {
        method: "POST",
        body: JSON.stringify({ plan: planId })
      });
      setRequestedPlan(planId);
      setSuccess("Solicitud enviada. Un administrador activará tu plan durante la beta.");
    } catch (requestError) {
      setError(requestError.message || "No se pudo enviar la solicitud.");
    } finally {
      setLoadingPlanId("");
    }
  };

  return (
    <KitchenLayout>
      <div className="upgrade-page">

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
              Elige el plan que mejor se adapte a tu hogar. Durante la beta, la activación la realiza un administrador — sin pagos por ahora.
            </p>
            {householdLicense ? (
              <span className="kitchen-muted" style={{ fontSize: 13 }}>
                Usuarios: {householdLicense?.usage?.users || 0} / {isUnlimitedLicenseLimit(householdLicense?.limits?.maxUsers) ? "∞" : householdLicense?.limits?.maxUsers}
                {" · "}
                Comensales: {householdLicense?.usage?.nonUserDiners || 0} / {isUnlimitedLicenseLimit(householdLicense?.limits?.maxNonUserDiners) ? "∞" : householdLicense?.limits?.maxNonUserDiners}
              </span>
            ) : null}
          </div>
        </div>

        {error ? <div className="kitchen-alert error">{error}</div> : null}
        {success ? <div className="kitchen-alert success">{success}</div> : null}
        {summaryLoading ? <p className="kitchen-muted">Cargando...</p> : null}

        <div className="upgrade-plan-grid">
          {PLANS.map((plan) => {
            const isLoading = loadingPlanId === plan.id;
            const isRequested = requestedPlan === plan.id;
            const isCurrent = subscriptionPlan === plan.id;
            const limits = getPlanLimits(plan.id);

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
                  className={`kitchen-button ${plan.recommended ? "" : "secondary"}`}
                  onClick={() => isCurrent ? null : requestPlan(plan.id)}
                  disabled={Boolean(loadingPlanId) || isCurrent}
                >
                  {isCurrent
                    ? "Plan actual"
                    : isLoading
                    ? "Enviando..."
                    : isRequested
                    ? "✓ Solicitud enviada"
                    : plan.id === "basic"
                    ? "Mantener Basic"
                    : `Solicitar ${plan.name}`}
                </button>
              </article>
            );
          })}
        </div>

        {selectedPlan && !summaryLoading ? (
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
