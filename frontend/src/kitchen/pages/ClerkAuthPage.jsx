import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  SignIn,
  SignUp,
  UserButton,
  useAuth as useClerkAuth,
  useClerk,
  useSignIn,
  useSignUp,
  useUser
} from "@clerk/react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useAuth } from "../auth";
import Card from "../components/ui/Card";

const clerkPublishableKey = import.meta.env.VITE_CLERK_PUBLISHABLE_KEY;
const isDevelopmentEnvironment = import.meta.env.VITE_APP_ENV === "development" || import.meta.env.DEV;
const clerkCompletePath = "/auth/clerk/complete";
const pendingInviteTokenKey = "clerk_onboarding_invite_token";
const pendingInviteCodeKey = "clerk_onboarding_invite_code";

function findFirstFieldError(fields = {}) {
  for (const value of Object.values(fields || {})) {
    if (value) return value;
  }
  return null;
}

function normalizeClerkErrors(source, errors) {
  const rawError = errors?.global?.[0] || findFirstFieldError(errors?.fields) || errors?.raw?.[0] || null;
  if (!rawError) return null;

  const firstApiError = rawError?.errors?.[0] || rawError;
  const code = firstApiError?.code || rawError?.code || "CLERK_ERROR";
  const longMessage =
    firstApiError?.longMessage
    || firstApiError?.long_message
    || rawError?.longMessage
    || rawError?.long_message
    || firstApiError?.message
    || rawError?.message
    || "Clerk sign-in/sign-up failed.";

  return {
    source,
    code,
    longMessage,
    raw: rawError,
    rawErrors: errors?.raw || null
  };
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

export default function ClerkAuthPage({ mode = "choice" }) {
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

  return <ClerkAuthContent mode={mode} />;
}

function ClerkAuthContent({ mode }) {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { user, loading, onboardingRequired, lastAuthError, refreshUser, clearSession } = useAuth();
  const { isLoaded, isSignedIn } = useClerkAuth();
  const signInState = useSignIn();
  const signUpState = useSignUp();
  const clerk = useClerk();
  const { user: clerkUser } = useUser();
  const [mappingError, setMappingError] = useState("");
  const [lastClerkError, setLastClerkError] = useState(null);
  const [lastBootstrapStatus, setLastBootstrapStatus] = useState("waiting");
  const lastClerkFormSubmitAtRef = useRef(0);
  const clerkEmail = clerkUser?.primaryEmailAddress?.emailAddress || clerkUser?.emailAddresses?.[0]?.emailAddress || "";
  const clerkIdentity = clerkEmail || clerkUser?.username || clerkUser?.id || "Unknown Clerk user";
  const pageCopy = useMemo(() => {
    if (mode === "sign-up") {
      return {
        kicker: "Cuenta segura",
        title: "Crea tu cuenta",
        subtitle: "Usa el acceso seguro para crear tu identidad. Despues completaremos tu perfil de cocina."
      };
    }
    if (mode === "sign-in") {
      return {
        kicker: "Cuenta segura",
        title: "Entra a tu cocina",
        subtitle: "Accede con tu identidad segura y continuaremos con tu perfil interno."
      };
    }
    if (mode === "reset-password") {
      return {
        kicker: "Cuenta segura",
        title: "Recupera tu acceso seguro",
        subtitle: "Usa el flujo de Clerk para restablecer la contrasena de tu cuenta segura."
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
      kicker: "Lunchfy",
      title: "Entra a tu cocina",
      subtitle: "Puedes usar el acceso seguro o continuar con email y contrasena mientras migramos las cuentas."
    };
  }, [mode]);

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

  const guardClerkSubmit = (event, source) => {
    const now = Date.now();
    if (now - lastClerkFormSubmitAtRef.current < 750) {
      event.preventDefault();
      event.stopPropagation();
      if (isDevelopmentEnvironment) {
        console.warn("[clerk][dev] Suppressed duplicate Clerk form submit", { source });
      }
      return;
    }
    lastClerkFormSubmitAtRef.current = now;
    if (isDevelopmentEnvironment) {
      console.info("[clerk][dev] Clerk form submit", { source });
    }
  };

  const bootstrapClerkUser = async ({ source = "manual" } = {}) => {
    if (!isSignedIn) return null;
    setMappingError("");
    setLastBootstrapStatus(`starting:${source}`);
    if (isDevelopmentEnvironment) {
      console.info("[clerk][dev] Bootstrapping Mongo session from Clerk", {
        source,
        mode,
        email: clerkEmail,
        redirectTarget: clerkCompletePath
      });
    }

    const nextUser = await refreshUser({ authMode: "clerk" });
    if (nextUser?.onboardingRequired || onboardingRequired) {
      setLastBootstrapStatus("onboarding-required");
      if (isDevelopmentEnvironment) {
        console.info("[clerk][dev] Mongo onboarding required after Clerk auth", { source, email: clerkEmail });
      }
      navigate("/onboarding/clerk", { replace: source === "auto" });
      return nextUser;
    }
    if (nextUser?.id) {
      setLastBootstrapStatus("mapped");
      if (isDevelopmentEnvironment) {
        console.info("[clerk][dev] Mongo user resolved after Clerk auth", {
          source,
          userId: nextUser.id,
          email: nextUser.email,
          householdId: nextUser.householdId
        });
      }
      navigate("/kitchen/semana", { replace: source === "auto" });
      return nextUser;
    }

    setLastBootstrapStatus("mapping-failed");
    const bootstrapError = nextUser?.error || lastAuthError;
    const diagnosticMessage = bootstrapError
      ? `${bootstrapError.code || "AUTH_ERROR"} (${bootstrapError.status || "sin status"}): ${bootstrapError.message}`
      : "No pudimos preparar tu perfil interno. Intentalo de nuevo o revisa el panel de diagnostico.";
    setMappingError(diagnosticMessage);
    if (isDevelopmentEnvironment) {
      console.warn("[clerk][dev] Clerk session exists but Mongo mapping did not return a usable user", {
        source,
        email: clerkEmail,
        lastAuthError: bootstrapError
      });
    }
    return null;
  };

  useEffect(() => {
    if (!isLoaded) return;
    if (isDevelopmentEnvironment) {
      console.info("[clerk][dev] Clerk auth route mounted", {
        mode,
        isSignedIn,
        returnRoute: clerkCompletePath
      });
    }
  }, [isLoaded, isSignedIn, mode]);

  useEffect(() => {
    let active = true;
    const runBootstrap = async () => {
      if (!isLoaded || !isSignedIn) return;
      const nextUser = await bootstrapClerkUser({ source: "auto" });
      if (!active || !nextUser) return;
    };
    void runBootstrap();
    return () => {
      active = false;
    };
  }, [isLoaded, isSignedIn]);

  useEffect(() => {
    if (!isLoaded || !isSignedIn) return;

    if (onboardingRequired) {
      setLastBootstrapStatus("onboarding-required");
      if (isDevelopmentEnvironment) {
        console.info("[clerk][dev] Auth context marked Clerk user as needing onboarding", {
          mode,
          email: clerkEmail,
          lastAuthError
        });
      }
      navigate("/onboarding/clerk", { replace: mode === "complete" });
      return;
    }

    if (user?.id) {
      setLastBootstrapStatus("mapped");
      if (isDevelopmentEnvironment) {
        console.info("[clerk][dev] Auth context resolved Mongo user after Clerk auth", {
          mode,
          userId: user.id,
          email: user.email,
          householdId: user.householdId
        });
      }
      navigate("/kitchen/semana", { replace: mode === "complete" });
    }
  }, [clerkEmail, isLoaded, isSignedIn, lastAuthError, mode, navigate, onboardingRequired, user]);

  useEffect(() => {
    if (!signInState.isLoaded) return;
    const normalized = normalizeClerkErrors("sign-in", signInState.errors);
    if (!normalized) return;
    setLastClerkError(normalized);
    if (isDevelopmentEnvironment) {
      console.warn("[clerk][dev] Sign-in failed", normalized);
    }
  }, [signInState.isLoaded, signInState.errors]);

  useEffect(() => {
    if (!signUpState.isLoaded) return;
    const normalized = normalizeClerkErrors("sign-up", signUpState.errors);
    if (!normalized) return;
    setLastClerkError(normalized);
    if (isDevelopmentEnvironment) {
      console.warn("[clerk][dev] Sign-up failed", normalized);
    }
  }, [signUpState.isLoaded, signUpState.errors]);

  const signOut = async () => {
    clearSession();
    await clerk.signOut({ redirectUrl: "/auth/clerk" });
  };

  return (
    <div className="kitchen-app">
      <div className="kitchen-container kitchen-login-wrap">
        <Card className="kitchen-auth-card">
          <p className="kitchen-auth-kicker">{pageCopy.kicker}</p>
          <h2 className="kitchen-login-title">{pageCopy.title}</h2>
          <p className="kitchen-login-subtitle">{pageCopy.subtitle}</p>

          {mappingError ? <div className="kitchen-alert error">{mappingError}</div> : null}
          {lastClerkError ? (
            <div className="kitchen-alert error">
              <strong>Clerk {lastClerkError.source} error:</strong> {lastClerkError.code}
              <br />
              {lastClerkError.longMessage}
            </div>
          ) : null}

          {isSignedIn ? (
            <div className="kitchen-auth-card" style={{ marginTop: 16 }}>
              <p className="kitchen-auth-kicker">Sesion activa</p>
              <p className="kitchen-login-subtitle">{clerkEmail ? `Conectado como ${clerkEmail}` : "Sesion de Clerk activa."}</p>
              <div className="kitchen-actions" style={{ alignItems: "center" }}>
                <UserButton afterSignOutUrl="/auth/clerk" />
                <button type="button" className="kitchen-button" onClick={() => bootstrapClerkUser({ source: "continue" })}>
                  Continuar a Lunchfy
                </button>
                <button type="button" className="kitchen-button secondary" onClick={signOut}>
                  Cambiar cuenta
                </button>
              </div>
            </div>
          ) : null}

          {!isSignedIn && mode === "choice" ? (
            <div className="kitchen-actions" style={{ marginTop: 16 }}>
              <button type="button" className="kitchen-button" onClick={() => navigate("/auth/clerk/sign-up")}>
                Crear cuenta segura
              </button>
              <button type="button" className="kitchen-button secondary" onClick={() => navigate("/auth/clerk/sign-in")}>
                Ya tengo cuenta
              </button>
              <button type="button" className="kitchen-button secondary" onClick={() => navigate("/login")}>
                Usar email y contrasena
              </button>
            </div>
          ) : null}

          {!isSignedIn && mode === "sign-up" ? (
            <div className="kitchen-auth-card" style={{ marginTop: 16 }} onSubmitCapture={(event) => guardClerkSubmit(event, "sign-up")}>
              <SignUp
                routing="path"
                path="/auth/clerk/sign-up"
                signInUrl="/auth/clerk/sign-in"
                forceRedirectUrl={clerkCompletePath}
                fallbackRedirectUrl={clerkCompletePath}
                signInForceRedirectUrl={clerkCompletePath}
                signInFallbackRedirectUrl={clerkCompletePath}
              />
            </div>
          ) : null}

          {!isSignedIn && (mode === "sign-in" || mode === "reset-password") ? (
            <div className="kitchen-auth-card" style={{ marginTop: 16 }} onSubmitCapture={(event) => guardClerkSubmit(event, "sign-in")}>
              <SignIn
                routing="path"
                path={mode === "reset-password" ? "/auth/clerk/reset-password" : "/auth/clerk/sign-in"}
                signUpUrl="/auth/clerk/sign-up"
                forceRedirectUrl={clerkCompletePath}
                fallbackRedirectUrl={clerkCompletePath}
                signUpForceRedirectUrl={clerkCompletePath}
                signUpFallbackRedirectUrl={clerkCompletePath}
              />
            </div>
          ) : null}

          {!isSignedIn && mode === "complete" ? (
            <div className="kitchen-alert info" style={{ marginTop: 16 }}>
              Si acabas de verificar tu email, espera unos segundos. Si no continua automaticamente, vuelve a iniciar sesion.
              <div className="kitchen-actions" style={{ marginTop: 12 }}>
                <button type="button" className="kitchen-button" onClick={() => navigate("/auth/clerk/sign-in")}>
                  Iniciar sesion
                </button>
                <button type="button" className="kitchen-button secondary" onClick={() => navigate("/auth/clerk/sign-up")}>
                  Crear cuenta
                </button>
              </div>
            </div>
          ) : null}

          {isDevelopmentEnvironment ? (
            <div className="kitchen-auth-card" style={{ marginTop: 16 }}>
              <p className="kitchen-auth-kicker">DEV debug</p>
              <div className="kitchen-alert info">
                <strong>Clerk auth state:</strong> {isLoaded ? (isSignedIn ? "signed in" : "signed out") : "loading"}
                <br />
                <strong>Clerk route:</strong> {mode}
                <br />
                <strong>Clerk identity:</strong> {isSignedIn ? clerkIdentity : "none"}
                <br />
                <strong>Mongo mapping state:</strong>{" "}
                {loading ? "resolving" : user?.email ? `mapped to ${user.email}` : mappingError ? "mapping failed" : "not resolved"}
                <br />
                <strong>Onboarding state:</strong> {onboardingRequired ? "required" : user?.id ? "complete" : "unknown"}
                <br />
                <strong>Last backend auth error:</strong>{" "}
                {lastAuthError ? `${lastAuthError.code} / ${lastAuthError.status}: ${lastAuthError.message}` : "none"}
                <br />
                <strong>Last bootstrap status:</strong> {lastBootstrapStatus}
                <br />
                <strong>Last Clerk error:</strong>{" "}
                {lastClerkError ? `${lastClerkError.source} / ${lastClerkError.code}: ${lastClerkError.longMessage}` : "none"}
              </div>
              {lastClerkError ? (
                <pre className="kitchen-alert error" style={{ whiteSpace: "pre-wrap", overflowX: "auto" }}>
                  {stringifyDebugValue(lastClerkError.rawErrors || lastClerkError.raw)}
                </pre>
              ) : null}
            </div>
          ) : null}
        </Card>
      </div>
    </div>
  );
}
