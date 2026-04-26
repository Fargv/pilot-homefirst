import React, { useEffect, useMemo, useRef, useState } from "react";
import { SignIn, SignUp, UserButton, useAuth as useClerkAuth, useClerk, useUser } from "@clerk/react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useAuth } from "../auth";
import { AppLoadingScreen } from "../components/WeekPageSkeleton.jsx";
import Card from "../components/ui/Card";

const clerkPublishableKey = import.meta.env.VITE_CLERK_PUBLISHABLE_KEY;
const isDevelopmentEnvironment = import.meta.env.VITE_APP_ENV === "development" || import.meta.env.DEV;
const clerkCompletePath = "/auth/clerk/complete";
const clerkSignInPath = "/auth/clerk/sign-in";
const clerkSignUpPath = "/auth/clerk/sign-up";
const clerkPostAuthPath = "/kitchen/semana";
const pendingInviteTokenKey = "clerk_onboarding_invite_token";
const pendingInviteCodeKey = "clerk_onboarding_invite_code";

function stringifyDebugValue(value) {
  const seen = new WeakSet();
  return JSON.stringify(
    value,
    (key, nextValue) => {
      if (typeof nextValue === "object" && nextValue !== null) {
        if (seen.has(nextValue)) return "[Circular]";
        seen.add(nextValue);
      }
      if (typeof nextValue === "function") return `[Function ${nextValue.name || "anonymous"}]`;
      return nextValue;
    },
    2
  );
}

function normalizeBackendError(error) {
  if (!error) return null;
  return {
    message: error?.message || "No se pudo validar la sesion.",
    status: error?.status || 0,
    code: error?.code || "AUTH_ERROR",
    body: error?.body || {}
  };
}

function AuthShell({ kicker, title, subtitle, children }) {
  return (
    <div className="kitchen-app">
      <div className="kitchen-container kitchen-login-wrap">
        <Card className="kitchen-login-card kitchen-auth-card">
          <p className="kitchen-auth-kicker">{kicker}</p>
          <h2 className="kitchen-login-title">{title}</h2>
          <p className="kitchen-login-subtitle">{subtitle}</p>
          {children}
        </Card>
      </div>
    </div>
  );
}

function ClerkWidgetMount({ children }) {
  return <div className="kitchen-clerk-mount">{children}</div>;
}

export default function ClerkAuthPage({ mode = "sign-in" }) {
  const navigate = useNavigate();

  if (!clerkPublishableKey) {
    return (
      <AuthShell
        kicker="Cuenta segura"
        title="Acceso no configurado"
        subtitle="El acceso con Clerk aun no esta disponible en este entorno."
      >
        <button type="button" className="kitchen-ui-button kitchen-login-submit" onClick={() => navigate("/login")}>
          Usar acceso con email y contrasena
        </button>
      </AuthShell>
    );
  }

  return <ClerkAuthContent mode={mode} />;
}

