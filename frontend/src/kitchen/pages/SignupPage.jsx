import React, { useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import Card from "../components/ui/Card";
import { apiRequest } from "../api.js";
import { resolvePostAuthRedirect } from "../authRedirect.js";
import { useAuth } from "../auth";

const showClerkDevAuthLink = import.meta.env.VITE_APP_ENV === "development" || import.meta.env.DEV;

export default function SignupPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { establishSession } = useAuth();
  const [mode, setMode] = useState("create");
  const [form, setForm] = useState({
    displayName: "",
    email: "",
    password: "",
    householdName: "",
    inviteCode: "",
    active: true,
    canCook: true,
    dinnerActive: true,
    dinnerCanCook: true
  });
  const [loading, setLoading] = useState(false);
  const [resolvingCode, setResolvingCode] = useState(false);
  const [resolvedHousehold, setResolvedHousehold] = useState("");
  const [error, setError] = useState("");
  const next = searchParams.get("next") || "";

  const normalizedCode = useMemo(() => String(form.inviteCode || "").replace(/\D/g, "").slice(0, 6), [form.inviteCode]);

  const resolveCode = async () => {
    if (normalizedCode.length !== 6) {
      setError("Introduce un código numérico de 6 dígitos.");
      return;
    }
    setError("");
    setResolvingCode(true);
    try {
      const data = await apiRequest(`/api/kitchen/auth/resolve-household/${normalizedCode}`);
      setResolvedHousehold(data?.household?.name || "");
    } catch (err) {
      setResolvedHousehold("");
      setError(err.message || "El código no es válido.");
    } finally {
      setResolvingCode(false);
    }
  };

  const onSubmit = async (event) => {
    event.preventDefault();
    setError("");
    setLoading(true);
    try {
      const payload = {
        displayName: form.displayName,
        email: form.email,
        password: form.password,
        householdName: mode === "create" ? form.householdName : undefined,
        inviteCode: mode === "join" ? normalizedCode : undefined,
        active: Boolean(form.active),
        canCook: Boolean(form.canCook),
        dinnerActive: Boolean(form.dinnerActive),
        dinnerCanCook: Boolean(form.dinnerCanCook)
      };

      const data = await apiRequest("/api/kitchen/auth/register", {
        method: "POST",
        body: JSON.stringify(payload)
      });

      establishSession(data.token, data.user);
      navigate(resolvePostAuthRedirect(searchParams), { replace: true });
    } catch (err) {
      setError(err.message || "No se pudo completar el registro.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="kitchen-app">
      <div className="kitchen-container kitchen-login-wrap">
        <Card className="kitchen-login-card">
          <h2 className="kitchen-login-title">Crear cuenta</h2>
          {showClerkDevAuthLink ? (
            <div className="kitchen-alert info">
              Esta pantalla registra usuarios solo en el flujo legacy de Mongo/JWT. Para crear usuarios reales de Clerk, usa{" "}
              <button type="button" className="kitchen-login-link" onClick={() => navigate("/dev/clerk-auth")}>
                DEV Clerk auth
              </button>
              .
            </div>
          ) : null}
          <div className="kitchen-actions" style={{ marginBottom: 12 }}>
            <button type="button" className={`kitchen-button ${mode === "create" ? "" : "secondary"}`} onClick={() => setMode("create")}>Nuevo hogar</button>
            <button type="button" className={`kitchen-button ${mode === "join" ? "" : "secondary"}`} onClick={() => setMode("join")}>Unirme con código</button>
          </div>
          <form className="kitchen-login-form" onSubmit={onSubmit}>
            <label className="kitchen-ui-input-group" htmlFor="signup-name">
              <span className="kitchen-login-label">NOMBRE</span>
              <input id="signup-name" className="kitchen-ui-input" value={form.displayName} onChange={(e) => setForm({ ...form, displayName: e.target.value })} required />
            </label>
            <label className="kitchen-ui-input-group" htmlFor="signup-email">
              <span className="kitchen-login-label">EMAIL</span>
              <input id="signup-email" className="kitchen-ui-input" type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} required />
            </label>
            <label className="kitchen-ui-input-group" htmlFor="signup-password">
              <span className="kitchen-login-label">CONTRASEÑA</span>
              <input id="signup-password" className="kitchen-ui-input" type="password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} required minLength={8} />
            </label>

            {mode === "create" ? (
              <label className="kitchen-ui-input-group" htmlFor="signup-household">
                <span className="kitchen-login-label">NOMBRE DEL HOGAR (OPCIONAL)</span>
                <input id="signup-household" className="kitchen-ui-input" value={form.householdName} onChange={(e) => setForm({ ...form, householdName: e.target.value })} placeholder="Mi hogar" />
              </label>
            ) : (
              <>
                <label className="kitchen-ui-input-group" htmlFor="signup-code">
                  <span className="kitchen-login-label">CÓDIGO DE 6 DÍGITOS</span>
                  <input id="signup-code" className="kitchen-ui-input" inputMode="numeric" value={normalizedCode} onChange={(e) => setForm({ ...form, inviteCode: e.target.value })} required maxLength={6} />
                </label>
                <div className="kitchen-actions">
                  <button type="button" className="kitchen-button secondary" onClick={resolveCode} disabled={resolvingCode || normalizedCode.length !== 6}>
                    {resolvingCode ? "Validando..." : "Validar código"}
                  </button>
                  {resolvedHousehold ? <span className="kitchen-muted">Hogar: <strong>{resolvedHousehold}</strong></span> : null}
                </div>
              </>
            )}

            <label className="kitchen-field kitchen-toggle-field">
              <div className="kitchen-toggle-row">
                <span className="kitchen-label">Incluir como comensal por defecto</span>
                <label className="kitchen-toggle">
                  <input
                    type="checkbox"
                    className="kitchen-toggle-input"
                    checked={form.active}
                    onChange={(event) => setForm((prev) => ({ ...prev, active: event.target.checked }))}
                  />
                  <span className="kitchen-toggle-track" />
                </label>
              </div>
              <p className="kitchen-muted">Si está activado, aparecerás automáticamente como comensal cuando se planifiquen comidas.</p>
            </label>
            <label className="kitchen-field kitchen-toggle-field">
              <div className="kitchen-toggle-row">
                <span className="kitchen-label">Puede cocinar</span>
                <label className="kitchen-toggle">
                  <input
                    type="checkbox"
                    className="kitchen-toggle-input"
                    checked={form.canCook}
                    onChange={(event) => setForm((prev) => ({ ...prev, canCook: event.target.checked }))}
                  />
                  <span className="kitchen-toggle-track" />
                </label>
              </div>
              <p className="kitchen-muted">Si está activado, podrás ser asignado automáticamente para cocinar cuando se utilice la asignación aleatoria.</p>
            </label>

            <label className="kitchen-field kitchen-toggle-field">
              <div className="kitchen-toggle-row">
                <span className="kitchen-label">Incluir como comensal por defecto en cenas</span>
                <label className="kitchen-toggle">
                  <input
                    type="checkbox"
                    className="kitchen-toggle-input"
                    checked={form.dinnerActive}
                    onChange={(event) => setForm((prev) => ({ ...prev, dinnerActive: event.target.checked }))}
                  />
                  <span className="kitchen-toggle-track" />
                </label>
              </div>
              <p className="kitchen-muted">Si esta activado, apareceras automaticamente como comensal cuando se planifiquen cenas.</p>
            </label>
            <label className="kitchen-field kitchen-toggle-field">
              <div className="kitchen-toggle-row">
                <span className="kitchen-label">Puede cocinar cenas</span>
                <label className="kitchen-toggle">
                  <input
                    type="checkbox"
                    className="kitchen-toggle-input"
                    checked={form.dinnerCanCook}
                    onChange={(event) => setForm((prev) => ({ ...prev, dinnerCanCook: event.target.checked }))}
                  />
                  <span className="kitchen-toggle-track" />
                </label>
              </div>
              <p className="kitchen-muted">Si esta activado, podras ser asignado automaticamente para cocinar en cenas.</p>
            </label>
            {error ? <div className="kitchen-alert error">{error}</div> : null}
            <button type="submit" className="kitchen-ui-button kitchen-login-submit" disabled={loading}>
              {loading ? "Registrando..." : "Registrarme"}
            </button>
            <p className="kitchen-login-footer">¿Ya tienes cuenta? <button type="button" className="kitchen-login-link" onClick={() => navigate(next ? `/login?next=${encodeURIComponent(next)}` : "/login")}>Inicia sesión</button></p>
          </form>
        </Card>
      </div>
    </div>
  );
}
