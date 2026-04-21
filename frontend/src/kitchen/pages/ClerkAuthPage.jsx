import React, { useEffect, useMemo, useRef, useState } from "react";
import { UserButton, useAuth as useClerkAuth, useClerk, useSignIn, useSignUp, useUser } from "@clerk/react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useAuth } from "../auth";
import { AppLoadingScreen } from "../components/WeekPageSkeleton.jsx";
import Card from "../components/ui/Card";

const clerkPublishableKey = import.meta.env.VITE_CLERK_PUBLISHABLE_KEY;
const isDevelopmentEnvironment = import.meta.env.VITE_APP_ENV === "development" || import.meta.env.DEV;
const clerkCompletePath = "/auth/clerk/complete";
const clerkPostAuthPath = "/kitchen/semana";
const pendingInviteTokenKey = "clerk_onboarding_invite_token";
const pendingInviteCodeKey = "clerk_onboarding_invite_code";

function normalizeClerkError(source, error) {
  const rawError = error?.errors?.[0] || error?.raw?.[0] || error;
  const code = rawError?.code || error?.code || "CLERK_ERROR";
  const longMessage =
    rawError?.longMessage
    || rawError?.long_message
    || rawError?.message
    || error?.message
    || "Clerk sign-in/sign-up failed.";

  return {
    source,
    code,
    longMessage,
    raw: error
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

function isUnexpectedSecondFactorStatus(status) {
  return status === "needs_second_factor" || status === "needs_client_trust";
}

function buildSecondFactorMessage(status) {
  if (status === "needs_client_trust") {
    return "Clerk esta solicitando Client Trust para este inicio de sesion. Si quieres login solo con contrasena, desactiva Client Trust en Clerk Dashboard.";
  }
  if (status === "needs_second_factor") {
    return "Clerk esta solicitando un segundo factor para este inicio de sesion. Si no quieres codigos en login normal, revisa MFA y estrategias de sign-in en Clerk Dashboard.";
  }
  return "Clerk esta solicitando un segundo factor no esperado para este login.";
}

function AuthField({ id, label, type = "text", value, onChange, placeholder, autoComplete, disabled = false }) {
  return (
    <label className="kitchen-ui-input-group" htmlFor={id}>
      <span className="kitchen-login-label">{label}</span>
      <div className="kitchen-login-input-wrap">
        <input
          id={id}
          className="kitchen-ui-input kitchen-login-input"
          type={type}
          value={value}
          onChange={onChange}
          placeholder={placeholder}
          autoComplete={autoComplete}
          disabled={disabled}
          required
        />
      </div>
    </label>
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

  const signIn = signInState?.signIn;
  const signUp = signUpState?.signUp;
  const signInLoaded = Boolean(signIn);
  const signUpLoaded = Boolean(signUp);

  const [signInForm, setSignInForm] = useState({ email: "", password: "" });
  const [signUpForm, setSignUpForm] = useState({ email: "", password: "" });
  const [verificationCode, setVerificationCode] = useState("");
  const [isAwaitingSignUpVerification, setIsAwaitingSignUpVerification] = useState(false);
  const [resetPasswordForm, setResetPasswordForm] = useState({ email: "", code: "", password: "" });
  const [resetPasswordStep, setResetPasswordStep] = useState("request");
  const [finalBootstrapError, setFinalBootstrapError] = useState("");
  const [lastClerkError, setLastClerkError] = useState(null);
  const [lastBootstrapStatus, setLastBootstrapStatus] = useState("waiting");
  const [showDebug, setShowDebug] = useState(false);
  const finalBootstrapErrorTimerRef = useRef(null);
  const actionLocksRef = useRef(new Set());
  const actionCountersRef = useRef({
    signUpStarted: 0,
    signUpCreateSent: 0,
    signUpVerificationPrepared: 0,
    signUpVerificationResent: 0,
    signUpVerificationSubmitted: 0,
    signInStarted: 0,
    signInPasswordSent: 0,
    resetPasswordStarted: 0,
    resetPasswordCodeSent: 0,
    resetPasswordCodeVerified: 0,
    resetPasswordPasswordSubmitted: 0,
    bootstrapStarted: 0
  });

  const clerkEmail = clerkUser?.primaryEmailAddress?.emailAddress || clerkUser?.emailAddresses?.[0]?.emailAddress || "";
  const clerkIdentity = clerkEmail || clerkUser?.username || clerkUser?.id || "Unknown Clerk user";
  const isBusy = actionLocksRef.current.size > 0;

  const pageCopy = useMemo(() => {
    if (mode === "sign-up") {
      return {
        kicker: "Cuenta segura",
        title: "Crea tu cuenta",
        subtitle: "Crea tu acceso con email y contrasena. Solo el registro nuevo pide verificar el email."
      };
    }
    if (mode === "sign-in") {
      return {
        kicker: "Cuenta segura",
        title: "Entra a tu cocina",
        subtitle: "Inicia sesion con email y contrasena. El login normal no deberia pedir codigo de verificacion."
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

  const clearFinalBootstrapError = () => {
    if (finalBootstrapErrorTimerRef.current) {
      window.clearTimeout(finalBootstrapErrorTimerRef.current);
      finalBootstrapErrorTimerRef.current = null;
    }
    setFinalBootstrapError("");
  };

  const scheduleFinalBootstrapError = (message) => {
    if (finalBootstrapErrorTimerRef.current) {
      window.clearTimeout(finalBootstrapErrorTimerRef.current);
    }
    finalBootstrapErrorTimerRef.current = window.setTimeout(() => {
      setFinalBootstrapError(message);
    }, 1200);
  };

  const logDevAction = (label, details = {}) => {
    if (!isDevelopmentEnvironment) return;
    console.info(`[clerk][dev] ${label}`, details);
  };

  const runLockedAction = async (key, action) => {
    if (actionLocksRef.current.has(key)) {
      logDevAction("Suppressed duplicate action", { key });
      return null;
    }

    actionLocksRef.current.add(key);
    try {
      return await action();
    } finally {
      actionLocksRef.current.delete(key);
    }
  };

  const setNormalizedClerkError = (source, error) => {
    const normalized = normalizeClerkError(source, error);
    setLastClerkError(normalized);
    if (isDevelopmentEnvironment) {
      console.warn(`[clerk][dev] ${source} failed`, normalized);
    }
    return normalized;
  };

  const bootstrapClerkUser = async ({ source = "manual" } = {}) => {
    if (!isSignedIn) return null;
    clearFinalBootstrapError();
    setLastBootstrapStatus(`starting:${source}`);
    actionCountersRef.current.bootstrapStarted += 1;
    logDevAction("Bootstrap started", {
      source,
      bootstrapCount: actionCountersRef.current.bootstrapStarted,
      email: clerkEmail,
      redirectTarget: clerkPostAuthPath
    });

    const nextUser = await refreshUser({ authMode: "clerk" });
    if (nextUser?.onboardingRequired || onboardingRequired) {
      setLastBootstrapStatus("onboarding-required");
      clearFinalBootstrapError();
      logDevAction("Bootstrap resolved to onboarding", { source, email: clerkEmail });
      navigate("/onboarding/clerk", { replace: source === "auto" });
      return nextUser;
    }
    if (nextUser?.id) {
      setLastBootstrapStatus("mapped");
      clearFinalBootstrapError();
      logDevAction("Bootstrap resolved to app user", {
        source,
        userId: nextUser.id,
        email: nextUser.email,
        householdId: nextUser.householdId
      });
      navigate(clerkPostAuthPath, { replace: source === "auto" });
      return nextUser;
    }

    setLastBootstrapStatus("mapping-failed");
    const bootstrapError = nextUser?.error || lastAuthError;
    const diagnosticMessage = bootstrapError
      ? `${bootstrapError.code || "AUTH_ERROR"} (${bootstrapError.status || "sin status"}): ${bootstrapError.message}`
      : "No pudimos preparar tu perfil interno. Intentalo de nuevo o revisa el panel de diagnostico.";
    scheduleFinalBootstrapError(diagnosticMessage);
    logDevAction("Bootstrap failed", {
      source,
      email: clerkEmail,
      error: bootstrapError || null
    });
    return null;
  };

  const handlePasswordSignIn = async (event) => {
    event.preventDefault();
    clearFinalBootstrapError();
    setLastClerkError(null);

    await runLockedAction("sign-in-password", async () => {
      if (!signInLoaded) return;
      actionCountersRef.current.signInStarted += 1;
      logDevAction("Sign-in started", {
        signInStarted: actionCountersRef.current.signInStarted,
        identifier: signInForm.email
      });

      try {
        actionCountersRef.current.signInPasswordSent += 1;
        const safeIdentifier = signInForm.email.trim();
        const safePassword = String(signInForm.password || "");
        logDevAction("Password sign-in request sent", {
          signInPasswordSent: actionCountersRef.current.signInPasswordSent,
          identifier: signInForm.email
        });
        logDevAction("Password sign-in payload", {
          strategy: "password",
          emailPresent: Boolean(safeIdentifier),
          passwordPresent: Boolean(safePassword),
          passwordLengthGreaterThanZero: safePassword.length > 0
        });

        const result = await signIn.password({
          identifier: safeIdentifier,
          password: safePassword
        });

        if (result.error) {
          throw result.error;
        }

        if (signIn.status === "complete") {
          await signIn.finalize();
          return;
        }

        if (isUnexpectedSecondFactorStatus(signIn.status)) {
          throw {
            errors: [{
              code: signIn.status,
              longMessage: buildSecondFactorMessage(signIn.status)
            }],
            raw: signIn
          };
        }

        throw {
          errors: [{
            code: signIn.status || "UNSUPPORTED_SIGN_IN_STATUS",
            longMessage: "Clerk devolvio un estado de login no esperado para el flujo de contrasena."
          }],
          raw: signIn
        };
      } catch (error) {
        setNormalizedClerkError("sign-in", error);
      }
    });
  };

  const handleSignUpStart = async (event) => {
    event.preventDefault();
    clearFinalBootstrapError();
    setLastClerkError(null);

    await runLockedAction("sign-up-start", async () => {
      if (!signUpLoaded) return;
      actionCountersRef.current.signUpStarted += 1;
      logDevAction("Sign-up started", {
        signUpStarted: actionCountersRef.current.signUpStarted,
        email: signUpForm.email
      });

      try {
        actionCountersRef.current.signUpCreateSent += 1;
        logDevAction("Sign-up request sent", {
          signUpCreateSent: actionCountersRef.current.signUpCreateSent,
          email: signUpForm.email
        });

        await signUp.create({
          emailAddress: signUpForm.email.trim(),
          password: signUpForm.password
        });

        actionCountersRef.current.signUpVerificationPrepared += 1;
        logDevAction("Sign-up verification preparation sent", {
          signUpVerificationPrepared: actionCountersRef.current.signUpVerificationPrepared,
          email: signUpForm.email
        });

        logDevAction("Sign-up verification strategy", {
          strategy: "email_code",
          emailPresent: Boolean(signUpForm.email.trim())
        });

        const verificationResult = await signUp.prepareEmailAddressVerification({
          strategy: "email_code"
        });
        if (verificationResult.error) {
          throw verificationResult.error;
        }
        setIsAwaitingSignUpVerification(true);
      } catch (error) {
        setNormalizedClerkError("sign-up", error);
      }
    });
  };

  const handleSignUpVerification = async (event) => {
    event.preventDefault();
    setLastClerkError(null);

    await runLockedAction("sign-up-verify", async () => {
      if (!signUpLoaded) return;
      try {
        actionCountersRef.current.signUpVerificationSubmitted += 1;
        logDevAction("Sign-up verification submitted", {
          signUpVerificationSubmitted: actionCountersRef.current.signUpVerificationSubmitted,
          email: signUpForm.email
        });

        const result = await signUp.attemptEmailAddressVerification({
          code: verificationCode.trim()
        });

        if (result.error) {
          throw result.error;
        }

        if (signUp.status === "complete") {
          await signUp.finalize();
          return;
        }

        throw {
          errors: [{
            code: signUp.status || "SIGN_UP_VERIFICATION_INCOMPLETE",
            longMessage: "Clerk no pudo completar la verificacion del registro."
          }],
          raw: signUp
        };
      } catch (error) {
        setNormalizedClerkError("sign-up", error);
      }
    });
  };

  const handleResendVerification = async () => {
    setLastClerkError(null);

    await runLockedAction("sign-up-resend", async () => {
      if (!signUpLoaded) return;
      try {
        actionCountersRef.current.signUpVerificationResent += 1;
        logDevAction("Sign-up verification resend sent", {
          signUpVerificationResent: actionCountersRef.current.signUpVerificationResent,
          email: signUpForm.email
        });
        logDevAction("Sign-up verification strategy", {
          strategy: "email_code",
          emailPresent: Boolean(signUpForm.email.trim())
        });
        const resendResult = await signUp.prepareEmailAddressVerification({
          strategy: "email_code"
        });
        if (resendResult.error) {
          throw resendResult.error;
        }
      } catch (error) {
        setNormalizedClerkError("sign-up", error);
      }
    });
  };

  const handleResetPasswordStart = async (event) => {
    event.preventDefault();
    setLastClerkError(null);
    clearFinalBootstrapError();

    await runLockedAction("reset-password-start", async () => {
      if (!signInLoaded) return;
      try {
        actionCountersRef.current.resetPasswordStarted += 1;
        logDevAction("Forgot-password flow entered", {
          resetPasswordStarted: actionCountersRef.current.resetPasswordStarted,
          identifier: resetPasswordForm.email
        });

        const createResult = await signIn.create({
          strategy: "reset_password_email_code",
          identifier: resetPasswordForm.email.trim()
        });
        if (createResult.error) {
          throw createResult.error;
        }

        actionCountersRef.current.resetPasswordCodeSent += 1;
        logDevAction("Reset-password code sent", {
          resetPasswordCodeSent: actionCountersRef.current.resetPasswordCodeSent,
          identifier: resetPasswordForm.email
        });

        const sendCodeResult = await signIn.resetPasswordEmailCode.sendCode();
        if (sendCodeResult.error) {
          throw sendCodeResult.error;
        }

        setResetPasswordStep("verify");
      } catch (error) {
        setNormalizedClerkError("reset-password", error);
      }
    });
  };

  const handleResetPasswordVerifyCode = async (event) => {
    event.preventDefault();
    setLastClerkError(null);

    await runLockedAction("reset-password-verify", async () => {
      if (!signInLoaded) return;
      try {
        const verifyResult = await signIn.resetPasswordEmailCode.verifyCode({
          code: resetPasswordForm.code.trim()
        });
        if (verifyResult.error) {
          throw verifyResult.error;
        }

        actionCountersRef.current.resetPasswordCodeVerified += 1;
        logDevAction("Reset-password code verified", {
          resetPasswordCodeVerified: actionCountersRef.current.resetPasswordCodeVerified,
          identifier: resetPasswordForm.email
        });

        setResetPasswordStep("new-password");
      } catch (error) {
        setNormalizedClerkError("reset-password", error);
      }
    });
  };

  const handleResetPasswordSubmitNewPassword = async (event) => {
    event.preventDefault();
    setLastClerkError(null);

    await runLockedAction("reset-password-submit", async () => {
      if (!signInLoaded) return;
      try {
        const submitPasswordResult = await signIn.resetPasswordEmailCode.submitPassword({
          password: resetPasswordForm.password
        });
        if (submitPasswordResult.error) {
          throw submitPasswordResult.error;
        }

        actionCountersRef.current.resetPasswordPasswordSubmitted += 1;
        logDevAction("Reset-password submit succeeded", {
          resetPasswordPasswordSubmitted: actionCountersRef.current.resetPasswordPasswordSubmitted,
          identifier: resetPasswordForm.email
        });

        if (signIn.status === "complete") {
          await signIn.finalize();
          return;
        }

        throw {
          errors: [{
            code: signIn.status || "RESET_PASSWORD_INCOMPLETE",
            longMessage: "Clerk no pudo completar el cambio de contrasena."
          }],
          raw: signIn
        };
      } catch (error) {
        logDevAction("Reset-password submit failed", { identifier: resetPasswordForm.email });
        setNormalizedClerkError("reset-password", error);
      }
    });
  };

  useEffect(() => {
    if (!isLoaded) return;
    logDevAction("Clerk auth route mounted", {
      mode,
      isSignedIn,
      returnRoute: clerkCompletePath
    });
  }, [isLoaded, isSignedIn, mode]);

  useEffect(() => {
    if (mode !== "reset-password") return;
    logDevAction("Forgot-password route entered", {
      resetPasswordStep
    });
  }, [mode, resetPasswordStep]);

  useEffect(() => {
    if (!isLoaded || !isSignedIn) return;

    if (onboardingRequired) {
      setLastBootstrapStatus("onboarding-required");
      clearFinalBootstrapError();
      logDevAction("Auth context resolved to onboarding", {
        mode,
        email: clerkEmail,
        lastAuthError
      });
      navigate("/onboarding/clerk", { replace: mode === "complete" });
      return;
    }

    if (user?.id) {
      setLastBootstrapStatus("mapped");
      clearFinalBootstrapError();
      logDevAction("Auth context resolved to app user", {
        mode,
        userId: user.id,
        email: user.email,
        householdId: user.householdId
      });
      navigate(clerkPostAuthPath, { replace: mode === "complete" });
    }
  }, [clerkEmail, isLoaded, isSignedIn, lastAuthError, mode, navigate, onboardingRequired, user]);

  useEffect(() => {
    if (!isLoaded || !isSignedIn || loading || user?.id || onboardingRequired || !lastAuthError) return;
    const diagnosticMessage = `${lastAuthError.code || "AUTH_ERROR"} (${lastAuthError.status || "sin status"}): ${lastAuthError.message}`;
    setLastBootstrapStatus("mapping-failed");
    scheduleFinalBootstrapError(diagnosticMessage);
  }, [isLoaded, isSignedIn, lastAuthError, loading, onboardingRequired, user?.id]);

  useEffect(() => {
    return () => {
      if (finalBootstrapErrorTimerRef.current) {
        window.clearTimeout(finalBootstrapErrorTimerRef.current);
      }
    };
  }, []);

  const signOut = async () => {
    clearSession();
    await clerk.signOut({ redirectUrl: "/auth/clerk" });
  };

  const isResolvingClerkHandoff = isSignedIn && !user?.id && !onboardingRequired && !finalBootstrapError;
  if (isLoaded && (mode === "complete" || isResolvingClerkHandoff) && isResolvingClerkHandoff) {
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
        <Card className="kitchen-auth-card">
          <p className="kitchen-auth-kicker">{pageCopy.kicker}</p>
          <h2 className="kitchen-login-title">{pageCopy.title}</h2>
          <p className="kitchen-login-subtitle">{pageCopy.subtitle}</p>

          {finalBootstrapError ? <div className="kitchen-alert error">{finalBootstrapError}</div> : null}
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

          {!isSignedIn && mode === "sign-up" && !isAwaitingSignUpVerification ? (
            <form className="kitchen-login-form" onSubmit={handleSignUpStart}>
              <div className="kitchen-login-fields">
                <AuthField
                  id="clerk-signup-email"
                  label="CORREO ELECTRONICO"
                  type="email"
                  value={signUpForm.email}
                  onChange={(event) => setSignUpForm((current) => ({ ...current, email: event.target.value }))}
                  placeholder="tunombre@email.com"
                  autoComplete="email"
                  disabled={!signUpLoaded || isBusy}
                />
                <AuthField
                  id="clerk-signup-password"
                  label="CONTRASENA"
                  type="password"
                  value={signUpForm.password}
                  onChange={(event) => setSignUpForm((current) => ({ ...current, password: event.target.value }))}
                  placeholder="Minimo 8 caracteres"
                  autoComplete="new-password"
                  disabled={!signUpLoaded || isBusy}
                />
              </div>
              <button type="submit" className="kitchen-ui-button kitchen-login-submit" disabled={!signUpLoaded || isBusy}>
                {isBusy ? "Preparando verificacion..." : "Crear cuenta ->"}
              </button>
              <p className="kitchen-login-footer">
                Ya tienes cuenta?{" "}
                <button type="button" className="kitchen-login-link" onClick={() => navigate("/auth/clerk/sign-in")}>
                  Inicia sesion
                </button>
              </p>
            </form>
          ) : null}

          {!isSignedIn && mode === "sign-up" && isAwaitingSignUpVerification ? (
            <form className="kitchen-login-form" onSubmit={handleSignUpVerification}>
              <div className="kitchen-alert info">
                Hemos enviado un unico codigo de verificacion a <strong>{signUpForm.email}</strong>. Introducelo para completar el registro.
              </div>
              <div className="kitchen-login-fields">
                <AuthField
                  id="clerk-signup-code"
                  label="CODIGO DE VERIFICACION"
                  value={verificationCode}
                  onChange={(event) => setVerificationCode(event.target.value)}
                  placeholder="123456"
                  autoComplete="one-time-code"
                  disabled={!signUpLoaded || isBusy}
                />
              </div>
              <div className="kitchen-actions">
                <button type="submit" className="kitchen-ui-button kitchen-login-submit" disabled={!signUpLoaded || isBusy}>
                  {isBusy ? "Verificando..." : "Verificar email ->"}
                </button>
                <button type="button" className="kitchen-button secondary" onClick={handleResendVerification} disabled={!signUpLoaded || isBusy}>
                  Reenviar codigo
                </button>
                <button
                  type="button"
                  className="kitchen-button secondary"
                  onClick={() => {
                    setIsAwaitingSignUpVerification(false);
                    setVerificationCode("");
                    setLastClerkError(null);
                  }}
                  disabled={isBusy}
                >
                  Volver
                </button>
              </div>
            </form>
          ) : null}

          {!isSignedIn && mode === "sign-in" ? (
            <form className="kitchen-login-form" onSubmit={handlePasswordSignIn}>
              <div className="kitchen-login-fields">
                <AuthField
                  id="clerk-signin-email"
                  label="CORREO ELECTRONICO"
                  type="email"
                  value={signInForm.email}
                  onChange={(event) => setSignInForm((current) => ({ ...current, email: event.target.value }))}
                  placeholder="tunombre@email.com"
                  autoComplete="email"
                  disabled={!isLoaded || !signInLoaded || isBusy}
                />
                <AuthField
                  id="clerk-signin-password"
                  label="CONTRASENA"
                  type="password"
                  value={signInForm.password}
                  onChange={(event) => setSignInForm((current) => ({ ...current, password: event.target.value }))}
                  placeholder="Tu contrasena"
                  autoComplete="current-password"
                  disabled={!isLoaded || !signInLoaded || isBusy}
                />
              </div>
              <button type="submit" className="kitchen-ui-button kitchen-login-submit" disabled={!isLoaded || !signInLoaded || isBusy}>
                {isBusy ? "Entrando..." : "Iniciar sesion ->"}
              </button>
              <div className="kitchen-login-forgot-row">
                <button type="button" className="kitchen-login-link" onClick={() => navigate("/auth/clerk/reset-password")}>
                  Olvidaste tu contrasena?
                </button>
                <button type="button" className="kitchen-login-link" onClick={() => navigate("/auth/clerk/sign-up")}>
                  Crear cuenta
                </button>
              </div>
            </form>
          ) : null}

          {!isSignedIn && mode === "reset-password" ? (
            <form
              className="kitchen-login-form"
              onSubmit={
                resetPasswordStep === "request"
                  ? handleResetPasswordStart
                  : resetPasswordStep === "verify"
                    ? handleResetPasswordVerifyCode
                    : handleResetPasswordSubmitNewPassword
              }
            >
              {resetPasswordStep === "request" ? (
                <>
                  <div className="kitchen-alert info">
                    Introduce tu email y te enviaremos un codigo de recuperacion para restablecer tu contrasena.
                  </div>
                  <div className="kitchen-login-fields">
                    <AuthField
                      id="clerk-reset-email"
                      label="CORREO ELECTRONICO"
                      type="email"
                      value={resetPasswordForm.email}
                      onChange={(event) => setResetPasswordForm((current) => ({ ...current, email: event.target.value }))}
                      placeholder="tunombre@email.com"
                      autoComplete="email"
                      disabled={!isLoaded || !signInLoaded || isBusy}
                    />
                  </div>
                  <button type="submit" className="kitchen-ui-button kitchen-login-submit" disabled={!isLoaded || !signInLoaded || isBusy}>
                    {isBusy ? "Enviando codigo..." : "Enviar codigo de recuperacion ->"}
                  </button>
                </>
              ) : null}

              {resetPasswordStep === "verify" ? (
                <>
                  <div className="kitchen-alert info">
                    Hemos enviado un codigo de recuperacion a <strong>{resetPasswordForm.email}</strong>. Introducelo para continuar.
                  </div>
                  <div className="kitchen-login-fields">
                    <AuthField
                      id="clerk-reset-code"
                      label="CODIGO DE RECUPERACION"
                      value={resetPasswordForm.code}
                      onChange={(event) => setResetPasswordForm((current) => ({ ...current, code: event.target.value }))}
                      placeholder="123456"
                      autoComplete="one-time-code"
                      disabled={!isLoaded || !signInLoaded || isBusy}
                    />
                  </div>
                  <div className="kitchen-actions">
                    <button type="submit" className="kitchen-ui-button kitchen-login-submit" disabled={!isLoaded || !signInLoaded || isBusy}>
                      {isBusy ? "Verificando..." : "Verificar codigo ->"}
                    </button>
                    <button type="button" className="kitchen-button secondary" onClick={handleResetPasswordStart} disabled={!isLoaded || !signInLoaded || isBusy}>
                      Reenviar codigo
                    </button>
                  </div>
                </>
              ) : null}

              {resetPasswordStep === "new-password" ? (
                <>
                  <div className="kitchen-alert info">
                    Codigo validado. Ahora define tu nueva contrasena.
                  </div>
                  <div className="kitchen-login-fields">
                    <AuthField
                      id="clerk-reset-password"
                      label="NUEVA CONTRASENA"
                      type="password"
                      value={resetPasswordForm.password}
                      onChange={(event) => setResetPasswordForm((current) => ({ ...current, password: event.target.value }))}
                      placeholder="Nueva contrasena"
                      autoComplete="new-password"
                      disabled={!isLoaded || !signInLoaded || isBusy}
                    />
                  </div>
                  <button type="submit" className="kitchen-ui-button kitchen-login-submit" disabled={!isLoaded || !signInLoaded || isBusy}>
                    {isBusy ? "Guardando..." : "Guardar nueva contrasena ->"}
                  </button>
                </>
              ) : null}

              <div className="kitchen-login-forgot-row">
                <button type="button" className="kitchen-login-link" onClick={() => navigate("/auth/clerk/sign-in")}>
                  Volver al login
                </button>
              </div>
            </form>
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
            <button type="button" className="kitchen-login-link" onClick={() => setShowDebug((next) => !next)}>
              {showDebug ? "Ocultar diagnostico DEV" : "Mostrar diagnostico DEV"}
            </button>
          ) : null}

          {isDevelopmentEnvironment && showDebug ? (
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
                {loading ? "resolving" : user?.email ? `mapped to ${user.email}` : finalBootstrapError ? "mapping failed" : "not resolved"}
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
                <br />
                <strong>Action counters:</strong>{" "}
                {JSON.stringify(actionCountersRef.current)}
              </div>
              {lastClerkError ? (
                <pre className="kitchen-alert error" style={{ whiteSpace: "pre-wrap", overflowX: "auto" }}>
                  {stringifyDebugValue(lastClerkError.raw)}
                </pre>
              ) : null}
            </div>
          ) : null}
        </Card>
      </div>
    </div>
  );
}