function ClerkAuthContent({ mode }) {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { user, loading, onboardingRequired, lastAuthError, refreshUser, clearSession } = useAuth();
  const { isLoaded, isSignedIn } = useClerkAuth();
  const clerk = useClerk();
  const { user: clerkUser } = useUser();
  const [showDebug, setShowDebug] = useState(false);
  const [finalBootstrapError, setFinalBootstrapError] = useState("");
  const [lastBootstrapStatus, setLastBootstrapStatus] = useState("waiting");
  const finalBootstrapErrorTimerRef = useRef(null);

  const clerkEmail = clerkUser?.primaryEmailAddress?.emailAddress || clerkUser?.emailAddresses?.[0]?.emailAddress || "";
  const clerkIdentity = clerkEmail || clerkUser?.username || clerkUser?.id || "Unknown Clerk user";

  const pageCopy = useMemo(() => {
    if (mode === "sign-up") {
      return {
        kicker: "Cuenta segura",
        title: "Crea tu cuenta",
        subtitle: "Crea tu acceso seguro. Clerk te guiara con la verificacion del email y luego continuaremos con tu perfil interno."
      };
    }
    if (mode === "complete") {
      return {
        kicker: "Preparando tu cocina",
        title: "Terminando el acceso",
        subtitle: "Estamos conectando tu sesion segura con tu perfil de Lunchfy."
      };
    }
    return {
      kicker: "Cuenta segura",
      title: "Entra a tu cocina",
      subtitle: "Inicia sesion con tu cuenta segura de Lunchfy. Si aun no la tienes, puedes crearla en un paso aparte."
    };
  }, [mode]);

  useEffect(() => {
    if (mode === "choice" || mode === "reset-password") {
      navigate(clerkSignInPath, { replace: true });
    }
  }, [mode, navigate]);

  useEffect(() => {
    const inviteToken = String(searchParams.get("inviteToken") || searchParams.get("token") || "").trim();
    const inviteCode = String(searchParams.get("inviteCode") || searchParams.get("code") || "").replace(/\D/g, "").slice(0, 6);
    if (inviteToken) {
      window.sessionStorage.setItem(pendingInviteTokenKey, inviteToken);
      if (isDevelopmentEnvironment) {
        console.info("[clerk][dev] Stored pending invite token for Clerk onboarding");
      }
    }
    if (inviteCode) {
      window.sessionStorage.setItem(pendingInviteCodeKey, inviteCode);
      if (isDevelopmentEnvironment) {
        console.info("[clerk][dev] Stored pending invite code for Clerk onboarding", { inviteCode });
      }
    }
  }, [searchParams]);

  useEffect(() => {
    if (!isDevelopmentEnvironment) return;
    console.info("[clerk][dev] Clerk auth route mounted", {
      mode,
      isSignedIn,
      returnRoute: clerkCompletePath
    });
  }, [isSignedIn, mode]);

  useEffect(() => {
    if (!isLoaded || !isSignedIn) return;

    if (onboardingRequired) {
      setLastBootstrapStatus("onboarding-required");
      setFinalBootstrapError("");
      navigate("/onboarding/clerk", { replace: true });
      return;
    }

    if (user?.id) {
      setLastBootstrapStatus("mapped");
      setFinalBootstrapError("");
      navigate(clerkPostAuthPath, { replace: true });
    }
  }, [isLoaded, isSignedIn, navigate, onboardingRequired, user]);

  useEffect(() => {
    if (!isLoaded || !isSignedIn || loading || user?.id || onboardingRequired || !lastAuthError) return;
    const normalizedError = normalizeBackendError(lastAuthError);
    if (finalBootstrapErrorTimerRef.current) {
      window.clearTimeout(finalBootstrapErrorTimerRef.current);
    }
    finalBootstrapErrorTimerRef.current = window.setTimeout(() => {
      setLastBootstrapStatus("mapping-failed");
      setFinalBootstrapError(
        `${normalizedError.code || "AUTH_ERROR"} (${normalizedError.status || "sin status"}): ${normalizedError.message}`
      );
    }, 1200);
  }, [finalBootstrapError, isLoaded, isSignedIn, lastAuthError, loading, onboardingRequired, user?.id]);

  useEffect(() => (
    () => {
      if (finalBootstrapErrorTimerRef.current) {
        window.clearTimeout(finalBootstrapErrorTimerRef.current);
      }
    }
  ), []);

  const signOut = async () => {
    clearSession();
    await clerk.signOut({ redirectUrl: clerkSignInPath });
  };

  const retryBootstrap = async () => {
    setFinalBootstrapError("");
    setLastBootstrapStatus("retrying");
    await refreshUser({ authMode: "clerk" });
  };

  const isResolvingClerkHandoff = isLoaded && isSignedIn && (loading || (!user?.id && !onboardingRequired && !finalBootstrapError));
  if ((mode === "choice" || mode === "reset-password") && !isSignedIn) {
    return (
      <AppLoadingScreen
        title="Preparando acceso"
        subtitle="Estamos abriendo la pantalla segura de Lunchfy."
      />
    );
  }

  if (mode === "complete" && isResolvingClerkHandoff) {
    return (
      <AppLoadingScreen
        title="Preparando Lunchfy"
        subtitle="Estamos abriendo tu cocina con tu sesion segura."
      />
    );
  }

  if (isResolvingClerkHandoff) {
    return (
      <AppLoadingScreen
        title="Preparando Lunchfy"
        subtitle="Estamos terminando tu acceso seguro y recuperando tu perfil."
      />
    );
  }

  if (isSignedIn && finalBootstrapError) {
    return (
      <AuthShell
        kicker={pageCopy.kicker}
        title={pageCopy.title}
        subtitle={pageCopy.subtitle}
      >
        <div className="kitchen-alert error">{finalBootstrapError}</div>
        <div className="kitchen-alert info">
          Tu sesion de Clerk esta activa como <strong>{clerkIdentity}</strong>, pero Lunchfy todavia no pudo terminar el enlace con tu perfil interno.
        </div>
        <div className="kitchen-actions" style={{ alignItems: "center" }}>
          <UserButton afterSignOutUrl={clerkSignInPath} />
          <button type="button" className="kitchen-button" onClick={retryBootstrap}>
            Reintentar
          </button>
          <button type="button" className="kitchen-button secondary" onClick={signOut}>
            Cambiar cuenta
          </button>
        </div>
        {isDevelopmentEnvironment ? (
          <button type="button" className="kitchen-login-link" onClick={() => setShowDebug((next) => !next)}>
            {showDebug ? "Ocultar diagnostico DEV" : "Mostrar diagnostico DEV"}
          </button>
        ) : null}
        {isDevelopmentEnvironment && showDebug ? (
          <div className="kitchen-auth-card" style={{ marginTop: 16 }}>
            <div className="kitchen-alert info">
              <strong>Clerk auth state:</strong> {isSignedIn ? "signed in" : "signed out"}
              <br />
              <strong>Clerk route:</strong> {mode}
              <br />
              <strong>Clerk identity:</strong> {clerkIdentity}
              <br />
              <strong>Mongo mapping state:</strong> mapping failed
              <br />
              <strong>Onboarding state:</strong> {onboardingRequired ? "required" : user?.id ? "complete" : "unknown"}
              <br />
              <strong>Last backend auth error:</strong>{" "}
              {lastAuthError ? `${lastAuthError.code} / ${lastAuthError.status}: ${lastAuthError.message}` : "none"}
              <br />
              <strong>Last bootstrap status:</strong> {lastBootstrapStatus}
            </div>
            {lastAuthError ? (
              <pre className="kitchen-alert error" style={{ whiteSpace: "pre-wrap", overflowX: "auto" }}>
                {stringifyDebugValue(lastAuthError)}
              </pre>
            ) : null}
          </div>
        ) : null}
      </AuthShell>
    );
  }

  if (mode === "complete" && !isSignedIn) {
    return (
      <AuthShell
        kicker={pageCopy.kicker}
        title={pageCopy.title}
        subtitle={pageCopy.subtitle}
      >
        <div className="kitchen-alert info">
          Si acabas de crear la cuenta, revisa tu email y completa la verificacion desde el mensaje de Clerk. Cuando la sesion quede activa, Lunchfy continuara automaticamente.
        </div>
        <div className="kitchen-actions">
          <button type="button" className="kitchen-button" onClick={() => navigate(clerkSignInPath)}>
            Iniciar sesion
          </button>
          <button type="button" className="kitchen-button secondary" onClick={() => navigate(clerkSignUpPath)}>
            Crear cuenta
          </button>
        </div>
      </AuthShell>
    );
  }

  return (
    <AuthShell
      kicker={pageCopy.kicker}
      title={pageCopy.title}
      subtitle={pageCopy.subtitle}
    >
      {mode === "sign-up" ? (
        <div className="kitchen-alert info">
          Despues de crear tu cuenta, Clerk te pedira verificar el email. Usa el enlace o el paso de verificacion que te muestre la propia pantalla antes de continuar a Lunchfy.
        </div>
      ) : null}

      <ClerkWidgetMount>
        {mode === "sign-up" ? (
          <SignUp
            routing="path"
            path={clerkSignUpPath}
            signInUrl={clerkSignInPath}
            forceRedirectUrl={clerkCompletePath}
            fallbackRedirectUrl={clerkCompletePath}
            afterSignOutUrl={clerkSignInPath}
          />
        ) : (
          <SignIn
            routing="path"
            path={clerkSignInPath}
            signUpUrl={clerkSignUpPath}
            forceRedirectUrl={clerkCompletePath}
            fallbackRedirectUrl={clerkCompletePath}
            afterSignOutUrl={clerkSignInPath}
          />
        )}
      </ClerkWidgetMount>

      <div className="kitchen-auth-footer-actions">
        {mode === "sign-up" ? (
          <button type="button" className="kitchen-login-link" onClick={() => navigate(clerkSignInPath)}>
            Ya tienes cuenta? Inicia sesion
          </button>
        ) : (
          <button type="button" className="kitchen-login-link" onClick={() => navigate(clerkSignUpPath)}>
            Crear cuenta
          </button>
        )}
        <button type="button" className="kitchen-login-link" onClick={() => navigate("/login")}>
          Usar acceso legacy
        </button>
      </div>

      {isDevelopmentEnvironment ? (
        <button type="button" className="kitchen-login-link" onClick={() => setShowDebug((next) => !next)}>
          {showDebug ? "Ocultar diagnostico DEV" : "Mostrar diagnostico DEV"}
        </button>
      ) : null}

      {isDevelopmentEnvironment && showDebug ? (
        <div className="kitchen-auth-card" style={{ marginTop: 16 }}>
          <div className="kitchen-alert info">
            <strong>Clerk auth state:</strong> {isLoaded ? (isSignedIn ? "signed in" : "signed out") : "loading"}
            <br />
            <strong>Clerk route:</strong> {mode}
            <br />
            <strong>Clerk identity:</strong> {isSignedIn ? clerkIdentity : "none"}
            <br />
            <strong>Mongo mapping state:</strong>{" "}
            {loading ? "resolving" : user?.email ? `mapped to ${user.email}` : finalBootstrapError ? "mapping failed" : "not resolved"}
            <br />
            <strong>Onboarding state:</strong> {onboardingRequired ? "required" : user?.id ? "complete" : "unknown"}
            <br />
            <strong>Last backend auth error:</strong>{" "}
            {lastAuthError ? `${lastAuthError.code} / ${lastAuthError.status}: ${lastAuthError.message}` : "none"}
            <br />
            <strong>Last bootstrap status:</strong> {lastBootstrapStatus}
          </div>
          {lastAuthError ? (
            <pre className="kitchen-alert error" style={{ whiteSpace: "pre-wrap", overflowX: "auto" }}>
              {stringifyDebugValue(lastAuthError)}
            </pre>
          ) : null}
        </div>
      ) : null}
    </AuthShell>
  );
}
