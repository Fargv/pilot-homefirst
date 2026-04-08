import React, { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import KitchenLayout from "../Layout.jsx";
import { apiRequest } from "../api.js";

const PLANS = [
  {
    id: "basic",
    name: "Basic",
    price: "€1.99/month",
    tagline: "Para hogares que quieren empezar a probar funciones extra.",
    features: [
      "Preferencias avanzadas del hogar",
      "Nuevas automatizaciones beta",
      "Soporte prioritario durante pruebas"
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
  const [loadingPlanId, setLoadingPlanId] = useState("");
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [requestedPlan, setRequestedPlan] = useState("");

  const selectedPlan = useMemo(
    () => PLANS.find((plan) => plan.id === requestedPlan) || null,
    [requestedPlan]
  );

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
            <h1>Upgrade to Pro</h1>
            <p className="kitchen-muted">
              Elige un plan para tu hogar. Durante la beta, la activación la realizará un administrador manualmente.
            </p>
          </div>
        </div>

        {error ? <div className="kitchen-alert error">{error}</div> : null}
        {success ? <div className="kitchen-alert success">{success}</div> : null}

        <div className="upgrade-plan-grid">
          {PLANS.map((plan) => {
            const isLoading = loadingPlanId === plan.id;
            const isRequested = requestedPlan === plan.id;
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
              Tu hogar ha solicitado este plan y queda listo para una futura activación automática con Stripe.
            </span>
          </div>
        ) : null}
      </div>
    </KitchenLayout>
  );
}
