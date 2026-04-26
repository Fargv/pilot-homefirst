import React, { useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import Card from "../components/ui/Card";
import { apiRequest } from "../api.js";
import { resolvePostAuthRedirect } from "../authRedirect.js";
import { useAuth } from "../auth";

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
      setError("Introduce un codigo numerico de 6 digitos.");
      return;
    }
    setError("");
    setResolvingCode(true);
    try {
      const data = await apiRequest(`/api/kitchen/auth/resolve-household/${normalizedCode}`);
      setResolvedHousehold(data?.household?.name || "");
    } catch (err) {
      setResolvedHousehold("");
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
    } catch {
      setError("No se pudo completar el registro. Intentalo de nuevo.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="kitchen-app">
      <div className="kitchen-container kitchen-login-wrap">
        <Card className="kitchen-login-card">
          <h2 className="kitchen-login-title">Registro legacy</h2>
          <p className="kitchen-login-subtitle">Usa este formulario solo si necesitas el acceso anterior.</p>

          <div className="kitchen-actions" style={{ marginBottom: 12 }}>
            <button type="button" className={`kitchen-button ${mode === "create" ? "" : "secondary"}`} onClick={() => setMode("create")}>Nuevo hogar</button>
            <button type="button" className={`kitchen-button ${mode === "join" ? "" : "secondary"}`} onClick={() => setMode("join")}>Unirme con codigo</button>
          </div>

          <form className="kitchen-login-form" onSubmit={onSubmit}>
            <label className="kitchen-ui-input-group" htmlFor="signup-name">
              <span className="kitchen-login-label">NOMBRE</span>
              <input id="signup-name" className="kitchen-ui-input" value={form.displayName} onChange={(event) => setForm({ ...form, displayName: event.target.value })} required />
            </label>
            <label className="kitchen-ui-input-group" htmlFor="signup-email">
              <span className="kitchen-login-label">EMAIL</span>
              <input id="signup-email" className="kitchen-ui-input" type="email" value={form.email} onChange={(event) => setForm({ ...form, email: event.target.value })} required />
            </label>
            <label className="kitchen-ui-input-group" htmlFor="signup-password">
              <span className="kitchen-login-label">CONTRASENA</span>
              <input id="signup-password" className="kitchen-ui-input" type="password" value={form.password} onChange={(event) => setForm({ ...form, password: event.target.value })} required minLength={8} />
            </label>

            {mode === "create" ? (
              <label className="kitchen-ui-input-group" htmlFor="signup-household">
                <span className="kitchen-login-label">NOMBRE DEL HOGAR (OPCIONAL)</span>
                <input id="signup-household" className="kitchen-ui-input" value={form.householdName} onChange={(event) => setForm({ ...form, householdName: event.target.value })} placeholder="Mi hogar" />
              </label>
            ) : (
              <>
                <label className="kitchen-ui-input-group" htmlFor="signup-code">
                  <span className="kitchen-login-label">CODIGO DE 6 DIGITOS</span>
                  <input id="signup-code" className="kitchen-ui-input" inputMode="numeric" value={normalizedCode} onChange={(event) => setForm({ ...form, inviteCode: event.target.value })} required maxLength={6} />
                </label>
                <div className="kitchen-actions">
                  <button type="button" className="kitchen-button secondary" onClick={resolveCode} disabled={resolvingCode || normalizedCode.length !== 6}>
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
                  <input
                    type="checkbox"
                    className="kitchen-toggle-input"
                    checked={form.active}
                    onChange={(event) => setForm((prev) => ({ ...prev, active: event.target.checked }))}
                  />
                  <span className="kitchen-toggle-track" />
                </label>
              </div>
              <p className="kitchen-muted">Apareceras automaticamente como comensal cuando se planifiquen comidas.</p>
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
              <p className="kitchen-muted">Podras entrar en las asignaciones de cocina.</p>
            </label>

            <label className="kitchen-field kitchen-toggle-field">
              <div className="kitchen-toggle-row">
                <span className="kitchen-label">Incluirme tambien en cenas</span>
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
              <p className="kitchen-muted">Apareceras automaticamente como comensal cuando se planifiquen cenas.</p>
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
              <p className="kitchen-muted">Tambien podras ser asignado para cocinar en cenas.</p>
            </label>

            {error ? <div className="kitchen-alert error">{error}</div> : null}

            <button type="submit" className="kitchen-ui-button kitchen-login-submit" disabled={loading}>
              {loading ? "Registrando..." : "Registrarme"}
            </button>

            <p className="kitchen-login-footer">
              Prefieres el acceso principal?{" "}
              <button type="button" className="kitchen-login-link" onClick={() => navigate(next ? `/signup?next=${encodeURIComponent(next)}` : "/signup")}>
                Usar Clerk
              </button>
            </p>
            <p className="kitchen-login-footer">
              Ya tienes cuenta legacy?{" "}
              <button type="button" className="kitchen-login-link" onClick={() => navigate(next ? `/legacy-login?next=${encodeURIComponent(next)}` : "/legacy-login")}>
                Inicia sesion
              </button>
            </p>
          </form>
        </Card>
      </div>
    </div>
  );
}
