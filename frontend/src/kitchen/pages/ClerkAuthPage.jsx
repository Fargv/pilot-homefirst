import React, { useEffect, useMemo, useRef, useState } from "react";
import { SignIn, SignUp, UserButton, useAuth as useClerkAuth, useClerk, useUser } from "@clerk/react";
import { useNavigate, useSearchParams } from "react-router-dom";
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
  const [inviteDetails, setInviteDetails] = useState(null);
  const [inviteDetailsLoaded, setInviteDetailsLoaded] = useState(false);
  const finalBootstrapErrorTimerRef = useRef(null);
  const devCountersRef = useRef({
    routeMountCount: 0,
    widgetMountCount: 0,
    signUpCreateCalls: 0,
    verificationPrepareCalls: 0,
    verificationAttemptCalls: 0,
    verificationResendCalls: 0
  });

  const clerkEmail = clerkUser?.primaryEmailAddress?.emailAddress || clerkUser?.emailAddresses?.[0]?.emailAddress || "";
  const clerkIdentity = clerkEmail || clerkUser?.username || clerkUser?.id || "Unknown Clerk user";
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
    devCountersRef.current.routeMountCount += 1;
    if (!isDevelopmentEnvironment) return;
    console.info("[clerk][dev] Clerk auth route mounted", {
      mode,
      isSignedIn,
      returnRoute: clerkCompletePath,
      routeMountCount: devCountersRef.current.routeMountCount
    });
    console.info("[clerk][dev] Manual sign-up verification calls in app shell", {
      signUpCreateCalls: devCountersRef.current.signUpCreateCalls,
      verificationPrepareCalls: devCountersRef.current.verificationPrepareCalls,
      verificationAttemptCalls: devCountersRef.current.verificationAttemptCalls,
      verificationResendCalls: devCountersRef.current.verificationResendCalls
    });
  }, [isSignedIn, mode]);

  useEffect(() => {
    if (!isDevelopmentEnvironment) return;
    if (mode !== "sign-in" && mode !== "sign-up") return;
    if (!inviteDetailsLoaded) return;
    if (mode === "sign-up" && inviteToken && !inviteDetails) return;

    devCountersRef.current.widgetMountCount += 1;
    console.info("[clerk][dev] Clerk widget ready to mount", {
      mode,
      widgetMountCount: devCountersRef.current.widgetMountCount,
      inviteTokenPresent: Boolean(inviteToken),
      inviteCodePresent: Boolean(inviteCode),
      prefilledEmailPresent: Boolean(initialEmailAddress)
    });
  }, [initialEmailAddress, inviteCode, inviteDetails, inviteDetailsLoaded, inviteToken, mode]);

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
          Tu sesion de Clerk esta activa como <strong>{clerkIdentity}</strong>, pero Lunchfy todavia no pudo terminar el enlace con tu perfil interno.
        </div>
        <div className="kitchen-actions" style={{ alignItems: "center" }}>
          <UserButton afterSignOutUrl={signInRoute} />
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
              <br />
              <strong>Route mount count:</strong> {devCountersRef.current.routeMountCount}
              <br />
              <strong>Widget mount count:</strong> {devCountersRef.current.widgetMountCount}
              <br />
              <strong>Manual sign-up create calls:</strong> {devCountersRef.current.signUpCreateCalls}
              <br />
              <strong>Manual verification prepare calls:</strong> {devCountersRef.current.verificationPrepareCalls}
              <br />
              <strong>Manual verification attempt calls:</strong> {devCountersRef.current.verificationAttemptCalls}
              <br />
              <strong>Manual verification resend calls:</strong> {devCountersRef.current.verificationResendCalls}
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
          <button type="button" className="kitchen-button" onClick={() => navigate(signInRoute)}>
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
            path={clerkSignUpPath}
            signInUrl={signInRoute}
            forceRedirectUrl={completeRoute}
            fallbackRedirectUrl={completeRoute}
            afterSignOutUrl={signInRoute}
            initialValues={signUpInitialValues}
          />
        ) : (
          <SignIn
            routing="path"
            path={clerkSignInPath}
            signUpUrl={signUpRoute}
            forceRedirectUrl={completeRoute}
            fallbackRedirectUrl={completeRoute}
            afterSignOutUrl={signInRoute}
            initialValues={signInInitialValues}
          />
        )}
      </ClerkWidgetMount>

      <div className="kitchen-auth-footer-actions">
        {mode === "sign-up" ? (
          <button type="button" className="kitchen-login-link" onClick={() => navigate(signInRoute)}>
            Ya tienes cuenta? Inicia sesion
          </button>
        ) : (
          <button type="button" className="kitchen-login-link" onClick={() => navigate(signUpRoute)}>
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
            <br />
            <strong>Route mount count:</strong> {devCountersRef.current.routeMountCount}
            <br />
            <strong>Widget mount count:</strong> {devCountersRef.current.widgetMountCount}
            <br />
            <strong>Manual sign-up create calls:</strong> {devCountersRef.current.signUpCreateCalls}
            <br />
            <strong>Manual verification prepare calls:</strong> {devCountersRef.current.verificationPrepareCalls}
            <br />
            <strong>Manual verification attempt calls:</strong> {devCountersRef.current.verificationAttemptCalls}
            <br />
            <strong>Manual verification resend calls:</strong> {devCountersRef.current.verificationResendCalls}
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
