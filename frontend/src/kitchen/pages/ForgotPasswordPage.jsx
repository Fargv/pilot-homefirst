import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import Card from "../components/ui/Card";
import { requestForgotPassword } from "../api.js";
import lunchfyIcon from "../../assets/brand/Lunchfy_icon.png";

const GENERIC_SUCCESS_MESSAGE = "If an account exists for that email, a password reset link has been sent.";

export default function ForgotPasswordPage() {
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const onSubmit = async (event) => {
    event.preventDefault();
    setLoading(true);
    setError("");
    setSuccess("");

    try {
      const response = await requestForgotPassword(String(email || "").trim());
      setSuccess(response?.message || GENERIC_SUCCESS_MESSAGE);
    } catch (err) {
      setError(err.message || "No hemos podido enviar el enlace ahora mismo. Intentalo de nuevo.");
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
            <span className="kitchen-auth-kicker">Password reset</span>
            <h2 className="kitchen-login-title">Recupera el acceso a tu cuenta</h2>
            <p className="kitchen-login-subtitle kitchen-auth-subtitle">
              Introduce tu email y te enviaremos un enlace seguro para restablecer tu contrasena.
            </p>
          </div>

          <form onSubmit={onSubmit} className="kitchen-login-form kitchen-auth-form">
            <label className="kitchen-ui-input-group" htmlFor="forgot-password-email">
              <span className="kitchen-login-label">CORREO ELECTRONICO</span>
              <div className="kitchen-login-input-wrap">
                <svg viewBox="0 0 24 24" role="presentation" className="kitchen-login-input-icon">
                  <path d="M3.5 7.5h17v9h-17z" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinejoin="round" />
                  <path d="m4.5 8.5 7.5 5 7.5-5" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
                <input
                  id="forgot-password-email"
                  className="kitchen-ui-input kitchen-login-input"
                  type="email"
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  placeholder="tunombre@email.com"
                  required
                />
              </div>
            </label>

            {success ? <div className="kitchen-alert success">{success}</div> : null}
            {error ? <div className="kitchen-alert error">{error}</div> : null}

            <button type="submit" className="kitchen-ui-button kitchen-login-submit" disabled={loading}>
              {loading ? "Enviando enlace..." : "Enviar enlace de recuperacion"}
            </button>
          </form>

          <div className="kitchen-auth-footer-actions">
            <button type="button" className="kitchen-login-link" onClick={() => navigate("/login")}>
              Volver a iniciar sesion
            </button>
          </div>
        </Card>
      </div>
    </div>
  );
}
