import React, { useState } from "react";
import { createPortal } from "react-dom";
import { apiRequest } from "../api.js";
import { useAuth } from "../auth.jsx";

export default function ConsentGate({ children }) {
  const { user, setUser } = useAuth();
  const [termsAccepted, setTermsAccepted] = useState(false);
  const [privacyAccepted, setPrivacyAccepted] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const needsConsent =
    user &&
    !user.onboardingRequired &&
    user.consentAcceptedAt === null;

  const handleAccept = async () => {
    if (!termsAccepted || !privacyAccepted || loading) return;
    setLoading(true);
    setError("");
    try {
      const data = await apiRequest("/api/kitchen/auth/accept-consent", {
        method: "POST",
        body: JSON.stringify({ termsAccepted: true, privacyAccepted: true })
      });
      if (data?.user) setUser(data.user);
    } catch (err) {
      setError(err.message || "No se pudo registrar el consentimiento. Inténtalo de nuevo.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      {children}
      {needsConsent
        ? createPortal(
            <div className="consent-gate-overlay" role="dialog" aria-modal="true" aria-labelledby="consent-gate-title">
              <div className="consent-gate-card">
                <h2 className="consent-gate-title" id="consent-gate-title">
                  Actualización de términos legales
                </h2>
                <p className="consent-gate-body">
                  Necesitamos tu confirmación sobre nuestros Términos y Política de Privacidad para continuar usando Lunchfy. Esta aceptación queda registrada conforme al GDPR y la LOPDGDD.
                </p>

                <div className="consent-check-group">
                  <label className="consent-check-label">
                    <input
                      type="checkbox"
                      checked={termsAccepted}
                      onChange={(e) => setTermsAccepted(e.target.checked)}
                      disabled={loading}
                    />
                    He leído y acepto los{" "}
                    <a href="/terminos" target="_blank" rel="noopener noreferrer">
                      Términos y Condiciones
                    </a>{" "}
                    de uso de Lunchfy.
                  </label>
                  <label className="consent-check-label">
                    <input
                      type="checkbox"
                      checked={privacyAccepted}
                      onChange={(e) => setPrivacyAccepted(e.target.checked)}
                      disabled={loading}
                    />
                    He leído y acepto la{" "}
                    <a href="/privacidad" target="_blank" rel="noopener noreferrer">
                      Política de Privacidad
                    </a>{" "}
                    y el tratamiento de mis datos personales.
                  </label>
                </div>

                {error ? (
                  <p style={{ color: "var(--danger-text, #dc2626)", fontSize: "0.875rem", marginTop: 8 }}>
                    {error}
                  </p>
                ) : null}

                <div style={{ marginTop: 20 }}>
                  <button
                    type="button"
                    className="kitchen-ui-button kitchen-login-submit"
                    style={{ width: "100%" }}
                    disabled={!termsAccepted || !privacyAccepted || loading}
                    onClick={handleAccept}
                  >
                    {loading ? "Guardando..." : "Aceptar y continuar"}
                  </button>
                </div>
              </div>
            </div>,
            document.body
          )
        : null}
    </>
  );
}
