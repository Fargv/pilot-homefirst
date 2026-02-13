import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../auth";
import Card from "../components/ui/Card";

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
          <div className="kitchen-login-badge" aria-hidden="true">
            <div className="kitchen-login-badge-icon">
              <svg viewBox="0 0 24 24" role="presentation" className="kitchen-login-icon">
                <path d="M7 12a4 4 0 0 1 0-8c1.1 0 2.1.45 2.83 1.17A4 4 0 0 1 16 8a3 3 0 0 1 1 5.83V18H7v-6Z" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
                <path d="M9 18v2h8v-2M7 20h2" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
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
                <span className="kitchen-login-social-icon" aria-hidden="true">G</span>
                Google
              </button>
              <button type="button" className="kitchen-login-social-button">
                <span className="kitchen-login-social-icon" aria-hidden="true"></span>
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
