import React, { useEffect, useMemo, useRef, useState } from "react";
import { useAuth as useClerkAuth, useClerk } from "@clerk/react";
import { useLocation, useNavigate, useSearchParams } from "react-router-dom";
import { buildApiUrl } from "../api.js";
import { useAuth } from "../auth";
import { AppLoadingScreen } from "../components/WeekPageSkeleton.jsx";
import Card from "../components/ui/Card";

const clerkPublishableKey = import.meta.env.VITE_CLERK_PUBLISHABLE_KEY;
const clerkCompletePath = "/auth/clerk/complete";
const clerkSignInPath = "/sign-in";
const clerkPostAuthPath = "/kitchen/semana";
const clerkAfterSignUpPath = import.meta.env.VITE_CLERK_AFTER_SIGN_UP_URL || "/onboarding/clerk";
const pendingInviteTokenKey = "clerk_onboarding_invite_token";
const pendingInviteCodeKey = "clerk_onboarding_invite_code";

function decodeClerkFrontendApiFromPublishableKey(publishableKey) {
  const match = String(publishableKey || "").match(/^pk_(?:test|live)_(.+)$/);
  if (!match) return "";

  try {
    const base64 = match[1].replace(/-/g, "+").replace(/_/g, "/");
    const padded = `${base64}${"===".slice((base64.length + 3) % 4)}`;
    const decoded = atob(padded);
    return decoded
      .replace(/\$.*/, "")
      .trim()
      .replace(/\.clerk\.accounts\.dev$/i, ".accounts.dev");
  } catch {
    return "";
  }
}

function buildHostedClerkUrl(path) {
  const normalizedPath = path.startsWith("/") ? path : `/${path}`;
  const envUrl = normalizedPath === "/sign-up"
    ? import.meta.env.VITE_CLERK_HOSTED_SIGN_UP_URL
    : import.meta.env.VITE_CLERK_HOSTED_SIGN_IN_URL;

  if (envUrl) return String(envUrl).trim();

  const frontendApi = decodeClerkFrontendApiFromPublishableKey(import.meta.env.VITE_CLERK_PUBLISHABLE_KEY);
  if (!frontendApi) return "";
  return `https://${frontendApi}${normalizedPath}`;
}

function buildHostedRedirectUrl(baseUrl, search = "") {
  if (!baseUrl) return "";

  try {
    const url = new URL(baseUrl);
    const params = new URLSearchParams(search);
    params.forEach((value, key) => {
      url.searchParams.set(key, value);
    });
    return url.toString();
  } catch {
    return "";
  }
}

