import React, { useEffect, useMemo, useRef, useState } from "react";
import { useSignUp, useUser } from "@clerk/react";
import { useNavigate, useSearchParams } from "react-router-dom";
import Card from "../components/ui/Card";
import { apiRequest, buildApiUrl } from "../api.js";
import { useAuth } from "../auth";
import { isUserLimitReachedError } from "../subscription.js";

const pendingInviteTokenKey = "clerk_onboarding_invite_token";
const pendingInviteCodeKey = "clerk_onboarding_invite_code";
const BASIC_PLAN = "basic";
const clerkSignInPath = "/auth/clerk/sign-in";

const STEP_LABELS = [
  { number: 1, label: "Cuenta", shortLabel: "Cuenta" },
  { number: 2, label: "Hogar", shortLabel: "Hogar" },
  { number: 3, label: "Perfil", shortLabel: "Perfil" },
  { number: 4, label: "Preferencias", shortLabel: "Prefs." }
];

const PLAN_OPTIONS = [
  {
    value: "basic",
    title: "Basic",
    description: "Perfecto para empezar tu hogar y organizar comidas en comun.",
    selectable: true
  },
  {
    value: "pro",
    title: "Pro",
    description: "Mas capacidad y funciones avanzadas para hogares activos.",
    selectable: false
  },
  {
    value: "premium",
    title: "Premium",
    description: "La experiencia completa para hogares con necesidades avanzadas.",
    selectable: false
  }
];

function normalizeInviteCode(value) {
  return String(value || "").replace(/\D/g, "").slice(0, 6);
}

function isValidEmailAddress(value) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(value || "").trim());
}

function normalizeClerkError(error, fallbackMessage) {
  const clerkMessage = error?.errors?.[0]?.longMessage || error?.errors?.[0]?.message;
  return clerkMessage || error?.message || fallbackMessage;
}

function isCaptchaInitializationError(error) {
  const message = String(error?.errors?.[0]?.longMessage || error?.errors?.[0]?.message || error?.message || "").toLowerCase();
  return message.includes("captcha");
}

