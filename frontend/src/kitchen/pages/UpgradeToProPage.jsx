import React, { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import KitchenLayout from "../Layout.jsx";
import { apiRequest } from "../api.js";
import { getPlanLimits, isUnlimitedLicenseLimit } from "../subscription.js";

const PLANS = [
  {
    id: "basic",
    name: "Basic",
    price: "Free",
    tagline: "El plan base del household durante la beta, sin pagos.",
    features: [
      "Licencia base del household",
      "Sin integración de pago",
      "Preparado para upgrades futuros"
    ]
  },
  {
    id: "pro",
    name: "Pro",
    price: "€4.99/month",
    tagline: "La opción recomendada para familias activas.",
    recommended: true,
    features: [
      "Planificación inteligente preparada",
      "Más capacidad para futuras reglas automáticas",
      "Acceso prioritario a mejoras beta"
    ]
  },
  {
    id: "premium",
    name: "Premium",
    price: "€8.99/month",
    tagline: "Pensado para hogares que quieren el máximo margen de crecimiento.",
    features: [
      "Acceso temprano a herramientas premium",
      "Soporte beta ampliado",
      "Preparado para futuras integraciones avanzadas"
    ]
  }
];

export default function UpgradeToProPage() {
  const navigate = useNavigate();
  const [summaryLoading, setSummaryLoading] = useState(true);
  const [loadingPlanId, setLoadingPlanId] = useState("");
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [requestedPlan, setRequestedPlan] = useState("");
  const [subscriptionPlan, setSubscriptionPlan] = useState("basic");
  const [householdLicense, setHouseholdLicense] = useState(null);

  const selectedPlan = useMemo(
    () => PLANS.find((plan) => plan.id === requestedPlan) || null,
    [requestedPlan]
  );
  const heading = subscriptionPlan === "premium" ? "Change Subscription" : "Upgrade License";

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
    return () => {
      active = false;
    };
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
      setSuccess("Your subscription will be activated by the administrator during beta testing.");
    } catch (requestError) {
      setError(requestError.message || "No se pudo enviar la solicitud de suscripción.");
    } finally {
      setLoadingPlanId("");
    }
  };

  return (
    <KitchenLayout>
      <div className="upgrade-page">
        <div className="upgrade-hero">
          <button type="button" className="kitchen-button secondary" onClick={() => navigate("/kitchen/configuracion")}>
            Volver
          </button>
          <div className="upgrade-hero-copy">
            <span className="upgrade-eyebrow">Household subscription</span>
            <h1>{heading}</h1>
            <p className="kitchen-muted">
              Elige un plan para tu hogar. Durante la beta no hay pagos integrados y la activación la realiza un administrador manualmente.
            </p>
            {householdLicense ? (
              <span className="kitchen-muted">
                Users: {householdLicense?.usage?.users || 0} / {isUnlimitedLicenseLimit(householdLicense?.limits?.maxUsers) ? "Unlimited" : householdLicense?.limits?.maxUsers}
                {" · "}
                Non-user diners: {householdLicense?.usage?.nonUserDiners || 0} / {isUnlimitedLicenseLimit(householdLicense?.limits?.maxNonUserDiners) ? "Unlimited" : householdLicense?.limits?.maxNonUserDiners}
              </span>
            ) : null}
          </div>
        </div>

        {error ? <div className="kitchen-alert error">{error}</div> : null}
        {success ? <div className="kitchen-alert success">{success}</div> : null}
        {summaryLoading ? <p className="kitchen-muted">Cargando suscripción actual...</p> : null}

        <div className="upgrade-plan-grid">
          {PLANS.map((plan) => {
            const isLoading = loadingPlanId === plan.id;
            const isRequested = requestedPlan === plan.id;
            const limits = getPlanLimits(plan.id);
            return (
              <article
                key={plan.id}
                className={`upgrade-plan-card ${plan.recommended ? "is-recommended" : ""}`}
              >
                {plan.recommended ? <span className="upgrade-badge">Recommended</span> : null}
                <div className="upgrade-plan-head">
                  <h2>{plan.name}</h2>
                  <strong>{plan.price}</strong>
                </div>
                <p className="upgrade-plan-tagline">{plan.tagline}</p>
                <ul className="kitchen-list">
                  {plan.features.map((feature) => <li key={feature}>{feature}</li>)}
                  <li>{isUnlimitedLicenseLimit(limits.maxUsers) ? "Unlimited users" : `Up to ${limits.maxUsers} users`}</li>
                  <li>{isUnlimitedLicenseLimit(limits.maxNonUserDiners) ? "Unlimited non-user diners" : `Up to ${limits.maxNonUserDiners} non-user diners`}</li>
                </ul>
                <button
                  type="button"
                  className={`kitchen-button ${plan.recommended ? "" : "secondary"}`}
                  onClick={() => requestPlan(plan.id)}
                  disabled={Boolean(loadingPlanId)}
                >
                  {isLoading ? "Enviando..." : isRequested ? "Plan solicitado" : "Select Plan"}
                </button>
              </article>
            );
          })}
        </div>

        {selectedPlan ? (
          <div className="upgrade-footnote">
            <strong>{selectedPlan.name}</strong>
            <span className="kitchen-muted">
              Tu hogar ha solicitado este plan y queda listo para una futura activación administrativa.
            </span>
          </div>
        ) : null}
      </div>
    </KitchenLayout>
  );
}
