import React, { useEffect, useMemo, useRef, useState } from "react";
import { SignIn, SignUp, useAuth as useClerkAuth, useClerk } from "@clerk/react";
import { useLocation, useNavigate, useSearchParams } from "react-router-dom";
import { buildApiUrl } from "../api.js";
import { useAuth } from "../auth";
import { AppLoadingScreen } from "../components/WeekPageSkeleton.jsx";
import Card from "../components/ui/Card";

const clerkPublishableKey = import.meta.env.VITE_CLERK_PUBLISHABLE_KEY;
const clerkCompletePath = "/auth/clerk/complete";
const clerkLoginPath = "/login";
const clerkSignUpPath = "/signup";
const clerkPostAuthPath = "/kitchen/semana";
const clerkAfterSignUpPath = import.meta.env.VITE_CLERK_AFTER_SIGN_UP_URL || "/onboarding/clerk";
const fallbackHostedSignInUrl = import.meta.env.VITE_CLERK_HOSTED_SIGN_IN_URL || "";
const fallbackHostedSignUpUrl = import.meta.env.VITE_CLERK_HOSTED_SIGN_UP_URL || "";
const pendingInviteTokenKey = "clerk_onboarding_invite_token";
const pendingInviteCodeKey = "clerk_onboarding_invite_code";

function buildRouteWithSearch(path, values = {}) {
  const params = new URLSearchParams();
  Object.entries(values).forEach(([key, value]) => {
    const safeValue = String(value || "").trim();
    if (!safeValue) return;
    params.set(key, safeValue);
  });
  const query = params.toString();
  return query ? `${path}?${query}` : path;
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
  if (!clerkPublishableKey) {
    const fallbackUrl = mode === "sign-up" ? fallbackHostedSignUpUrl : fallbackHostedSignInUrl;
    return (
      <AuthShell
        kicker="Acceso"
        title="Acceso no configurado"
        subtitle="No pudimos abrir Clerk en este entorno."
      >
        <div className="kitchen-alert error">
          Falta configurar `VITE_CLERK_PUBLISHABLE_KEY`.
        </div>
        {fallbackUrl ? (
          <div className="kitchen-actions">
            <a className="kitchen-button" href={fallbackUrl}>
              {mode === "sign-up" ? "Abrir registro seguro" : "Abrir acceso seguro"}
            </a>
          </div>
        ) : null}
      </AuthShell>
    );
  }

  return <ClerkAuthContent mode={mode} />;
}