function buildDefaultHouseholdName(name) {
  const safeName = String(name || "").trim();
  return safeName ? `${safeName} - Hogar` : "Mi hogar";
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

export default function ClerkOnboardingPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { isLoaded, signUp, setActive } = useSignUp();
  const { user: clerkUser } = useUser();
  const { clerkSignedIn, user, setUser, setOnboardingRequired, refreshUser } = useAuth();

  const [authPhase, setAuthPhase] = useState("credentials");
  const [configStep, setConfigStep] = useState(2);
  const [form, setForm] = useState({
    email: "",
    password: "",
    confirmPassword: "",
    verificationCode: "",
    householdMode: "",
    plan: BASIC_PLAN,
    inviteCode: "",
    displayName: "",
    householdName: "",
    dinnersEnabled: false,
    avoidRepeatsEnabled: false,
    avoidRepeatsWeeks: 1,
    active: true,
    canCook: true,
    dinnerActive: true,
    dinnerCanCook: true,
    inviteToken: ""
  });
  const [error, setError] = useState("");
  const [authLoading, setAuthLoading] = useState(false);
  const [verificationLoading, setVerificationLoading] = useState(false);
  const [emailCheck, setEmailCheck] = useState({
    state: "idle",
    email: "",
    message: ""
  });
  const [codeValidationLoading, setCodeValidationLoading] = useState(false);
  const [finalLoading, setFinalLoading] = useState(false);
  const [validatedHousehold, setValidatedHousehold] = useState(null);
  const [validatedInviteCode, setValidatedInviteCode] = useState("");
  const [inviteDetails, setInviteDetails] = useState(null);
  const [inviteDetailsLoaded, setInviteDetailsLoaded] = useState(false);
  const [devSlowClerkLoad, setDevSlowClerkLoad] = useState(false);

  const emailCheckTimerRef = useRef(null);
  const createSubmitLockRef = useRef(false);
  const verifySubmitLockRef = useRef(false);
  const finalSubmitStartedRef = useRef(false);

  const clerkPublishableKeyPresent = Boolean(import.meta.env.VITE_CLERK_PUBLISHABLE_KEY);
  const normalizedEmail = String(form.email || "").trim().toLowerCase();
  const normalizedInviteCode = useMemo(() => normalizeInviteCode(form.inviteCode), [form.inviteCode]);
  const emailIsValid = isValidEmailAddress(normalizedEmail);
  const passwordHasMinimumLength = String(form.password || "").length >= 8;
  const passwordsMatch = Boolean(form.password) && Boolean(form.confirmPassword) && form.password === form.confirmPassword;
  const isInviteFlow = Boolean(form.inviteToken);
  const isJoinMode = form.householdMode === "join";
  const isCreateMode = form.householdMode === "create";
  const inviteSearch = useMemo(() => ({
    inviteToken: form.inviteToken || undefined,
    inviteCode: normalizedInviteCode || undefined
  }), [form.inviteToken, normalizedInviteCode]);
  const signInRoute = useMemo(() => buildRouteWithSearch(clerkSignInPath, inviteSearch), [inviteSearch]);
  const visualStep = authPhase === "config" ? configStep : 1;

  const disabledReason = useMemo(() => {
    if (authPhase !== "credentials") return null;
    if (!isLoaded) return "Clerk is still loading";
    if (!signUp) return "Clerk signUp object is unavailable";
    if (!emailIsValid) return normalizedEmail ? "Invalid email" : "Email is empty";
    if (emailCheck.state === "checking" && emailCheck.email === normalizedEmail) return "Checking email";
    if (emailCheck.state === "exists" && emailCheck.email === normalizedEmail) return "Email already exists";
    if (!form.password) return "Password is empty";
    if (!passwordHasMinimumLength) return "Invalid password";
    if (!form.confirmPassword) return "Repeat password is empty";
    if (!passwordsMatch) return "Passwords do not match";
    if (authLoading) return "Submitting";
    return null;
  }, [
    authLoading,
    authPhase,
    emailCheck.email,
    emailCheck.state,
    emailIsValid,
    form.confirmPassword,
    form.password,
    isLoaded,
    normalizedEmail,
    passwordHasMinimumLength,
    passwordsMatch,
    signUp
  ]);

  const step1Errors = useMemo(() => {
    const nextErrors = {};
    if (normalizedEmail && !emailIsValid) {
      nextErrors.email = "Introduce un email valido.";
    } else if (emailCheck.state === "exists" && emailCheck.email === normalizedEmail) {
      nextErrors.email = "Este email ya esta registrado. Inicia sesion o usa otro email.";
    } else if (emailCheck.state === "error" && emailCheck.email === normalizedEmail) {
      nextErrors.email = "No pudimos validar este email todavia. Intentalo de nuevo.";
    }
    if (form.password && !passwordHasMinimumLength) {
      nextErrors.password = "La contrasena debe tener al menos 8 caracteres.";
    }
    if (form.confirmPassword && form.password !== form.confirmPassword) {
      nextErrors.confirmPassword = "Las contrasenas no coinciden.";
    }
    return nextErrors;
  }, [emailCheck.email, emailCheck.state, emailIsValid, form.confirmPassword, form.password, normalizedEmail, passwordHasMinimumLength]);

  useEffect(() => {
    if (user?.id && !user?.onboardingRequired) {
      navigate("/kitchen/semana", { replace: true });
    }
  }, [navigate, user]);

  useEffect(() => {
    const inviteToken = String(
      searchParams.get("inviteToken")
      || searchParams.get("token")
      || searchParams.get("invite")
      || window.sessionStorage.getItem(pendingInviteTokenKey)
      || ""
    ).trim();
    const inviteCode = normalizeInviteCode(
      searchParams.get("inviteCode")
      || searchParams.get("code")
      || searchParams.get("invite")
      || window.sessionStorage.getItem(pendingInviteCodeKey)
      || ""
    );

    setForm((prev) => ({
      ...prev,
      email: prev.email || inviteDetails?.recipientEmail || "",
      inviteToken: prev.inviteToken || inviteToken,
      inviteCode: prev.inviteCode || inviteCode,
      householdMode: prev.householdMode || (inviteToken || inviteCode ? "join" : prev.householdMode)
    }));

    if (inviteToken) {
      window.sessionStorage.setItem(pendingInviteTokenKey, inviteToken);
    }
    if (inviteCode) {
      window.sessionStorage.setItem(pendingInviteCodeKey, inviteCode);
    }
  }, [inviteDetails?.recipientEmail, searchParams]);

  useEffect(() => {
    if (!form.inviteToken) {
      setInviteDetails(null);
      setInviteDetailsLoaded(true);
      return undefined;
    }

    let active = true;
    const loadInvite = async () => {
      setInviteDetailsLoaded(false);
      try {
        const response = await fetch(buildApiUrl(`/api/kitchen/auth/invite/${encodeURIComponent(form.inviteToken)}`));
        const data = await response.json().catch(() => ({}));
        if (!active) return;
        if (!response.ok) {
          setInviteDetails(null);
          return;
        }
        setInviteDetails({
          householdName: data.householdName || "",
          recipientEmail: data.recipientEmail || "",
          role: data.role || "",
          expiresAt: data.expiresAt || ""
        });
        setValidatedHousehold({ name: data.householdName || "" });
      } catch {
        if (!active) return;
        setInviteDetails(null);
      } finally {
        if (active) {
          setInviteDetailsLoaded(true);
        }
      }
    };

    void loadInvite();
    return () => {
      active = false;
    };
  }, [form.inviteToken]);

  useEffect(() => {
    const preferredDisplayName = clerkUser?.fullName || clerkUser?.firstName || user?.displayName || "";
    setForm((prev) => ({
      ...prev,
      displayName: prev.displayName || preferredDisplayName,
      householdName: prev.householdName || buildDefaultHouseholdName(preferredDisplayName)
    }));
  }, [clerkUser, user?.displayName]);

  useEffect(() => {
    if (!clerkSignedIn) return;
    setAuthPhase("config");
    setConfigStep(2);
  }, [clerkSignedIn]);

  useEffect(() => {
    if (validatedInviteCode && validatedInviteCode !== normalizedInviteCode) {
      setValidatedInviteCode("");
      setValidatedHousehold(null);
    }
  }, [normalizedInviteCode, validatedInviteCode]);

  useEffect(() => {
    if (authPhase !== "credentials") return undefined;
    if (!normalizedEmail) {
      setEmailCheck({ state: "idle", email: "", message: "" });
      return undefined;
    }
    if (!emailIsValid) {
      setEmailCheck({ state: "idle", email: normalizedEmail, message: "" });
      return undefined;
    }
    if (emailCheck.state === "available" && emailCheck.email === normalizedEmail) {
      return undefined;
    }

    if (emailCheckTimerRef.current) {
      window.clearTimeout(emailCheckTimerRef.current);
    }

    setEmailCheck((prev) => {
      if (prev.state === "checking" && prev.email === normalizedEmail) {
        return prev;
      }
      return { state: "checking", email: normalizedEmail, message: "" };
    });

    emailCheckTimerRef.current = window.setTimeout(async () => {
      try {
        const data = await apiRequest(`/api/kitchen/auth/check-email?email=${encodeURIComponent(normalizedEmail)}`);
        setEmailCheck({
          state: data?.exists ? "exists" : "available",
          email: normalizedEmail,
          message: data?.exists ? "Este email ya esta registrado. Inicia sesion o usa otro email." : ""
        });
      } catch {
        setEmailCheck({
          state: "error",
          email: normalizedEmail,
          message: ""
        });
      }
    }, 350);

    return () => {
      if (emailCheckTimerRef.current) {
        window.clearTimeout(emailCheckTimerRef.current);
      }
    };
  }, [authPhase, emailCheck.email, emailCheck.state, emailIsValid, normalizedEmail]);

  useEffect(() => {
    if (!import.meta.env.DEV) return;
    console.info("[clerk/signup][dev] state", {
      isLoaded,
      signUpExists: Boolean(signUp),
      disabledReason,
      authPhase,
      configStep,
      submitting: authLoading || verificationLoading || finalLoading,
      emailValid: emailIsValid,
      passwordValid: passwordHasMinimumLength,
      passwordsMatch,
      publishableKeyPresent: clerkPublishableKeyPresent
    });
  }, [
    authLoading,
    authPhase,
    clerkPublishableKeyPresent,
    configStep,
    disabledReason,
    emailIsValid,
    finalLoading,
    isLoaded,
    passwordHasMinimumLength,
    passwordsMatch,
    signUp,
    verificationLoading
  ]);

  useEffect(() => {
    if (!import.meta.env.DEV) return undefined;
    if (isLoaded) {
      setDevSlowClerkLoad(false);
      return undefined;
    }
    const timer = window.setTimeout(() => {
      setDevSlowClerkLoad(true);
      console.warn("[clerk/signup][dev] Clerk no termina de cargar", {
        publishableKeyPresent: clerkPublishableKeyPresent,
        insideClerkProviderLikely: typeof isLoaded === "boolean"
      });
    }, 5000);
    return () => window.clearTimeout(timer);
  }, [clerkPublishableKeyPresent, isLoaded]);

  const stepTitle = useMemo(() => {
    if (authPhase === "verify") return "Verifica tu email";
    if (visualStep === 1) return "Crea tu cuenta";
    if (visualStep === 2) return "Elige como quieres entrar";
    if (visualStep === 3) return "Como quieres que te vean";
    return "Ajusta lo esencial";
  }, [authPhase, visualStep]);

  const stepDescription = useMemo(() => {
    if (authPhase === "credentials") return "Empezamos con tu acceso seguro de Lunchfy.";
    if (authPhase === "verify") return "Te enviamos un codigo para confirmar tu email antes de configurar el hogar.";
    if (visualStep === 2) return "Primero definimos si vas a crear un hogar nuevo o unirte a uno existente.";
    if (visualStep === 3) return "Este nombre se usara dentro del hogar y para tus iniciales.";
    return isCreateMode
      ? "Configura tu hogar y tus preferencias personales antes de entrar."
      : "Solo necesitamos tus preferencias personales para terminar.";
  }, [authPhase, isCreateMode, visualStep]);

  const canContinueStep2 = useMemo(() => {
    if (isCreateMode) return form.plan === BASIC_PLAN;
    if (!isJoinMode) return false;
    if (isInviteFlow) return Boolean(inviteDetails?.householdName);
    return Boolean(validatedHousehold?.name) && normalizedInviteCode.length === 6 && validatedInviteCode === normalizedInviteCode;
  }, [form.plan, inviteDetails?.householdName, isCreateMode, isInviteFlow, isJoinMode, normalizedInviteCode, validatedHousehold?.name, validatedInviteCode]);

  const canContinueStep3 = String(form.displayName || "").trim().length > 0;

  const canSubmitFinal = useMemo(() => {
    if (!canContinueStep3) return false;
    if (isCreateMode && !String(form.householdName || "").trim()) return false;
    if (isCreateMode && form.avoidRepeatsEnabled) {
      const weeks = Number(form.avoidRepeatsWeeks);
      if (!Number.isInteger(weeks) || weeks < 1 || weeks > 12) return false;
    }
    return true;
  }, [canContinueStep3, form.avoidRepeatsEnabled, form.avoidRepeatsWeeks, form.householdName, isCreateMode]);

  const updateField = (field, value) => {
    setError("");
    if (field === "email") {
      setEmailCheck({ state: "idle", email: "", message: "" });
    }
    setForm((prev) => ({ ...prev, [field]: value }));
  };

  const validateEmailAvailability = async () => {
    if (!normalizedEmail || !emailIsValid) return null;
    if (emailCheck.state === "available" && emailCheck.email === normalizedEmail) return "available";

    if (emailCheckTimerRef.current) {
      window.clearTimeout(emailCheckTimerRef.current);
    }

    setEmailCheck({ state: "checking", email: normalizedEmail, message: "" });
    try {
      const data = await apiRequest(`/api/kitchen/auth/check-email?email=${encodeURIComponent(normalizedEmail)}`);
      const nextState = data?.exists ? "exists" : "available";
      setEmailCheck({
        state: nextState,
        email: normalizedEmail,
        message: data?.exists ? "Este email ya esta registrado. Inicia sesion o usa otro email." : ""
      });
      return nextState;
    } catch {
      setEmailCheck({
        state: "error",
        email: normalizedEmail,
        message: ""
      });
      return "error";
    }
  };

  const goToPreviousConfigStep = () => {
    setError("");
    setConfigStep((prev) => Math.max(2, prev - 1));
  };

  const goToNextConfigStep = () => {
    setError("");
    setConfigStep((prev) => Math.min(4, prev + 1));
  };

  const submitCredentials = async (event) => {
    event.preventDefault();
    if (disabledReason || createSubmitLockRef.current) return;

    const availability = await validateEmailAvailability();
    if (availability === "exists") {
      setError("Este email ya esta registrado. Inicia sesion o usa otro email.");
      return;
    }
    if (availability === "error") {
      setError("No pudimos validar este email todavia. Intentalo de nuevo.");
      return;
    }
    if (!isLoaded || !signUp) {
      setError(import.meta.env.DEV
        ? "Clerk no esta listo en este formulario. Revisa la configuracion del provider."
        : "No pudimos preparar el registro seguro.");
      return;
    }

    createSubmitLockRef.current = true;
    setAuthLoading(true);
    setError("");
    try {
      await signUp.create({
        emailAddress: normalizedEmail,
        password: String(form.password || "")
      });
      await signUp.prepareEmailAddressVerification({
        strategy: "email_code"
      });
      setAuthPhase("verify");
    } catch (err) {
      if (import.meta.env.DEV) {
        console.error("[clerk/signup][dev] create/prepare failed", err);
      }
      if (isCaptchaInitializationError(err)) {
        setError("No se pudo cargar la verificacion de seguridad. Recarga la pagina e intentalo de nuevo.");
      } else {
        setError(normalizeClerkError(err, "No pudimos crear tu cuenta segura."));
      }
    } finally {
      createSubmitLockRef.current = false;
      setAuthLoading(false);
    }
  };

  const submitVerification = async (event) => {
    event.preventDefault();
    if (verificationLoading || verifySubmitLockRef.current || !signUp) return;

    const verificationCode = String(form.verificationCode || "").trim();
    if (!verificationCode) {
      setError("Introduce el codigo de verificacion.");
      return;
    }

    verifySubmitLockRef.current = true;
    setVerificationLoading(true);
    setError("");
    try {
      const result = await signUp.attemptEmailAddressVerification({
        code: verificationCode
      });
      if (result.status !== "complete" || !result.createdSessionId) {
        setError("No pudimos verificar el codigo. Revisa el email e intentalo de nuevo.");
        return;
      }

      await setActive({ session: result.createdSessionId });
      setAuthPhase("config");
      setConfigStep(2);
    } catch (err) {
      if (import.meta.env.DEV) {
        console.error("[clerk/signup][dev] verification failed", err);
      }
      setError(normalizeClerkError(err, "El codigo no es valido o ha caducado."));
    } finally {
      verifySubmitLockRef.current = false;
      setVerificationLoading(false);
    }
  };

  const validateHouseholdCode = async () => {
    if (codeValidationLoading) return;
    if (normalizedInviteCode.length !== 6) {
      setError("Introduce un codigo numerico de 6 digitos.");
      return;
    }

    setError("");
    setCodeValidationLoading(true);
    setValidatedHousehold(null);
    try {
      const data = await apiRequest(`/api/kitchen/auth/resolve-household/${normalizedInviteCode}`);
      setValidatedInviteCode(normalizedInviteCode);
      setValidatedHousehold({
        name: data?.household?.name || ""
      });
    } catch (err) {
      if (isUserLimitReachedError(err)) {
        setError("Este hogar ya alcanzo el limite de usuarios de su plan actual.");
      } else {
        setError(err.message || "No encontramos ningun hogar con ese codigo.");
      }
      setValidatedInviteCode("");
      setValidatedHousehold(null);
    } finally {
      setCodeValidationLoading(false);
    }
  };

  const submitFinalOnboarding = async (event) => {
    event.preventDefault();
    if (finalLoading || finalSubmitStartedRef.current) return;
    if (!canSubmitFinal) {
      setError("Revisa los campos pendientes antes de continuar.");
      return;
    }

    finalSubmitStartedRef.current = true;
    setError("");
    setFinalLoading(true);

    try {
      const data = await apiRequest("/api/kitchen/auth/clerk/onboarding", {
        method: "POST",
        authMode: "clerk",
        body: JSON.stringify({
          displayName: String(form.displayName || "").trim(),
          householdName: isCreateMode ? String(form.householdName || "").trim() : undefined,
          selectedPlan: isCreateMode ? BASIC_PLAN : undefined,
          dinnersEnabled: isCreateMode ? Boolean(form.dinnersEnabled) : undefined,
          avoidRepeatsEnabled: isCreateMode ? Boolean(form.avoidRepeatsEnabled) : undefined,
          avoidRepeatsWeeks: isCreateMode ? Number(form.avoidRepeatsWeeks || 1) : undefined,
          active: Boolean(form.active),
          canCook: Boolean(form.canCook),
          dinnerActive: Boolean(form.dinnerActive),
          dinnerCanCook: Boolean(form.dinnerCanCook),
          inviteCode: isJoinMode && !form.inviteToken ? normalizedInviteCode : undefined,
          inviteToken: form.inviteToken || undefined
        })
      });

      window.sessionStorage.removeItem(pendingInviteTokenKey);
      window.sessionStorage.removeItem(pendingInviteCodeKey);
      setUser(data.user);
      setOnboardingRequired(false);
      await refreshUser({ authMode: "clerk" });
      navigate("/kitchen/semana", { replace: true });
    } catch (err) {
      finalSubmitStartedRef.current = false;
      setError(err.message || "No pudimos terminar tu registro. Intentalo de nuevo.");
    } finally {
      setFinalLoading(false);
    }
  };

  const renderAuthCredentials = () => (
    <form className="kitchen-login-form kitchen-onboarding-form" onSubmit={submitCredentials}>
      <label className="kitchen-ui-input-group" htmlFor="clerk-signup-email">
        <span className="kitchen-login-label">EMAIL</span>
        <input
          id="clerk-signup-email"
          className="kitchen-ui-input"
          type="email"
          autoComplete="email"
          value={form.email}
          onChange={(event) => updateField("email", event.target.value)}
          onBlur={() => void validateEmailAvailability()}
          placeholder="tuemail@ejemplo.com"
          required
        />
      </label>
      <label className="kitchen-ui-input-group" htmlFor="clerk-signup-password">
        <span className="kitchen-login-label">CONTRASENA</span>
        <input
          id="clerk-signup-password"
          className="kitchen-ui-input"
          type="password"
          autoComplete="new-password"
          value={form.password}
          onChange={(event) => updateField("password", event.target.value)}
          minLength={8}
          required
        />
      </label>
      <label className="kitchen-ui-input-group" htmlFor="clerk-signup-confirm-password">
        <span className="kitchen-login-label">REPETIR CONTRASENA</span>
        <input
          id="clerk-signup-confirm-password"
          className="kitchen-ui-input"
          type="password"
          autoComplete="new-password"
          value={form.confirmPassword}
          onChange={(event) => updateField("confirmPassword", event.target.value)}
          minLength={8}
          required
        />
      </label>
      {step1Errors.email ? <div className="kitchen-alert error">{step1Errors.email}</div> : null}
      {step1Errors.password ? <div className="kitchen-alert error">{step1Errors.password}</div> : null}
      {step1Errors.confirmPassword ? <div className="kitchen-alert error">{step1Errors.confirmPassword}</div> : null}
      {!step1Errors.email && emailCheck.state === "checking" && normalizedEmail ? (
        <p className="kitchen-auth-hint">Comprobando si este email esta disponible...</p>
      ) : null}
      {!isLoaded ? <p className="kitchen-auth-hint">Preparando registro seguro...</p> : null}
      {!clerkPublishableKeyPresent && import.meta.env.DEV ? (
        <div className="kitchen-alert error">Clerk no esta configurado correctamente. Revisa la publishable key del entorno.</div>
      ) : null}
      {isLoaded && !signUp && import.meta.env.DEV ? (
        <div className="kitchen-alert error">Clerk cargo, pero el objeto signUp no esta disponible. Revisa la consola DEV.</div>
      ) : null}
      <p className="kitchen-auth-hint">
        Usa una contrasena segura de al menos 8 caracteres. Despues te enviaremos un codigo para confirmar el email.
      </p>
      <div id="clerk-captcha" className="clerk-captcha" aria-live="polite" />
      <div className="kitchen-onboarding-footer">
        <button type="button" className="kitchen-button secondary" onClick={() => navigate(signInRoute)}>
          Ya tengo cuenta
        </button>
        <button type="submit" className="kitchen-ui-button kitchen-login-submit" disabled={Boolean(disabledReason)}>
          {authLoading ? "Enviando codigo..." : "Continuar"}
        </button>
      </div>
      {import.meta.env.DEV ? (
        <p className="kitchen-auth-hint">
          DEV: isLoaded={String(isLoaded)} signUp={String(Boolean(signUp))} disabledReason={disabledReason || "ready"} submitting={String(authLoading)} emailValid={String(emailIsValid)} passwordValid={String(passwordHasMinimumLength)} passwordsMatch={String(passwordsMatch)}
        </p>
      ) : null}
      {import.meta.env.DEV && devSlowClerkLoad ? (
        <div className="kitchen-alert error">Clerk no termina de cargar. Revisa VITE_CLERK_PUBLISHABLE_KEY y ClerkProvider.</div>
      ) : null}
    </form>
  );

  const renderEmailVerification = () => (
    <form className="kitchen-login-form kitchen-onboarding-form" onSubmit={submitVerification}>
      <label className="kitchen-ui-input-group" htmlFor="clerk-verification-code">
        <span className="kitchen-login-label">CODIGO DE VERIFICACION</span>
        <input
          id="clerk-verification-code"
          className="kitchen-ui-input"
          inputMode="numeric"
          autoComplete="one-time-code"
          value={form.verificationCode}
          onChange={(event) => updateField("verificationCode", event.target.value)}
          placeholder="123456"
          maxLength={6}
          required
        />
      </label>
      <p className="kitchen-auth-hint">
        Enviamos el codigo a <strong>{normalizedEmail}</strong>. Escribelo aqui para continuar.
      </p>
      <div className="kitchen-onboarding-footer">
        <button
          type="button"
          className="kitchen-button secondary"
          onClick={() => {
            setError("");
            setAuthPhase("credentials");
          }}
          disabled={verificationLoading}
        >
          Volver
        </button>
        <button type="submit" className="kitchen-ui-button kitchen-login-submit" disabled={verificationLoading}>
          {verificationLoading ? "Verificando..." : "Verificar y continuar"}
        </button>
      </div>
      {import.meta.env.DEV ? (
        <p className="kitchen-auth-hint">
          DEV: phase=verify submitting={String(verificationLoading)} signUp={String(Boolean(signUp))}
        </p>
      ) : null}
    </form>
  );

  const renderStep2 = () => (
    <div className="kitchen-onboarding-panel">
      <div className="kitchen-onboarding-choice-grid">
        <button
          type="button"
          className={`kitchen-onboarding-choice-card ${isCreateMode ? "is-selected" : ""} ${isInviteFlow ? "is-disabled" : ""}`}
          onClick={() => {
            if (isInviteFlow) return;
            updateField("householdMode", "create");
          }}
          disabled={isInviteFlow}
        >
          <span className="kitchen-onboarding-choice-kicker">Opcion A</span>
          <strong>Crear un hogar nuevo</strong>
          <p>{isInviteFlow ? "Esta alta viene con una invitacion, asi que entraras en ese hogar." : "Empezaras con tu propio hogar y el plan Basic."}</p>
        </button>
        <button
          type="button"
          className={`kitchen-onboarding-choice-card ${isJoinMode ? "is-selected" : ""}`}
          onClick={() => updateField("householdMode", "join")}
        >
          <span className="kitchen-onboarding-choice-kicker">Opcion B</span>
          <strong>Unirme a un hogar existente</strong>
          <p>Entraras con un codigo o con la invitacion que ya te compartieron.</p>
        </button>
      </div>

      {isCreateMode ? (
        <div className="kitchen-onboarding-substep">
          <h3 className="kitchen-onboarding-section-title">Selecciona tu plan</h3>
          <div className="kitchen-onboarding-plan-list">
            {PLAN_OPTIONS.map((planOption) => (
              <button
                key={planOption.value}
                type="button"
                className={`kitchen-onboarding-plan-card ${form.plan === planOption.value ? "is-selected" : ""} ${planOption.selectable ? "" : "is-disabled"}`}
                onClick={() => {
                  if (!planOption.selectable) return;
                  updateField("plan", planOption.value);
                }}
                disabled={!planOption.selectable}
              >
                <div>
                  <strong>{planOption.title}</strong>
                  <p>{planOption.description}</p>
                </div>
                {!planOption.selectable ? (
                  <span className="kitchen-onboarding-note">Proximamente. El pago aun no esta disponible.</span>
                ) : (
                  <span className="kitchen-onboarding-note is-active">Disponible ahora</span>
                )}
              </button>
            ))}
          </div>
        </div>
      ) : null}

      {isJoinMode ? (
        <div className="kitchen-onboarding-substep">
          <h3 className="kitchen-onboarding-section-title">Confirma el hogar</h3>
          {isInviteFlow ? (
            inviteDetailsLoaded ? (
              inviteDetails?.householdName ? (
                <div className="kitchen-onboarding-resolved-card">
                  <strong>{inviteDetails.householdName}</strong>
                  <p>
                    Esta invitacion te unira a ese hogar
                    {inviteDetails.recipientEmail ? ` con ${inviteDetails.recipientEmail}` : ""}.
                  </p>
                </div>
              ) : (
                <div className="kitchen-alert error">No pudimos validar esta invitacion. Pide una nueva para continuar.</div>
              )
            ) : (
              <p className="kitchen-muted">Validando invitacion...</p>
            )
          ) : (
            <>
              <label className="kitchen-ui-input-group" htmlFor="clerk-household-code">
                <span className="kitchen-login-label">CODIGO DE HOGAR</span>
                <input
                  id="clerk-household-code"
                  className="kitchen-ui-input"
                  inputMode="numeric"
                  value={normalizedInviteCode}
                  onChange={(event) => updateField("inviteCode", event.target.value)}
                  placeholder="123456"
                  maxLength={6}
                />
              </label>
              <div className="kitchen-onboarding-inline-actions">
                <button type="button" className="kitchen-button secondary" onClick={() => void validateHouseholdCode()} disabled={codeValidationLoading || normalizedInviteCode.length !== 6}>
                  {codeValidationLoading ? "Validando..." : "Validar codigo"}
                </button>
              </div>
              {validatedHousehold?.name ? (
                <div className="kitchen-onboarding-resolved-card">
                  <strong>{validatedHousehold.name}</strong>
                  <p>El codigo es correcto. Ya puedes continuar.</p>
                </div>
              ) : (
                <p className="kitchen-auth-hint">Solo haremos la validacion cuando pulses el boton, para evitar peticiones mientras escribes.</p>
              )}
            </>
          )}
        </div>
      ) : null}

      <div className="kitchen-onboarding-footer">
        <button type="button" className="kitchen-button secondary" disabled>
          Volver
        </button>
        <button type="button" className="kitchen-ui-button kitchen-login-submit" disabled={!canContinueStep2} onClick={goToNextConfigStep}>
          Continuar
        </button>
      </div>
    </div>
  );

  const renderStep3 = () => (
    <form className="kitchen-login-form kitchen-onboarding-form" onSubmit={(event) => {
      event.preventDefault();
      if (!canContinueStep3) {
        setError("El nombre visible es obligatorio.");
        return;
      }
      goToNextConfigStep();
    }}>
      <label className="kitchen-ui-input-group" htmlFor="clerk-display-name">
        <span className="kitchen-login-label">NOMBRE VISIBLE</span>
        <input
          id="clerk-display-name"
          className="kitchen-ui-input"
          value={form.displayName}
          onChange={(event) => updateField("displayName", event.target.value)}
          placeholder="Como quieres aparecer"
          required
        />
      </label>
      <p className="kitchen-auth-hint">
        Este nombre lo vera tu hogar y se usara para generar tus iniciales en el avatar.
      </p>
      <div className="kitchen-onboarding-footer">
        <button type="button" className="kitchen-button secondary" onClick={goToPreviousConfigStep}>
          Volver
        </button>
        <button type="submit" className="kitchen-ui-button kitchen-login-submit" disabled={!canContinueStep3}>
          Continuar
        </button>
      </div>
    </form>
  );

  const renderPreferenceToggle = (field, title, description) => (
    <label className="kitchen-field kitchen-toggle-field" key={field}>
      <div className="kitchen-toggle-row">
        <span className="kitchen-label">{title}</span>
        <label className="kitchen-toggle">
          <input
            type="checkbox"
            className="kitchen-toggle-input"
            checked={Boolean(form[field])}
            onChange={(event) => updateField(field, event.target.checked)}
          />
          <span className="kitchen-toggle-track" />
        </label>
      </div>
      <p className="kitchen-muted">{description}</p>
    </label>
  );

  const renderStep4 = () => (
    <form className="kitchen-login-form kitchen-onboarding-form" onSubmit={submitFinalOnboarding}>
      {isCreateMode ? (
        <section className="kitchen-onboarding-section">
          <h3 className="kitchen-onboarding-section-title">Preferencias del hogar</h3>
          <label className="kitchen-ui-input-group" htmlFor="clerk-household-name">
            <span className="kitchen-login-label">NOMBRE DEL HOGAR</span>
            <input
              id="clerk-household-name"
              className="kitchen-ui-input"
              value={form.householdName}
              onChange={(event) => updateField("householdName", event.target.value)}
              placeholder="Mi hogar"
              required
            />
          </label>
          {renderPreferenceToggle("dinnersEnabled", "Planificamos cenas", "Activa esta opcion si tambien quereis organizar cenas dentro del hogar.")}
          {renderPreferenceToggle("avoidRepeatsEnabled", "Evitar repetir platos", "Lunchfy intentara espaciar los platos para que el menu sea mas variado.")}
          {form.avoidRepeatsEnabled ? (
            <label className="kitchen-ui-input-group" htmlFor="clerk-avoid-repeats-weeks">
              <span className="kitchen-login-label">SEMANAS SIN REPETIR</span>
              <input
                id="clerk-avoid-repeats-weeks"
                className="kitchen-ui-input"
                type="number"
                min="1"
                max="12"
                value={form.avoidRepeatsWeeks}
                onChange={(event) => updateField("avoidRepeatsWeeks", Number(event.target.value || 1))}
              />
            </label>
          ) : null}
        </section>
      ) : null}

      <section className="kitchen-onboarding-section">
        <h3 className="kitchen-onboarding-section-title">Tus preferencias</h3>
        {renderPreferenceToggle("active", "Contarme como comensal por defecto", "Apareceras automaticamente como persona que come cuando se planifiquen comidas.")}
        {renderPreferenceToggle("canCook", "Puedo cocinar", "Tu perfil podra entrar en las asignaciones de cocina.")}
        {renderPreferenceToggle("dinnerActive", "Contarme tambien en cenas", "Si el hogar usa cenas, aparecera por defecto en esa planificacion.")}
        {renderPreferenceToggle("dinnerCanCook", "Puedo cocinar cenas", "Tambien podras ser asignado como cocinero en las cenas.")}
      </section>

      <div className="kitchen-onboarding-footer">
        <button type="button" className="kitchen-button secondary" onClick={goToPreviousConfigStep} disabled={finalLoading}>
          Volver
        </button>
        <button type="submit" className="kitchen-ui-button kitchen-login-submit" disabled={!canSubmitFinal || finalLoading}>
          {finalLoading ? "Entrando..." : "Entrar en Lunchfy"}
        </button>
      </div>
    </form>
  );

  return (
    <div className="kitchen-app">
      <div className="kitchen-container kitchen-login-wrap">
        <Card className="kitchen-login-card kitchen-auth-card kitchen-onboarding-card">
          <div className="kitchen-auth-header">
            <p className="kitchen-auth-kicker">Registro seguro</p>
            <h2 className="kitchen-login-title">{stepTitle}</h2>
            <p className="kitchen-login-subtitle">{stepDescription}</p>
          </div>

          <div className="kitchen-onboarding-stepper" aria-label="Progreso del registro">
            {STEP_LABELS.map((step) => (
              <div
                key={step.number}
                className={`kitchen-onboarding-step ${visualStep === step.number ? "is-current" : ""} ${visualStep > step.number ? "is-complete" : ""}`}
                title={step.label}
                aria-label={step.label}
              >
                <span className="kitchen-onboarding-step-index">{step.number}</span>
                <span className="kitchen-onboarding-step-label">
                  <span className="kitchen-onboarding-step-label-full">{step.label}</span>
                  <span className="kitchen-onboarding-step-label-short">{step.shortLabel}</span>
                </span>
              </div>
            ))}
          </div>

          {isInviteFlow ? (
            <div className="kitchen-alert info">
              {inviteDetails?.householdName
                ? `Esta alta esta vinculada al hogar ${inviteDetails.householdName}.`
                : "Esta alta esta vinculada a una invitacion de hogar."}
            </div>
          ) : null}

          {error ? <div className="kitchen-alert error">{error}</div> : null}

          <div className="kitchen-onboarding-stage">
            {authPhase === "credentials" ? renderAuthCredentials() : null}
            {authPhase === "verify" ? renderEmailVerification() : null}
            {authPhase === "config" && configStep === 2 ? renderStep2() : null}
            {authPhase === "config" && configStep === 3 ? renderStep3() : null}
            {authPhase === "config" && configStep === 4 ? renderStep4() : null}
          </div>

          <div className="kitchen-auth-footer-actions">
            <button type="button" className="kitchen-login-link" onClick={() => navigate(signInRoute)}>
              Ya tengo cuenta
            </button>
            <button type="button" className="kitchen-login-link" onClick={() => navigate("/login")}>
              Usar acceso legacy
            </button>
          </div>
        </Card>
      </div>
    </div>
  );
}
