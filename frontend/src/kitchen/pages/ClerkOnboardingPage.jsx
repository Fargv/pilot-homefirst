import React, { useEffect, useState } from "react";
import { useUser } from "@clerk/react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { apiRequest } from "../api.js";
import { useAuth } from "../auth";
import Card from "../components/ui/Card";

const pendingInviteTokenKey = "clerk_onboarding_invite_token";
const pendingInviteCodeKey = "clerk_onboarding_invite_code";

export default function ClerkOnboardingPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { user: clerkUser } = useUser();
  const { setUser, setOnboardingRequired, refreshUser } = useAuth();
  const [form, setForm] = useState({
    firstName: "",
    lastName: "",
    initials: "",
    householdName: "",
    inviteCode: "",
    inviteToken: "",
    active: true,
    canCook: true,
    dinnerActive: true,
    dinnerCanCook: true,
    dinnersEnabled: false,
    avoidRepeatsEnabled: false,
    avoidRepeatsWeeks: 1
  });
  const [loading, setLoading] = useState(false);
  const [resolvingCode, setResolvingCode] = useState(false);
  const [resolvedHousehold, setResolvedHousehold] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    setForm((prev) => ({
      ...prev,
      firstName: prev.firstName || clerkUser?.firstName || "",
      lastName: prev.lastName || clerkUser?.lastName || "",
      householdName: prev.householdName || `${clerkUser?.firstName || "Mi"} - Hogar`
    }));
  }, [clerkUser]);

  useEffect(() => {
    const inviteToken = String(
      searchParams.get("inviteToken")
      || searchParams.get("token")
      || window.sessionStorage.getItem(pendingInviteTokenKey)
      || ""
    ).trim();
    const inviteCode = String(
      searchParams.get("inviteCode")
      || searchParams.get("code")
      || window.sessionStorage.getItem(pendingInviteCodeKey)
      || ""
    ).replace(/\D/g, "").slice(0, 6);

    setForm((prev) => ({
      ...prev,
      inviteToken: prev.inviteToken || inviteToken,
      inviteCode: prev.inviteCode || inviteCode
    }));
  }, [searchParams]);

  const updateField = (field, value) => {
    setForm((prev) => ({ ...prev, [field]: value }));
  };

  const normalizedInviteCode = String(form.inviteCode || "").replace(/\D/g, "").slice(0, 6);

  const resolveCode = async () => {
    if (normalizedInviteCode.length !== 6) {
      setError("Introduce un codigo numerico de 6 digitos.");
      return;
    }
    setError("");
    setResolvedHousehold("");
    setResolvingCode(true);
    try {
      const data = await apiRequest(`/api/kitchen/auth/resolve-household/${normalizedInviteCode}`);
      setResolvedHousehold(data?.household?.name || "");
    } catch (err) {
      setError(err.message || "El codigo no es valido.");
    } finally {
      setResolvingCode(false);
    }
  };

  const onSubmit = async (event) => {
    event.preventDefault();
    setError("");
    setLoading(true);

    try {
      const data = await apiRequest("/api/kitchen/auth/clerk/onboarding", {
        method: "POST",
        authMode: "clerk",
        body: JSON.stringify({
          ...form,
          inviteCode: normalizedInviteCode || undefined,
          inviteToken: form.inviteToken || undefined
        })
      });

      window.sessionStorage.removeItem(pendingInviteTokenKey);
      window.sessionStorage.removeItem(pendingInviteCodeKey);
      setUser(data.user);
      setOnboardingRequired(false);
      await refreshUser({ authMode: "clerk" });
      navigate("/kitchen/semana", { replace: true });
    } catch (err) {
      setError(err.message || "No se pudo completar el onboarding.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="kitchen-app">
      <div className="kitchen-container kitchen-login-wrap">
        <Card className="kitchen-login-card kitchen-auth-card">
          <p className="kitchen-auth-kicker">Completa tu perfil</p>
          <h2 className="kitchen-login-title">Prepara tu hogar en Lunchfy</h2>
          <p className="kitchen-login-subtitle">
            Ya tienes sesion iniciada con Clerk. Ahora necesitamos los datos internos del hogar para activar la app.
          </p>

          <form className="kitchen-login-form" onSubmit={onSubmit}>
            <label className="kitchen-ui-input-group" htmlFor="clerk-first-name">
              <span className="kitchen-login-label">NOMBRE</span>
              <input
                id="clerk-first-name"
                className="kitchen-ui-input"
                value={form.firstName}
                onChange={(event) => updateField("firstName", event.target.value)}
                required
              />
            </label>
            <label className="kitchen-ui-input-group" htmlFor="clerk-last-name">
              <span className="kitchen-login-label">APELLIDOS</span>
              <input
                id="clerk-last-name"
                className="kitchen-ui-input"
                value={form.lastName}
                onChange={(event) => updateField("lastName", event.target.value)}
                required
              />
            </label>
            <label className="kitchen-ui-input-group" htmlFor="clerk-initials">
              <span className="kitchen-login-label">INICIALES (OPCIONAL)</span>
              <input
                id="clerk-initials"
                className="kitchen-ui-input"
                value={form.initials}
                onChange={(event) => updateField("initials", event.target.value.toUpperCase().slice(0, 3))}
                placeholder="MR"
                maxLength={3}
              />
            </label>
            <label className="kitchen-ui-input-group" htmlFor="clerk-household-name">
              <span className="kitchen-login-label">NOMBRE DEL HOGAR</span>
              <input
                id="clerk-household-name"
                className="kitchen-ui-input"
                value={form.householdName}
                onChange={(event) => updateField("householdName", event.target.value)}
                required={!form.inviteToken && !normalizedInviteCode}
              />
            </label>
            {form.inviteToken ? (
              <div className="kitchen-alert info">
                Tienes una invitacion segura pendiente. Al completar el perfil, te uniremos al hogar invitado si la invitacion sigue vigente.
              </div>
            ) : (
              <>
                <label className="kitchen-ui-input-group" htmlFor="clerk-invite-code">
                  <span className="kitchen-login-label">CODIGO DE HOGAR (OPCIONAL)</span>
                  <input
                    id="clerk-invite-code"
                    className="kitchen-ui-input"
                    inputMode="numeric"
                    value={normalizedInviteCode}
                    onChange={(event) => updateField("inviteCode", event.target.value)}
                    placeholder="123456"
                    maxLength={6}
                  />
                </label>
                <div className="kitchen-actions">
                  <button type="button" className="kitchen-button secondary" onClick={resolveCode} disabled={resolvingCode || normalizedInviteCode.length !== 6}>
                    {resolvingCode ? "Validando..." : "Validar codigo"}
                  </button>
                  {resolvedHousehold ? <span className="kitchen-muted">Hogar: <strong>{resolvedHousehold}</strong></span> : null}
                </div>
              </>
            )}

            <label className="kitchen-field kitchen-toggle-field">
              <div className="kitchen-toggle-row">
                <span className="kitchen-label">Incluir como comensal por defecto</span>
                <label className="kitchen-toggle">
                  <input type="checkbox" className="kitchen-toggle-input" checked={form.active} onChange={(event) => updateField("active", event.target.checked)} />
                  <span className="kitchen-toggle-track" />
                </label>
              </div>
            </label>
            <label className="kitchen-field kitchen-toggle-field">
              <div className="kitchen-toggle-row">
                <span className="kitchen-label">Puede cocinar</span>
                <label className="kitchen-toggle">
                  <input type="checkbox" className="kitchen-toggle-input" checked={form.canCook} onChange={(event) => updateField("canCook", event.target.checked)} />
                  <span className="kitchen-toggle-track" />
                </label>
              </div>
            </label>
            <label className="kitchen-field kitchen-toggle-field">
              <div className="kitchen-toggle-row">
                <span className="kitchen-label">Activar cenas en este hogar</span>
                <label className="kitchen-toggle">
                  <input type="checkbox" className="kitchen-toggle-input" checked={form.dinnersEnabled} onChange={(event) => updateField("dinnersEnabled", event.target.checked)} />
                  <span className="kitchen-toggle-track" />
                </label>
              </div>
            </label>
            <label className="kitchen-field kitchen-toggle-field">
              <div className="kitchen-toggle-row">
                <span className="kitchen-label">Incluir como comensal por defecto en cenas</span>
                <label className="kitchen-toggle">
                  <input type="checkbox" className="kitchen-toggle-input" checked={form.dinnerActive} onChange={(event) => updateField("dinnerActive", event.target.checked)} />
                  <span className="kitchen-toggle-track" />
                </label>
              </div>
            </label>
            <label className="kitchen-field kitchen-toggle-field">
              <div className="kitchen-toggle-row">
                <span className="kitchen-label">Puede cocinar cenas</span>
                <label className="kitchen-toggle">
                  <input type="checkbox" className="kitchen-toggle-input" checked={form.dinnerCanCook} onChange={(event) => updateField("dinnerCanCook", event.target.checked)} />
                  <span className="kitchen-toggle-track" />
                </label>
              </div>
            </label>
            <label className="kitchen-field kitchen-toggle-field">
              <div className="kitchen-toggle-row">
                <span className="kitchen-label">Evitar repetir platos</span>
                <label className="kitchen-toggle">
                  <input type="checkbox" className="kitchen-toggle-input" checked={form.avoidRepeatsEnabled} onChange={(event) => updateField("avoidRepeatsEnabled", event.target.checked)} />
                  <span className="kitchen-toggle-track" />
                </label>
              </div>
            </label>
            {form.avoidRepeatsEnabled ? (
              <label className="kitchen-ui-input-group" htmlFor="clerk-avoid-repeats-weeks">
                <span className="kitchen-login-label">SEMANAS SIN REPETIR</span>
                <input
                  id="clerk-avoid-repeats-weeks"
                  className="kitchen-ui-input"
                  type="number"
                  min="1"
                  max="12"
                  value={form.avoidRepeatsWeeks}
                  onChange={(event) => updateField("avoidRepeatsWeeks", event.target.value)}
                />
              </label>
            ) : null}

            {error ? <div className="kitchen-alert error">{error}</div> : null}
            <button type="submit" className="kitchen-ui-button kitchen-login-submit" disabled={loading}>
              {loading ? "Preparando..." : "Entrar en Lunchfy"}
            </button>
          </form>
        </Card>
      </div>
    </div>
  );
}
