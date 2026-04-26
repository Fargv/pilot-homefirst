import React, { useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { resolvePostAuthRedirect } from "../authRedirect.js";
import { useAuth } from "../auth";
import { AppLoadingScreen } from "../components/WeekPageSkeleton.jsx";
import Card from "../components/ui/Card";
import lunchfyIcon from "../../assets/brand/Lunchfy_icon.png";

export default function LoginPage() {
  const { login, user, onboardingRequired, refreshUser, clerkLoaded, clerkSignedIn } = useAuth();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [form, setForm] = useState({ email: "", password: "" });
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const profileDeleted = searchParams.get("deleted") === "1";
  const profileDeletedWarning = searchParams.get("warning") || "";
  const next = searchParams.get("next") || "";

  useEffect(() => {
    let active = true;
    const handoffClerkSession = async () => {
      if (!clerkLoaded || !clerkSignedIn) return;
      if (onboardingRequired) {
        navigate("/onboarding/clerk", { replace: true });
        return;
      }
      if (user?.id) {
        navigate(resolvePostAuthRedirect(searchParams), { replace: true });
        return;
      }

      const nextUser = await refreshUser({ authMode: "clerk" });
      if (!active) return;
      if (nextUser?.onboardingRequired) {
        navigate("/onboarding/clerk", { replace: true });
        return;
      }
      if (nextUser?.id) {
        navigate(resolvePostAuthRedirect(searchParams), { replace: true });
        return;
      }
      navigate("/auth/clerk/complete", { replace: true });
    };

    void handoffClerkSession();
    return () => {
      active = false;
    };
  }, [clerkLoaded, clerkSignedIn, navigate, onboardingRequired, refreshUser, searchParams, user]);

  const onSubmit = async (event) => {
    event.preventDefault();
    setError("");
    setLoading(true);

    try {
      await login(form.email, form.password);
      navigate(resolvePostAuthRedirect(searchParams), { replace: true });
    } catch (err) {
      setError("No se pudo iniciar sesion. Revisa tus datos.");
    } finally {
      setLoading(false);
    }
  };

  if (clerkLoaded && clerkSignedIn) {
    return (
      <AppLoadingScreen
        title="Preparando Lunchfy"
        subtitle="Estamos abriendo tu cocina con tu sesion segura."
      />
    );
  }

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
          <h2 className="kitchen-login-title">Acceso legacy</h2>
          <p className="kitchen-login-subtitle">Usa tu acceso anterior si todavia lo necesitas.</p>
          {profileDeleted ? <div className="kitchen-alert success">Perfil eliminado correctamente. Puedes iniciar sesion o registrarte de nuevo.</div> : null}
          {profileDeletedWarning ? <div className="kitchen-alert error">{profileDeletedWarning}</div> : null}
          <form onSubmit={onSubmit} className="kitchen-login-form">
            <div className="kitchen-login-fields">
              <label className="kitchen-ui-input-group" htmlFor="login-email">
                <span className="kitchen-login-label">CORREO ELECTRONICO</span>
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
                <span className="kitchen-login-label">CONTRASENA</span>
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
                    placeholder="........"
                    required
                  />
                  <button type="button" className="kitchen-login-eye" aria-label="Mostrar contrasena">
                    <svg viewBox="0 0 24 24" role="presentation" className="kitchen-login-input-icon">
                      <path d="M2.5 12s3.5-6 9.5-6 9.5 6 9.5 6-3.5 6-9.5 6-9.5-6-9.5-6Z" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
                      <circle cx="12" cy="12" r="2.8" fill="none" stroke="currentColor" strokeWidth="1.7" />
                    </svg>
                  </button>
                </div>
              </label>
              <div className="kitchen-login-forgot-row">
                <button
                  type="button"
                  className="kitchen-login-link"
                  onClick={() => navigate("/forgot-password")}
                >
                  Olvidaste tu contrasena?
                </button>
              </div>
            </div>
            {error ? <div className="kitchen-login-error">{error}</div> : null}
            <button type="submit" className="kitchen-ui-button kitchen-login-submit" disabled={loading}>
              {loading ? "Entrando..." : "Iniciar sesion"}
            </button>
          </form>
          <p className="kitchen-login-footer">
            Prefieres el acceso principal?{" "}
            <button type="button" className="kitchen-login-link" onClick={() => navigate(next ? `/login?next=${encodeURIComponent(next)}` : "/login")}>
              Usar Clerk
            </button>
          </p>
          <p className="kitchen-login-footer">
            No tienes cuenta legacy?{" "}
            <button type="button" className="kitchen-login-link" onClick={() => navigate(next ? `/legacy-signup?next=${encodeURIComponent(next)}` : "/legacy-signup")}>
              Registrate
            </button>
          </p>
        </Card>
      </div>
    </div>
  );
}
