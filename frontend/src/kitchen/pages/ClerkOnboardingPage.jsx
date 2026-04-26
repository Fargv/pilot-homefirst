import React, { useEffect, useMemo, useRef, useState } from "react";
import { useClerk, useSignUp, useUser } from "@clerk/react";
import { useNavigate, useSearchParams } from "react-router-dom";
import Card from "../components/ui/Card";
import { apiRequest, buildApiUrl } from "../api.js";
import { useAuth } from "../auth";
import { isUserLimitReachedError } from "../subscription.js";

const pendingInviteTokenKey = "clerk_onboarding_invite_token";
const pendingInviteCodeKey = "clerk_onboarding_invite_code";
const BASIC_PLAN = "basic";
const STEP_LABELS = [
  { number: 1, label: "Cuenta" },
  { number: 2, label: "Hogar" },
  { number: 3, label: "Perfil" },
  { number: 4, label: "Preferencias" }
];

const PLAN_OPTIONS = [
  {
    value: "basic",
    title: "Basic",
    description: "Perfecto para empezar tu hogar y organizar comidas en común.",
    selectable: true
  },
  {
    value: "pro",
    title: "Pro",
    description: "Más capacidad y funciones avanzadas para hogares activos.",
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

function normalizeClerkError(error, fallbackMessage) {
  const clerkMessage = error?.errors?.[0]?.longMessage || error?.errors?.[0]?.message;
  return clerkMessage || error?.message || fallbackMessage;
}

function isValidEmailAddress(value) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(value || "").trim());
}

function buildDefaultHouseholdName(name) {
  const safeName = String(name || "").trim();
  return safeName ? `${safeName} - Hogar` : "Mi hogar";
}

