import React, { useEffect, useMemo, useRef, useState } from "react";
import { SignIn, SignUp, useAuth as useClerkAuth, useClerk, useUser } from "@clerk/react";
import { useLocation, useNavigate, useSearchParams } from "react-router-dom";
import { buildApiUrl } from "../api.js";
import { useAuth } from "../auth";
import { AppLoadingScreen } from "../components/WeekPageSkeleton.jsx";
import Card from "../components/ui/Card";

const clerkPublishableKey = import.meta.env.VITE_CLERK_PUBLISHABLE_KEY;
const isDevelopmentEnvironment = import.meta.env.VITE_APP_ENV === "development" || import.meta.env.DEV;
const clerkCompletePath = "/auth/clerk/complete";
const clerkSignInPath = "/auth/clerk/sign-in";
const clerkSignUpPath = "/auth/clerk/sign-up";
const clerkPostAuthPath = "/kitchen/semana";
const legacyLoginPath = "/legacy-login";
const legacySignupPath = "/legacy-signup";
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
        <button type="button" className="kitchen-ui-button kitchen-login-submit" onClick={() => navigate(legacyLoginPath)}>
          Usar acceso con email y contrasena
        </button>
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
  const { user: clerkUser } = useUser();
  const [finalBootstrapError, setFinalBootstrapError] = useState("");
  const [lastBootstrapStatus, setLastBootstrapStatus] = useState("waiting");
  const [inviteDetails, setInviteDetails] = useState(null);
  const [inviteDetailsLoaded, setInviteDetailsLoaded] = useState(false);
  const finalBootstrapErrorTimerRef = useRef(null);

  const clerkEmail = clerkUser?.primaryEmailAddress?.emailAddress || clerkUser?.emailAddresses?.[0]?.emailAddress || "";
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
  const signUpRoute = useMemo(() => buildRouteWithSearch(clerkSignUpPath, inviteSearch), [inviteSearch]);
  const completeRoute = useMemo(() => buildRouteWithSearch(clerkCompletePath, inviteSearch), [inviteSearch]);
  const onboardingRoute = useMemo(() => buildRouteWithSearch("/onboarding/clerk", inviteSearch), [inviteSearch]);
  const widgetPath = useMemo(() => {
    if (mode === "sign-up") {
      if (location.pathname === "/signup" || location.pathname.startsWith("/signup/")) return "/signup";
      return clerkSignUpPath;
    }
    if (location.pathname === "/login" || location.pathname.startsWith("/login/")) return "/login";
    return clerkSignInPath;
  }, [location.pathname, mode]);
  const initialEmailAddress = inviteDetails?.recipientEmail || undefined;
  const signUpInitialValues = useMemo(() => ({ emailAddress: initialEmailAddress }), [initialEmailAddress]);
  const signInInitialValues = useMemo(() => ({ emailAddress: initialEmailAddress }), [initialEmailAddress]);

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
      navigate(signInRoute, { replace: true });
    }
  }, [mode, navigate, signInRoute]);

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
    const normalizedError = normalizeBackendError(lastAuthError);
    if (isDevelopmentEnvironment) {
      console.warn("[clerk][dev] No se pudo completar el enlace de la sesion", normalizedError);
    }
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
  const shouldWaitForInviteContext = (mode === "sign-in" || mode === "sign-up") && inviteToken && !inviteDetailsLoaded;
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

  return (
    <AuthShell
      kicker={pageCopy.kicker}
      title={pageCopy.title}
      subtitle={pageCopy.subtitle}
    >
      {mode === "sign-up" ? (
        <div className="kitchen-alert info">
          Te enviaremos un codigo para confirmar tu email y preparar tu perfil.
        </div>
      ) : null}
      {inviteToken || inviteCode ? (
        <div className="kitchen-alert info">
          {inviteDetails?.householdName
            ? `Te han invitado a unirte a ${inviteDetails.householdName}.`
            : "Esta alta esta vinculada a una invitacion de hogar."}{" "}
          {inviteDetails?.recipientEmail ? `Usa el email ${inviteDetails.recipientEmail} para continuar.` : "Confirma tu cuenta para entrar en esta cocina compartida."}
        </div>
      ) : null}

      <ClerkWidgetMount>
        {mode === "sign-up" ? (
          <SignUp
            routing="path"
            path={widgetPath}
            signInUrl="/login"
            forceRedirectUrl={completeRoute}
            fallbackRedirectUrl={completeRoute}
            afterSignOutUrl="/login"
            initialValues={signUpInitialValues}
          />
        ) : (
          <SignIn
            routing="path"
            path={widgetPath}
            signUpUrl="/signup"
            forceRedirectUrl={completeRoute}
            fallbackRedirectUrl={completeRoute}
            afterSignOutUrl="/login"
            initialValues={signInInitialValues}
          />
        )}
      </ClerkWidgetMount>

      <div className="kitchen-auth-footer-actions">
        {mode === "sign-up" ? (
          <button type="button" className="kitchen-login-link" onClick={() => navigate("/login")}>
            Ya tienes cuenta? Inicia sesion
          </button>
        ) : (
          <button type="button" className="kitchen-login-link" onClick={() => navigate("/signup")}>
            Crear cuenta
          </button>
        )}
        <button
          type="button"
          className="kitchen-login-link"
          onClick={() => navigate(mode === "sign-up" ? legacySignupPath : legacyLoginPath)}
        >
          Usar acceso legacy
        </button>
      </div>
    </AuthShell>
  );
}
