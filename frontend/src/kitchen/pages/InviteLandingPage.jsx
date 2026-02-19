import React, { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { apiRequest } from "../api.js";
import { useAuth } from "../auth.jsx";

export default function InviteLandingPage() {
  const { token } = useParams();
  const navigate = useNavigate();
  const { establishSession } = useAuth();

  const [mode, setMode] = useState("signup");
  const [loadingInvite, setLoadingInvite] = useState(true);
  const [inviteValid, setInviteValid] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [householdName, setHouseholdName] = useState("");
  const [expiresAt, setExpiresAt] = useState("");
  const [form, setForm] = useState({
    email: "",
    password: "",
    displayName: ""
  });

  const validateInvite = async () => {
    setLoadingInvite(true);
    setError("");
    setInviteValid(false);

    if (!token) {
      setLoadingInvite(false);
      setError("Token de invitación inválido.");
      return;
    }

    try {
      const data = await apiRequest(`/api/kitchen/auth/invite/${token}`);
      setHouseholdName(data.householdName || "");
      setExpiresAt(data.expiresAt || "");
      setInviteValid(true);
    } catch (err) {
      setError(err.message || "No se pudo validar la invitación.");
      setHouseholdName("");
      setExpiresAt("");
      setInviteValid(false);
    } finally {
      setLoadingInvite(false);
    }
  };

  useEffect(() => {
    void validateInvite();
  }, [token]);

  const onSubmit = async (event) => {
    event.preventDefault();
    setSubmitting(true);
    setError("");

    try {
      const payload = {
        token,
        email: form.email,
        password: form.password,
        displayName: mode === "signup" ? form.displayName : undefined
      };
      const data = await apiRequest("/api/kitchen/auth/accept-invite", {
        method: "POST",
        body: JSON.stringify(payload)
      });
      establishSession(data.token, data.user);
      navigate("/kitchen/semana", { replace: true });
    } catch (err) {
      setError(err.message || "No se pudo aceptar la invitación.");
    } finally {
      setSubmitting(false);
    }
  };

  const canSubmit = inviteValid && form.email.trim() && form.password && (mode === "existing" || form.displayName.trim());

  return (
    <div className="kitchen-app">
      <div className="kitchen-container" style={{ maxWidth: 520 }}>
        <div className="kitchen-card kitchen-block-gap">
          <h2>Invitación al hogar</h2>
          {householdName ? <p className="kitchen-muted">Te invitaron a unirte a <strong>{householdName}</strong>.</p> : null}
          {expiresAt ? <p className="kitchen-muted">Válida hasta {new Date(expiresAt).toLocaleString()}.</p> : null}

          <div className="kitchen-actions">
            <button
              type="button"
              className={`kitchen-button ${mode === "signup" ? "" : "secondary"}`}
              onClick={() => setMode("signup")}
              disabled={!inviteValid}
            >
              Crear cuenta
            </button>
            <button
              type="button"
              className={`kitchen-button ${mode === "existing" ? "" : "secondary"}`}
              onClick={() => setMode("existing")}
              disabled={!inviteValid}
            >
              Ya tengo cuenta
            </button>
          </div>

          {loadingInvite ? <p className="kitchen-muted">Validando invitación...</p> : null}
          {error ? <div className="kitchen-alert error">{error}</div> : null}

          {!loadingInvite && !error ? (
            <form className="kitchen-block-gap" onSubmit={onSubmit}>
              <label className="kitchen-ui-input-group" htmlFor="invite-email">
                <span>Email</span>
                <input
                  id="invite-email"
                  type="email"
                  className="kitchen-input"
                  value={form.email}
                  onChange={(event) => setForm((prev) => ({ ...prev, email: event.target.value }))}
                  required
                />
              </label>

              <label className="kitchen-ui-input-group" htmlFor="invite-password">
                <span>Contraseña</span>
                <input
                  id="invite-password"
                  type="password"
                  className="kitchen-input"
                  value={form.password}
                  onChange={(event) => setForm((prev) => ({ ...prev, password: event.target.value }))}
                  required
                />
              </label>

              {mode === "signup" ? (
                <label className="kitchen-ui-input-group" htmlFor="invite-display-name">
                  <span>Nombre para mostrar</span>
                  <input
                    id="invite-display-name"
                    type="text"
                    className="kitchen-input"
                    value={form.displayName}
                    onChange={(event) => setForm((prev) => ({ ...prev, displayName: event.target.value }))}
                    required
                  />
                </label>
              ) : null}

              <button type="submit" className="kitchen-button" disabled={!canSubmit || submitting}>
                {submitting ? "Uniendo al hogar..." : "Aceptar invitación"}
              </button>
            </form>
          ) : null}

          {!loadingInvite && error ? (
            <button type="button" className="kitchen-button secondary" onClick={() => void validateInvite()}>
              Reintentar validación
            </button>
          ) : null}
        </div>
      </div>
    </div>
  );
}