export default function ClerkOnboardingPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const clerk = useClerk();
  const { isLoaded: signUpLoaded, signUp } = useSignUp();
  const { user: clerkUser } = useUser();
  const { clerkLoaded, clerkSignedIn, user, setUser, setOnboardingRequired, refreshUser } = useAuth();

  const [currentStep, setCurrentStep] = useState(1);
  const [authStage, setAuthStage] = useState("credentials");
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
  const [resendLoading, setResendLoading] = useState(false);
  const [codeValidationLoading, setCodeValidationLoading] = useState(false);
  const [finalLoading, setFinalLoading] = useState(false);
  const [validatedHousehold, setValidatedHousehold] = useState(null);
  const [validatedInviteCode, setValidatedInviteCode] = useState("");
  const [inviteDetails, setInviteDetails] = useState(null);
  const [inviteDetailsLoaded, setInviteDetailsLoaded] = useState(false);
  const finalSubmitStartedRef = useRef(false);

  const normalizedInviteCode = useMemo(() => normalizeInviteCode(form.inviteCode), [form.inviteCode]);
  const passwordsMatch = form.password && form.confirmPassword && form.password === form.confirmPassword;
  const passwordHasMinimumLength = String(form.password || "").length >= 8;
  const emailIsValid = isValidEmailAddress(form.email);
  const isInviteFlow = Boolean(form.inviteToken);
  const isJoinMode = form.householdMode === "join";
  const isCreateMode = form.householdMode === "create";
  const step1Errors = useMemo(() => {
    const errors = {};
    if (form.email && !emailIsValid) {
      errors.email = "Introduce un email válido.";
    }
    if (form.password && !passwordHasMinimumLength) {
      errors.password = "La contraseña debe tener al menos 8 caracteres.";
    }
    if (form.confirmPassword && form.password !== form.confirmPassword) {
      errors.confirmPassword = "Las contraseñas no coinciden.";
    }
    return errors;
  }, [emailIsValid, form.confirmPassword, form.email, form.password, passwordHasMinimumLength]);
  const canSubmitStep1 = emailIsValid
    && passwordHasMinimumLength
    && Boolean(form.password)
    && Boolean(form.confirmPassword)
    && passwordsMatch
    && !authLoading;

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
  }, [searchParams]);

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
        setValidatedHousehold({
          name: data.householdName || ""
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

    void loadInvite();
    return () => {
      active = false;
    };
  }, [form.inviteToken]);

  useEffect(() => {
    const preferredEmail = inviteDetails?.recipientEmail || clerkUser?.primaryEmailAddress?.emailAddress || clerkUser?.emailAddresses?.[0]?.emailAddress || "";
    const preferredDisplayName = clerkUser?.fullName || clerkUser?.firstName || user?.displayName || "";
    setForm((prev) => ({
      ...prev,
      email: prev.email || preferredEmail,
      displayName: prev.displayName || preferredDisplayName,
      householdName: prev.householdName || buildDefaultHouseholdName(preferredDisplayName)
    }));
  }, [clerkUser, inviteDetails, user?.displayName]);

  useEffect(() => {
    if (!clerkLoaded) return;
    if (!clerkSignedIn) return;

    setAuthStage("complete");
    setCurrentStep((prev) => (prev < 2 ? 2 : prev));
  }, [clerkLoaded, clerkSignedIn]);

  useEffect(() => {
    if (validatedInviteCode && validatedInviteCode !== normalizedInviteCode) {
      setValidatedInviteCode("");
      setValidatedHousehold(null);
    }
  }, [normalizedInviteCode, validatedInviteCode]);

  const stepTitle = useMemo(() => {
    if (currentStep === 1) return "Crea tu cuenta";
    if (currentStep === 2) return "Elige cómo quieres entrar";
    if (currentStep === 3) return "¿Cómo quieres que te vean?";
    return "Ajusta lo esencial";
  }, [currentStep]);

  const stepDescription = useMemo(() => {
    if (currentStep === 1) {
      if (authStage === "verification") return "Te enviamos un código para confirmar tu email.";
      if (authStage === "complete") return "Tu acceso seguro ya está listo.";
      return "Empezamos con tu acceso seguro de Lunchfy.";
    }
    if (currentStep === 2) return "Primero definimos si vas a crear un hogar nuevo o unirte a uno existente.";
    if (currentStep === 3) return "Este nombre se usará dentro del hogar y para tus iniciales.";
    return isCreateMode
      ? "Configura tu hogar y tus preferencias personales antes de entrar."
      : "Solo necesitamos tus preferencias personales para terminar.";
  }, [authStage, currentStep, isCreateMode]);

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
    setForm((prev) => ({ ...prev, [field]: value }));
  };

  const goToPreviousStep = () => {
    setError("");
    if (currentStep <= 1) return;
    setCurrentStep((prev) => Math.max(1, prev - 1));
  };

  const goToNextStep = () => {
    setError("");
    if (currentStep >= 4) return;
    setCurrentStep((prev) => prev + 1);
  };

  const submitCredentials = async (event) => {
    event.preventDefault();
    if (authLoading) return;

    if (!signUpLoaded || !signUp) {
      setError("Estamos preparando el registro seguro. Inténtalo de nuevo en un momento.");
      return;
    }

    if (!emailIsValid) {
      setError("Introduce un email válido.");
      return;
    }

    if (!passwordsMatch) {
      setError("Las contraseñas deben coincidir.");
      return;
    }

    if (!passwordHasMinimumLength) {
      setError("La contraseña debe tener al menos 8 caracteres.");
      return;
    }

    setError("");
    setAuthLoading(true);
    try {
      const signUpResource = await signUp.create({
        emailAddress: String(form.email || "").trim(),
        password: String(form.password || "")
      });
      await signUpResource.prepareEmailAddressVerification({ strategy: "email_code" });
      setAuthStage("verification");
    } catch (err) {
      setError(normalizeClerkError(err, "No pudimos crear tu cuenta segura."));
    } finally {
      setAuthLoading(false);
    }
  };

  const verifyEmailCode = async (event) => {
    event.preventDefault();
    if (verificationLoading || !signUpLoaded || !signUp) return;

    const verificationCode = String(form.verificationCode || "").trim();
    if (!verificationCode) {
      setError("Introduce el código de verificación.");
      return;
    }

    setError("");
    setVerificationLoading(true);
    try {
      const verificationResult = await signUp.attemptEmailAddressVerification({ code: verificationCode });
      if (verificationResult.status !== "complete" || !verificationResult.createdSessionId) {
        setError("No pudimos verificar el código. Revisa el email e inténtalo de nuevo.");
        return;
      }
      await clerk.setActive({ session: verificationResult.createdSessionId });
      setAuthStage("complete");
      setCurrentStep(2);
    } catch (err) {
      setError(normalizeClerkError(err, "El código no es válido o ha caducado."));
    } finally {
      setVerificationLoading(false);
    }
  };

  const resendVerificationCode = async () => {
    if (resendLoading || !signUp) return;
    setError("");
    setResendLoading(true);
    try {
      await signUp.prepareEmailAddressVerification({ strategy: "email_code" });
    } catch (err) {
      setError(normalizeClerkError(err, "No pudimos reenviar el código ahora mismo."));
    } finally {
      setResendLoading(false);
    }
  };

  const validateHouseholdCode = async () => {
    if (codeValidationLoading) return;
    if (normalizedInviteCode.length !== 6) {
      setError("Introduce un código numérico de 6 dígitos.");
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
        setError("Este hogar ya alcanzó el límite de usuarios de su plan actual.");
      } else {
        setError(err.message || "No encontramos ningún hogar con ese código.");
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
      setError(err.message || "No pudimos terminar tu registro. Inténtalo de nuevo.");
    } finally {
      setFinalLoading(false);
    }
  };

  const renderStep1 = () => {
    if (authStage === "verification") {
      return (
        <form className="kitchen-login-form kitchen-onboarding-form" onSubmit={verifyEmailCode}>
          <label className="kitchen-ui-input-group" htmlFor="clerk-verification-code">
            <span className="kitchen-login-label">CÓDIGO DE VERIFICACIÓN</span>
            <input
              id="clerk-verification-code"
              className="kitchen-ui-input"
              inputMode="numeric"
              autoComplete="one-time-code"
              value={form.verificationCode}
              onChange={(event) => updateField("verificationCode", event.target.value)}
              placeholder="123456"
              maxLength={6}
            />
          </label>
          <p className="kitchen-auth-hint">
            Enviamos el código a <strong>{form.email}</strong>. Escríbelo aquí para continuar.
          </p>
          <div className="kitchen-onboarding-footer">
            <button type="button" className="kitchen-button secondary" onClick={() => setAuthStage("credentials")} disabled={verificationLoading || resendLoading}>
              Volver
            </button>
            <div className="kitchen-onboarding-inline-actions">
              <button type="button" className="kitchen-login-link" onClick={() => void resendVerificationCode()} disabled={resendLoading || verificationLoading}>
                {resendLoading ? "Reenviando..." : "Reenviar código"}
              </button>
              <button type="submit" className="kitchen-ui-button kitchen-login-submit" disabled={verificationLoading}>
                {verificationLoading ? "Verificando..." : "Verificar y continuar"}
              </button>
            </div>
          </div>
        </form>
      );
    }

    if (authStage === "complete") {
      return (
        <div className="kitchen-onboarding-panel">
          <div className="kitchen-alert success">
            Tu email <strong>{form.email || clerkUser?.primaryEmailAddress?.emailAddress || "verificado"}</strong> ya está confirmado.
          </div>
          <div className="kitchen-onboarding-footer">
            <button type="button" className="kitchen-button secondary" onClick={() => navigate("/auth/clerk/sign-in", { replace: true })}>
              Cambiar cuenta
            </button>
            <button type="button" className="kitchen-ui-button kitchen-login-submit" onClick={goToNextStep}>
              Continuar
            </button>
          </div>
        </div>
      );
    }

    return (
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
            placeholder="tuemail@ejemplo.com"
            required
          />
        </label>
        <label className="kitchen-ui-input-group" htmlFor="clerk-signup-password">
          <span className="kitchen-login-label">CONTRASEÑA</span>
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
          <span className="kitchen-login-label">REPETIR CONTRASEÑA</span>
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
        <p className="kitchen-auth-hint">
          Usa una contraseña segura de al menos 8 caracteres. Después te enviaremos un código para confirmar el email.
        </p>
        <div className="kitchen-onboarding-footer">
          <button type="button" className="kitchen-button secondary" onClick={() => navigate("/auth/clerk/sign-in")}>
            Ya tengo cuenta
          </button>
          <button
            type="submit"
            className="kitchen-ui-button kitchen-login-submit"
            disabled={!canSubmitStep1}
          >
            {authLoading ? "Preparando..." : "Continuar"}
          </button>
        </div>
      </form>
    );
  };

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
          <span className="kitchen-onboarding-choice-kicker">Opción A</span>
          <strong>Crear un hogar nuevo</strong>
          <p>{isInviteFlow ? "Esta alta viene con una invitación, así que entrarás en ese hogar." : "Empezarás con tu propio hogar y el plan Basic."}</p>
        </button>
        <button
          type="button"
          className={`kitchen-onboarding-choice-card ${isJoinMode ? "is-selected" : ""}`}
          onClick={() => updateField("householdMode", "join")}
        >
          <span className="kitchen-onboarding-choice-kicker">Opción B</span>
          <strong>Unirme a un hogar existente</strong>
          <p>Entrarás con un código o con la invitación que ya te compartieron.</p>
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
                  <span className="kitchen-onboarding-note">Próximamente. El pago aún no está disponible.</span>
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
                    Esta invitación te unirá a ese hogar
                    {inviteDetails.recipientEmail ? ` con ${inviteDetails.recipientEmail}` : ""}.
                  </p>
                </div>
              ) : (
                <div className="kitchen-alert error">No pudimos validar esta invitación. Pide una nueva para continuar.</div>
              )
            ) : (
              <p className="kitchen-muted">Validando invitación...</p>
            )
          ) : (
            <>
              <label className="kitchen-ui-input-group" htmlFor="clerk-household-code">
                <span className="kitchen-login-label">CÓDIGO DE HOGAR</span>
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
                  {codeValidationLoading ? "Validando..." : "Validar código"}
                </button>
              </div>
              {validatedHousehold?.name ? (
                <div className="kitchen-onboarding-resolved-card">
                  <strong>{validatedHousehold.name}</strong>
                  <p>El código es correcto. Ya puedes continuar.</p>
                </div>
              ) : (
                <p className="kitchen-auth-hint">Solo haremos la validación cuando pulses el botón, para evitar peticiones mientras escribes.</p>
              )}
            </>
          )}
        </div>
      ) : null}

      <div className="kitchen-onboarding-footer">
        <button type="button" className="kitchen-button secondary" onClick={goToPreviousStep}>
          Volver
        </button>
        <button type="button" className="kitchen-ui-button kitchen-login-submit" disabled={!canContinueStep2} onClick={goToNextStep}>
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
      goToNextStep();
    }}>
      <label className="kitchen-ui-input-group" htmlFor="clerk-display-name">
        <span className="kitchen-login-label">NOMBRE VISIBLE</span>
        <input
          id="clerk-display-name"
          className="kitchen-ui-input"
          value={form.displayName}
          onChange={(event) => updateField("displayName", event.target.value)}
          placeholder="Cómo quieres aparecer"
          required
        />
      </label>
      <p className="kitchen-auth-hint">
        Este nombre lo verá tu hogar y se usará para generar tus iniciales en el avatar.
      </p>
      <div className="kitchen-onboarding-footer">
        <button type="button" className="kitchen-button secondary" onClick={goToPreviousStep}>
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
          {renderPreferenceToggle("dinnersEnabled", "Planificamos cenas", "Activa esta opción si también queréis organizar cenas dentro del hogar.")}
          {renderPreferenceToggle("avoidRepeatsEnabled", "Evitar repetir platos", "Lunchfy intentará espaciar los platos para que el menú sea más variado.")}
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
        {renderPreferenceToggle("active", "Contarme como comensal por defecto", "Aparecerás automáticamente como persona que come cuando se planifiquen comidas.")}
        {renderPreferenceToggle("canCook", "Puedo cocinar", "Tu perfil podrá entrar en las asignaciones de cocina.")}
        {renderPreferenceToggle("dinnerActive", "Contarme también en cenas", "Si el hogar usa cenas, aparecerás por defecto en esa planificación.")}
        {renderPreferenceToggle("dinnerCanCook", "Puedo cocinar cenas", "También podrás ser asignado como cocinero en las cenas.")}
      </section>

      <div className="kitchen-onboarding-footer">
        <button type="button" className="kitchen-button secondary" onClick={goToPreviousStep} disabled={finalLoading}>
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
                className={`kitchen-onboarding-step ${currentStep === step.number ? "is-current" : ""} ${currentStep > step.number ? "is-complete" : ""}`}
              >
                <span className="kitchen-onboarding-step-index">{step.number}</span>
                <span className="kitchen-onboarding-step-label">{step.label}</span>
              </div>
            ))}
          </div>

          {isInviteFlow ? (
            <div className="kitchen-alert info">
              {inviteDetails?.householdName
                ? `Esta alta está vinculada al hogar ${inviteDetails.householdName}.`
                : "Esta alta está vinculada a una invitación de hogar."}
            </div>
          ) : null}

          {error ? <div className="kitchen-alert error">{error}</div> : null}

          <div className="kitchen-onboarding-stage">
            {currentStep === 1 ? renderStep1() : null}
            {currentStep === 2 ? renderStep2() : null}
            {currentStep === 3 ? renderStep3() : null}
            {currentStep === 4 ? renderStep4() : null}
          </div>

          <div className="kitchen-auth-footer-actions">
            <button type="button" className="kitchen-login-link" onClick={() => navigate("/auth/clerk/sign-in")}>
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
