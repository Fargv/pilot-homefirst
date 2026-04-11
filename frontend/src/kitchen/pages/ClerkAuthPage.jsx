import React, { useEffect, useState } from "react";
import { SignIn, SignUp, UserButton, useAuth as useClerkAuth, useClerk, useUser } from "@clerk/react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../auth";
import Card from "../components/ui/Card";

const clerkPublishableKey = import.meta.env.VITE_CLERK_PUBLISHABLE_KEY;

export default function ClerkAuthPage() {
  const navigate = useNavigate();

  if (!clerkPublishableKey) {
    return (
      <div className="kitchen-app">
        <div className="kitchen-container kitchen-login-wrap">
          <Card className="kitchen-login-card">
            <h2 className="kitchen-login-title">Acceso no configurado</h2>
            <p className="kitchen-login-subtitle">El acceso con Clerk aun no esta disponible en este entorno.</p>
            <button type="button" className="kitchen-ui-button kitchen-login-submit" onClick={() => navigate("/login")}>
              Usar acceso con email y contrasena
            </button>
          </Card>
        </div>
      </div>
    );
  }

  return <ClerkAuthContent />;
}

function ClerkAuthContent() {
  const navigate = useNavigate();
  const { user, onboardingRequired, refreshUser, clearSession } = useAuth();
  const { isSignedIn } = useClerkAuth();
  const clerk = useClerk();
  const { user: clerkUser } = useUser();
  const [error, setError] = useState("");
  const clerkEmail = clerkUser?.primaryEmailAddress?.emailAddress || clerkUser?.emailAddresses?.[0]?.emailAddress || "";

  useEffect(() => {
    let active = true;
    const bootstrap = async () => {
      if (!isSignedIn) return;
      const nextUser = await refreshUser({ authMode: "clerk" });
      if (!active) return;
      if (nextUser?.onboardingRequired) {
        navigate("/onboarding/clerk", { replace: true });
        return;
      }
      if (nextUser?.id) {
        navigate("/kitchen/semana", { replace: true });
      }
    };
    void bootstrap();
    return () => {
      active = false;
    };
  }, [isSignedIn, navigate, refreshUser]);

  const continueAfterClerk = async () => {
    setError("");
    const nextUser = await refreshUser({ authMode: "clerk" });
    if (nextUser?.onboardingRequired || onboardingRequired) {
      navigate("/onboarding/clerk");
      return;
    }
    if (nextUser?.id || user?.id) {
      navigate("/kitchen/semana");
      return;
    }
    setError("No pudimos preparar tu perfil interno. Intentalo de nuevo.");
  };

  const signOut = async () => {
    clearSession();
    await clerk.signOut({ redirectUrl: "/auth/clerk" });
  };

  return (
    <div className="kitchen-app">
      <div className="kitchen-container kitchen-login-wrap">
        <Card className="kitchen-auth-card">
          <p className="kitchen-auth-kicker">Lunchfy</p>
          <h2 className="kitchen-login-title">Entra a tu cocina</h2>
          <p className="kitchen-login-subtitle">Puedes continuar con Clerk o usar el acceso con email y contrasena mientras migramos las cuentas.</p>

          <div className="kitchen-actions" style={{ marginBottom: 16 }}>
            <button type="button" className="kitchen-button secondary" onClick={() => navigate("/login")}>
              Acceso con email
            </button>
            <button type="button" className="kitchen-button secondary" onClick={() => navigate("/register")}>
              Crear cuenta con email
            </button>
          </div>

          {isSignedIn ? (
            <div className="kitchen-auth-card">
              <p className="kitchen-auth-kicker">Sesion activa</p>
              <p className="kitchen-login-subtitle">{clerkEmail ? `Conectado como ${clerkEmail}` : "Sesion de Clerk activa."}</p>
              {error ? <div className="kitchen-alert error">{error}</div> : null}
              <div className="kitchen-actions" style={{ alignItems: "center" }}>
                <UserButton afterSignOutUrl="/auth/clerk" />
                <button type="button" className="kitchen-button" onClick={continueAfterClerk}>
                  Continuar
                </button>
                <button type="button" className="kitchen-button secondary" onClick={signOut}>
                  Cambiar cuenta
                </button>
              </div>
            </div>
          ) : (
            <div className="kitchen-login-socials" style={{ alignItems: "flex-start", gap: 24 }}>
              <div>
                <h3 className="kitchen-auth-kicker">Crear cuenta</h3>
                <SignUp
                  routing="hash"
                  signInUrl="/auth/clerk"
                  forceRedirectUrl="/auth/clerk"
                />
              </div>
              <div>
                <h3 className="kitchen-auth-kicker">Iniciar sesion</h3>
                <SignIn
                  routing="hash"
                  signUpUrl="/auth/clerk"
                  forceRedirectUrl="/auth/clerk"
                />
              </div>
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}
