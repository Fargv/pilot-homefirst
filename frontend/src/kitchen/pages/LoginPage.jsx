import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../auth";
import Card from "../components/ui/Card";
import lunchfyIcon from "../../assets/brand/Lunchfy_icon.png";

export default function LoginPage() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const [form, setForm] = useState({ email: "", password: "" });
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const onSubmit = async (event) => {
    event.preventDefault();
    setError("");
    setLoading(true);
    try {
      await login(form.email, form.password);
      navigate("/kitchen/semana");
    } catch (err) {
      setError(err.message || "No se pudo iniciar sesión.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="kitchen-app">
      <div className="kitchen-container kitchen-login-wrap">
        <Card className="kitchen-login-card">
          <p className="kitchen-login-brand">Lunchfy</p>
          <div className="kitchen-login-badge" aria-hidden="true">
            <div className="kitchen-login-badge-icon">
              <img className="kitchen-login-icon" src={lunchfyIcon} alt="" />
            </div>
          </div>
          <h2 className="kitchen-login-title">¡Bienvenido de nuevo!</h2>
          <p className="kitchen-login-subtitle">Hay planes deliciosos esperándote.</p>
          <form onSubmit={onSubmit} className="kitchen-login-form">
            <div className="kitchen-login-fields">
              <label className="kitchen-ui-input-group" htmlFor="login-email">
                <span className="kitchen-login-label">CORREO ELECTRÓNICO</span>
                <div className="kitchen-login-input-wrap">
                  <svg viewBox="0 0 24 24" role="presentation" className="kitchen-login-input-icon">
                    <path d="M3.5 7.5h17v9h-17z" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinejoin="round" />
                    <path d="m4.5 8.5 7.5 5 7.5-5" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                  <input
                    id="login-email"
                    className="kitchen-ui-input kitchen-login-input"
                    type="email"
                    value={form.email}
                    onChange={(event) => setForm({ ...form, email: event.target.value })}
                    placeholder="tunombre@email.com"
                    required
                  />
                </div>
              </label>
              <label className="kitchen-ui-input-group" htmlFor="login-password">
                <span className="kitchen-login-label">CONTRASEÑA</span>
                <div className="kitchen-login-input-wrap">
                  <svg viewBox="0 0 24 24" role="presentation" className="kitchen-login-input-icon">
                    <path d="M7.5 11V8a4.5 4.5 0 0 1 9 0v3" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
                    <rect x="5" y="11" width="14" height="10" rx="2" fill="none" stroke="currentColor" strokeWidth="1.7" />
                  </svg>
                  <input
                    id="login-password"
                    className="kitchen-ui-input kitchen-login-input kitchen-login-password-input"
                    type="password"
                    value={form.password}
                    onChange={(event) => setForm({ ...form, password: event.target.value })}
                    placeholder="••••••••"
                    required
                  />
                  <button type="button" className="kitchen-login-eye" aria-label="Mostrar contraseña">
                    <svg viewBox="0 0 24 24" role="presentation" className="kitchen-login-input-icon">
                      <path d="M2.5 12s3.5-6 9.5-6 9.5 6 9.5 6-3.5 6-9.5 6-9.5-6-9.5-6Z" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
                      <circle cx="12" cy="12" r="2.8" fill="none" stroke="currentColor" strokeWidth="1.7" />
                    </svg>
                  </button>
                </div>
              </label>
              <div className="kitchen-login-forgot-row">
                <button type="button" className="kitchen-login-link">¿Olvidaste tu contraseña?</button>
              </div>
            </div>
            {error ? <div className="kitchen-login-error">{error}</div> : null}
            <button type="submit" className="kitchen-ui-button kitchen-login-submit" disabled={loading}>
              {loading ? "Entrando..." : "Iniciar sesión →"}
            </button>
            <div className="kitchen-login-divider">O CONTINUAR CON</div>
            <div className="kitchen-login-socials">
              <button type="button" className="kitchen-login-social-button">
                <span className="kitchen-login-social-icon" aria-hidden="true">
                  <svg viewBox="0 0 24 24" role="presentation" className="kitchen-login-social-svg kitchen-login-social-svg-google">
                    <path fill="#EA4335" d="M12.24 10.28v3.92h5.52c-.24 1.26-.96 2.33-2.04 3.04l3.3 2.56c1.92-1.77 3.03-4.37 3.03-7.44 0-.71-.06-1.4-.18-2.08h-9.63z" />
                    <path fill="#34A853" d="M12 22c2.76 0 5.08-.91 6.78-2.46l-3.3-2.56c-.92.62-2.1.99-3.48.99-2.68 0-4.94-1.81-5.75-4.24H2.84v2.66A10 10 0 0 0 12 22z" />
                    <path fill="#4A90E2" d="M6.25 13.73a5.96 5.96 0 0 1 0-3.8V7.27H2.84a10 10 0 0 0 0 9.12l3.41-2.66z" />
                    <path fill="#FBBC05" d="M12 5.98c1.5 0 2.85.51 3.91 1.52l2.93-2.93C17.08 2.93 14.76 2 12 2a10 10 0 0 0-9.16 5.27l3.41 2.66c.8-2.43 3.07-4.24 5.75-4.24z" />
                  </svg>
                </span>
                Google
              </button>
              <button type="button" className="kitchen-login-social-button">
                <span className="kitchen-login-social-icon" aria-hidden="true">
                  <svg viewBox="0 0 24 24" role="presentation" className="kitchen-login-social-svg kitchen-login-social-svg-apple">
                    <path fill="currentColor" d="M16.74 12.48c.03 3.26 2.86 4.35 2.89 4.36-.02.08-.45 1.56-1.47 3.08-.89 1.32-1.81 2.64-3.27 2.67-1.44.03-1.9-.86-3.54-.86-1.65 0-2.16.83-3.51.89-1.41.05-2.49-1.41-3.39-2.73-1.84-2.67-3.25-7.56-1.36-10.86.94-1.64 2.62-2.68 4.43-2.7 1.38-.03 2.68.93 3.52.93.84 0 2.42-1.15 4.08-.98.69.03 2.63.28 3.88 2.1-.1.06-2.31 1.35-2.26 4.1ZM14.67 4.91c.75-.91 1.25-2.16 1.11-3.41-1.08.04-2.38.72-3.16 1.63-.69.8-1.3 2.09-1.13 3.31 1.21.09 2.43-.62 3.18-1.53Z" />
                  </svg>
                </span>
                Apple
              </button>
            </div>
          </form>
          <p className="kitchen-login-footer">¿No tienes cuenta? <button type="button" className="kitchen-login-link">Regístrate</button></p>
        </Card>
      </div>
    </div>
  );
}
