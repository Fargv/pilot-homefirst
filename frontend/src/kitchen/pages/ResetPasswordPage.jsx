import React, { useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import Card from "../components/ui/Card";
import { requestResetPassword } from "../api.js";
import lunchfyIcon from "../../assets/brand/Lunchfy_icon.png";

const MIN_PASSWORD_LENGTH = 8;

export default function ResetPasswordPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const token = useMemo(() => String(searchParams.get("token") || ""), [searchParams]);
  const [form, setForm] = useState({ newPassword: "", confirmPassword: "" });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const tokenMissing = !token;

  const onSubmit = async (event) => {
    event.preventDefault();

    if (tokenMissing) {
      setError("This reset link is invalid or incomplete.");
      return;
    }

    if (!form.newPassword) {
      setError("Introduce una nueva contrasena.");
      return;
    }

    if (form.newPassword.length < MIN_PASSWORD_LENGTH) {
      setError(`La contrasena debe tener al menos ${MIN_PASSWORD_LENGTH} caracteres.`);
      return;
    }

    if (form.newPassword !== form.confirmPassword) {
      setError("Las contrasenas no coinciden.");
      return;
    }

    console.info("[reset-password] submitting token", {
      tokenLength: token.length,
      tokenPreview: token ? `${token.slice(0, 6)}...${token.slice(-6)}` : ""
    });

    setLoading(true);
    setError("");

    try {
      const response = await requestResetPassword(token, form.newPassword);
      setSuccess(response?.message || "Password has been reset successfully.");
    } catch (err) {
      setError(err.message || "No se pudo restablecer la contrasena.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="kitchen-app">
      <div className="kitchen-container kitchen-login-wrap">
        <Card className="kitchen-login-card kitchen-auth-card">
          <p className="kitchen-login-brand">Lunchfy</p>
          <div className="kitchen-login-badge kitchen-auth-badge" aria-hidden="true">
            <div className="kitchen-login-badge-icon">
              <img className="kitchen-login-icon" src={lunchfyIcon} alt="" />
            </div>
          </div>
          <div className="kitchen-auth-header">
            <span className="kitchen-auth-kicker">Secure access</span>
            <h2 className="kitchen-login-title">Crea una nueva contrasena</h2>
            <p className="kitchen-login-subtitle kitchen-auth-subtitle">
              Elige una contrasena segura para volver a entrar en tu cuenta.
            </p>
          </div>

          {success ? (
            <>
              <div className="kitchen-alert success">{success}</div>
              <div className="kitchen-auth-footer-actions">
                <button type="button" className="kitchen-ui-button kitchen-login-submit" onClick={() => navigate("/login")}>
                  Volver al login
                </button>
              </div>
            </>
          ) : (
            <form onSubmit={onSubmit} className="kitchen-login-form kitchen-auth-form">
              {tokenMissing ? (
                <div className="kitchen-alert error">
                  Invalid or expired reset token. Request a new password reset link and try again.
                </div>
              ) : null}

              <label className="kitchen-ui-input-group" htmlFor="reset-password-new">
                <span className="kitchen-login-label">NUEVA CONTRASENA</span>
                <div className="kitchen-login-input-wrap">
                  <svg viewBox="0 0 24 24" role="presentation" className="kitchen-login-input-icon">
                    <path d="M7.5 11V8a4.5 4.5 0 0 1 9 0v3" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
                    <rect x="5" y="11" width="14" height="10" rx="2" fill="none" stroke="currentColor" strokeWidth="1.7" />
                  </svg>
                  <input
                    id="reset-password-new"
                    className="kitchen-ui-input kitchen-login-input"
                    type="password"
                    value={form.newPassword}
                    onChange={(event) => setForm((prev) => ({ ...prev, newPassword: event.target.value }))}
                    placeholder="Minimo 8 caracteres"
                    minLength={MIN_PASSWORD_LENGTH}
                    required
                  />
                </div>
              </label>

              <label className="kitchen-ui-input-group" htmlFor="reset-password-confirm">
                <span className="kitchen-login-label">CONFIRMAR CONTRASENA</span>
                <div className="kitchen-login-input-wrap">
                  <svg viewBox="0 0 24 24" role="presentation" className="kitchen-login-input-icon">
                    <path d="M7.5 11V8a4.5 4.5 0 0 1 9 0v3" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
                    <rect x="5" y="11" width="14" height="10" rx="2" fill="none" stroke="currentColor" strokeWidth="1.7" />
                  </svg>
                  <input
                    id="reset-password-confirm"
                    className="kitchen-ui-input kitchen-login-input"
                    type="password"
                    value={form.confirmPassword}
                    onChange={(event) => setForm((prev) => ({ ...prev, confirmPassword: event.target.value }))}
                    placeholder="Repite tu nueva contrasena"
                    minLength={MIN_PASSWORD_LENGTH}
                    required
                  />
                </div>
              </label>

              <p className="kitchen-auth-hint">Usa al menos 8 caracteres para mantener tu cuenta protegida.</p>

              {error ? <div className="kitchen-alert error">{error}</div> : null}

              <button type="submit" className="kitchen-ui-button kitchen-login-submit" disabled={loading || tokenMissing}>
                {loading ? "Actualizando contrasena..." : "Guardar nueva contrasena"}
              </button>

              <div className="kitchen-auth-footer-actions">
                <button type="button" className="kitchen-login-link" onClick={() => navigate("/forgot-password")}>
                  Solicitar un nuevo enlace
                </button>
                <button type="button" className="kitchen-login-link" onClick={() => navigate("/login")}>
                  Volver al login
                </button>
              </div>
            </form>
          )}
        </Card>
      </div>
    </div>
  );
}