function isAlreadyOnHostedClerkDomain(targetUrl) {
  if (typeof window === "undefined" || !targetUrl) return false;

  try {
    const current = window.location.host;
    const target = new URL(targetUrl).host;
    return Boolean(current && target && current === target);
  } catch {
    return false;
  }
}

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
  const navigate = useNavigate();

  if (!clerkPublishableKey) {
    return (
      <AuthShell
        kicker="Cuenta segura"
        title="Acceso no configurado"
        subtitle="El acceso seguro aun no esta disponible en este entorno. Contacta con el administrador."
      >
        <p className="kitchen-auth-hint" style={{ textAlign: "center" }}>
          VITE_CLERK_PUBLISHABLE_KEY no esta configurado.
        </p>
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
  const [lastBootstrapStatus, setLastBootstrapStatus] = useState("waiting");
  const [inviteDetails, setInviteDetails] = useState(null);
  const [inviteDetailsLoaded, setInviteDetailsLoaded] = useState(false);
  const finalBootstrapErrorTimerRef = useRef(null);
  const signInRedirectStartedRef = useRef(false);
  const signUpRedirectStartedRef = useRef(false);

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
  const signInRoute = useMemo(() => buildRouteWithSearch(clerkSignInPath, inviteSearch), [inviteSearch]);
  const completeRoute = useMemo(() => buildRouteWithSearch(clerkCompletePath, inviteSearch), [inviteSearch]);
  const onboardingRoute = useMemo(() => buildRouteWithSearch(clerkAfterSignUpPath, inviteSearch), [inviteSearch]);
  const hostedSignInUrl = useMemo(
    () => buildHostedRedirectUrl(buildHostedClerkUrl("/sign-in"), location.search),
    [location.search]
  );
  const hostedSignUpUrl = useMemo(
    () => buildHostedRedirectUrl(buildHostedClerkUrl("/sign-up"), location.search),
    [location.search]
  );

  const pageCopy = useMemo(() => {
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
      navigate(signInRoute, { replace: true });
    }
  }, [mode, navigate, signInRoute]);

  useEffect(() => {
    if (mode !== "sign-in" || signInRedirectStartedRef.current) return;
    signInRedirectStartedRef.current = true;

    if (!hostedSignInUrl || isAlreadyOnHostedClerkDomain(hostedSignInUrl)) {
      return;
    }

    window.location.replace(hostedSignInUrl);
  }, [hostedSignInUrl, mode]);

  useEffect(() => {
    if (inviteToken) {
      window.sessionStorage.setItem(pendingInviteTokenKey, inviteToken);
    }
    if (inviteCode) {
      window.sessionStorage.setItem(pendingInviteCodeKey, inviteCode);
    }
  }, [inviteCode, inviteToken]);

  useEffect(() => {
    if (mode !== "sign-up" || signUpRedirectStartedRef.current) return;
    signUpRedirectStartedRef.current = true;

    if (!hostedSignUpUrl || isAlreadyOnHostedClerkDomain(hostedSignUpUrl)) {
      return;
    }

    window.location.replace(hostedSignUpUrl);
  }, [hostedSignUpUrl, mode]);

  useEffect(() => {
    let active = true;
    if (mode === "sign-up" || !inviteToken) {
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
  }, [inviteToken, mode]);

  useEffect(() => {
    if (!isLoaded || !isSignedIn) return;

    if (onboardingRequired) {
      setLastBootstrapStatus("onboarding-required");
      setFinalBootstrapError("");
      navigate(onboardingRoute, { replace: true });
      return;
    }

    if (user?.id) {
      setLastBootstrapStatus("mapped");
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
      setLastBootstrapStatus("mapping-failed");
      setFinalBootstrapError("No se pudo completar el acceso. Intentalo de nuevo.");
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
    await clerk.signOut({ redirectUrl: signInRoute });
  };

  const retryBootstrap = async () => {
    setFinalBootstrapError("");
    setLastBootstrapStatus("retrying");
    await refreshUser({ authMode: "clerk" });
  };

  const isResolvingClerkHandoff = isLoaded && isSignedIn && (loading || (!user?.id && !onboardingRequired && !finalBootstrapError));
  const shouldWaitForInviteContext = false;
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

  if (shouldWaitForInviteContext) {
    return (
      <AppLoadingScreen
        title="Preparando acceso"
        subtitle="Estamos preparando tu invitacion para abrir el registro seguro."
      />
    );
  }

  if (mode === "sign-up") {
    if (hostedSignUpUrl) return null;
    return (
      <AuthShell
        kicker="Cuenta segura"
        title="Registro no configurado"
        subtitle="No pudimos abrir el sign-up seguro en este entorno."
      >
        <div className="kitchen-alert error">
          Falta configurar la URL hospedada de Clerk para el registro.
        </div>
      </AuthShell>
    );
  }

  if (mode === "sign-in") {
    if (hostedSignInUrl) return null;
    return (
      <AuthShell
        kicker="Acceso"
        title="Inicio de sesion no configurado"
        subtitle="No pudimos abrir el acceso seguro en este entorno."
      >
        <div className="kitchen-alert error">
          Falta configurar la URL hospedada de Clerk para iniciar sesion.
        </div>
      </AuthShell>
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
          <button type="button" className="kitchen-button" onClick={() => navigate("/login")}>
            Iniciar sesion
          </button>
          <button type="button" className="kitchen-button secondary" onClick={() => navigate("/signup")}>
            Crear cuenta
          </button>
        </div>
      </AuthShell>
    );
  }

  return null;
}