function ClerkAuthContent({ mode }) {
  const navigate = useNavigate();
  const location = useLocation();
  const [searchParams] = useSearchParams();
  const { user, loading, onboardingRequired, lastAuthError, refreshUser, clearSession } = useAuth();
  const { isLoaded, isSignedIn } = useClerkAuth();
  const clerk = useClerk();
  const [finalBootstrapError, setFinalBootstrapError] = useState("");
  const [inviteDetails, setInviteDetails] = useState(null);
  const [inviteDetailsLoaded, setInviteDetailsLoaded] = useState(false);
  const finalBootstrapErrorTimerRef = useRef(null);

  const inviteToken = String(
    searchParams.get("inviteToken")
    || searchParams.get("token")
    || searchParams.get("invite")
    || ""
  ).trim();
  const inviteCode = String(
    searchParams.get("inviteCode")
    || searchParams.get("code")
    || searchParams.get("invite")
    || ""
  ).replace(/\D/g, "").slice(0, 6);
  const inviteSearch = useMemo(
    () => ({
      inviteToken: inviteToken || undefined,
      inviteCode: inviteCode || undefined
    }),
    [inviteCode, inviteToken]
  );
  const loginRoute = useMemo(() => buildRouteWithSearch(clerkLoginPath, inviteSearch), [inviteSearch]);
  const signUpRoute = useMemo(() => buildRouteWithSearch(clerkSignUpPath, inviteSearch), [inviteSearch]);
  const completeRoute = useMemo(() => buildRouteWithSearch(clerkCompletePath, inviteSearch), [inviteSearch]);
  const onboardingRoute = useMemo(() => buildRouteWithSearch(clerkAfterSignUpPath, inviteSearch), [inviteSearch]);

  const pageCopy = useMemo(() => {
    if (mode === "sign-up") {
      return {
        kicker: "Registro",
        title: "Crea tu cuenta",
        subtitle: "Completa tu alta segura y continuaremos con la configuracion del hogar."
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
      kicker: "Acceso",
      title: "Entra a tu cocina",
      subtitle: "Inicia sesion con tu cuenta segura de Lunchfy."
    };
  }, [mode]);

  useEffect(() => {
    if (mode === "choice" || mode === "reset-password") {
      navigate(loginRoute, { replace: true });
    }
  }, [loginRoute, mode, navigate]);

  useEffect(() => {
    if (location.pathname === "/sign-in") {
      navigate(loginRoute, { replace: true });
    }
  }, [location.pathname, loginRoute, navigate]);

  useEffect(() => {
    if (location.pathname.startsWith("/auth/clerk/sign-in")) {
      navigate(loginRoute, { replace: true });
    }
    if (location.pathname.startsWith("/auth/clerk/sign-up")) {
      navigate(signUpRoute, { replace: true });
    }
  }, [location.pathname, loginRoute, navigate, signUpRoute]);

  useEffect(() => {
    if (inviteToken) {
      window.sessionStorage.setItem(pendingInviteTokenKey, inviteToken);
    }
    if (inviteCode) {
      window.sessionStorage.setItem(pendingInviteCodeKey, inviteCode);
    }
  }, [inviteCode, inviteToken]);

  useEffect(() => {
    let active = true;
    if (!inviteToken) {
      setInviteDetails(null);
      setInviteDetailsLoaded(true);
      return undefined;
    }

    const loadInvite = async () => {
      try {
        const response = await fetch(buildApiUrl(`/api/kitchen/auth/invite/${encodeURIComponent(inviteToken)}`));
        const data = await response.json().catch(() => ({}));
        if (!active || !response.ok) return;
        setInviteDetails({
          householdName: data.householdName || "",
          recipientEmail: data.recipientEmail || "",
          role: data.role || "",
          expiresAt: data.expiresAt || ""
        });
      } catch {
        if (!active) return;
        setInviteDetails(null);
      } finally {
        if (active) {
          setInviteDetailsLoaded(true);
        }
      }
    };

    setInviteDetailsLoaded(false);
    void loadInvite();
    return () => {
      active = false;
    };
  }, [inviteToken]);

  useEffect(() => {
    if (!isLoaded || !isSignedIn) return;

    if (onboardingRequired) {
      setFinalBootstrapError("");
      navigate(onboardingRoute, { replace: true });
      return;
    }

    if (user?.id) {
      setFinalBootstrapError("");
      navigate(clerkPostAuthPath, { replace: true });
    }
  }, [isLoaded, isSignedIn, navigate, onboardingRequired, onboardingRoute, user]);

  useEffect(() => {
    if (!isLoaded || !isSignedIn || loading || user?.id || onboardingRequired || !lastAuthError) return;
    if (finalBootstrapErrorTimerRef.current) {
      window.clearTimeout(finalBootstrapErrorTimerRef.current);
    }
    finalBootstrapErrorTimerRef.current = window.setTimeout(() => {
      setFinalBootstrapError("No se pudo completar el acceso. Intentalo de nuevo.");
    }, 1200);
  }, [isLoaded, isSignedIn, lastAuthError, loading, onboardingRequired, user?.id]);

  useEffect(() => (
    () => {
      if (finalBootstrapErrorTimerRef.current) {
        window.clearTimeout(finalBootstrapErrorTimerRef.current);
      }
    }
  ), []);

  const signOut = async () => {
    clearSession();
    await clerk.signOut({ redirectUrl: loginRoute });
  };

  const retryBootstrap = async () => {
    setFinalBootstrapError("");
    await refreshUser({ authMode: "clerk" });
  };

  const isResolvingClerkHandoff = isLoaded && isSignedIn && (loading || (!user?.id && !onboardingRequired && !finalBootstrapError));
  const shouldWaitForInviteContext = Boolean(inviteToken) && !inviteDetailsLoaded;

  if ((mode === "choice" || mode === "reset-password") && !isSignedIn) {
    return (
      <AppLoadingScreen
        title="Preparando acceso"
        subtitle="Estamos abriendo la pantalla de acceso."
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
        subtitle="Estamos terminando tu acceso y recuperando tu perfil."
      />
    );
  }

  if (shouldWaitForInviteContext) {
    return (
      <AppLoadingScreen
        title="Preparando invitacion"
        subtitle="Estamos cargando el contexto de tu hogar."
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
          Tu sesion segura esta activa, pero Lunchfy todavia no pudo terminar el acceso.
        </div>
        <div className="kitchen-actions" style={{ alignItems: "center" }}>
          <button type="button" className="kitchen-button" onClick={retryBootstrap}>
            Reintentar
          </button>
          <button type="button" className="kitchen-button secondary" onClick={signOut}>
            Cambiar cuenta
          </button>
        </div>
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
          Si acabas de crear la cuenta, revisa tu email y completa la verificacion. Cuando la sesion quede activa, Lunchfy continuara automaticamente.
        </div>
        <div className="kitchen-actions">
          <button type="button" className="kitchen-button" onClick={() => navigate(loginRoute)}>
            Iniciar sesion
          </button>
          <button type="button" className="kitchen-button secondary" onClick={() => navigate(signUpRoute)}>
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
      {inviteToken || inviteCode ? (
        <div className="kitchen-alert info">
          {inviteDetails?.householdName
            ? `Te han invitado a unirte a ${inviteDetails.householdName}.`
            : "Este acceso esta vinculado a una invitacion de hogar."}{" "}
          {inviteDetails?.recipientEmail ? `Usa el email ${inviteDetails.recipientEmail} para continuar.` : ""}
        </div>
      ) : null}

      <ClerkWidgetMount>
        {mode === "sign-up" ? (
          <SignUp
            routing="path"
            path="/signup"
            signInUrl={loginRoute}
            forceRedirectUrl={onboardingRoute}
            fallbackRedirectUrl={onboardingRoute}
          />
        ) : (
          <SignIn
            routing="path"
            path="/login"
            signUpUrl={signUpRoute}
            forceRedirectUrl={completeRoute}
            fallbackRedirectUrl={completeRoute}
          />
        )}
      </ClerkWidgetMount>
    </AuthShell>
  );
}
