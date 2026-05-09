import React, { useEffect, useMemo, useRef, useState } from "react";
import { useSignUp, useUser } from "@clerk/react";
import { useNavigate, useSearchParams } from "react-router-dom";
import Card from "../components/ui/Card";
import { apiRequest, buildApiUrl } from "../api.js";
import { useAuth } from "../auth";
import { isUserLimitReachedError } from "../subscription.js";

// ─── Constants ────────────────────────────────────────────────────────────────

const STORAGE_INVITE_TOKEN_KEY = "clerk_onboarding_invite_token";
const STORAGE_INVITE_CODE_KEY = "clerk_onboarding_invite_code";
const BASIC_PLAN = "basic";
const LOGIN_PATH = "/login";

const STEP_LABELS = [
  { step: 1, label: "Cuenta", short: "Cuenta" },
  { step: 2, label: "Hogar", short: "Hogar" },
  { step: 3, label: "Perfil", short: "Perfil" },
  { step: 4, label: "Preferencias", short: "Prefs." },
];

const PHASE_STEP = {
  credentials: 1,
  verify: 1,
  household: 2,
  profile: 3,
  preferences: 4,
};

const PHASE_TITLE = {
  credentials: "Crea tu cuenta",
  verify: "Verifica tu email",
  household: "Tu hogar",
  profile: "Tu perfil",
  preferences: "Tus preferencias",
};

const PHASE_SUBTITLE = {
  credentials: "Empieza con tu acceso seguro en Lunchfy.",
  verify: "Te enviamos un código de 6 dígitos. Introdúcelo para continuar.",
  household: "Elige si creas tu propio hogar o te unes a uno existente.",
  profile: "¿Cómo quieres que te vea tu hogar?",
  preferences: "Ajusta tus preferencias antes de entrar.",
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function isValidEmail(v) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(v || "").trim());
}

function normalizeDigitCode(v) {
  return String(v || "").replace(/\D/g, "").slice(0, 6);
}

function normalizeClerkError(err, fallback = "Ha ocurrido un error. Inténtalo de nuevo.") {
  return err?.errors?.[0]?.longMessage || err?.errors?.[0]?.message || err?.message || fallback;
}

function isCaptchaError(err) {
  const msg = String(err?.errors?.[0]?.message || err?.message || "").toLowerCase();
  return msg.includes("captcha");
}

function buildDefaultHouseholdName(name) {
  const safe = String(name || "").trim();
  return safe ? `${safe} - Hogar` : "Mi hogar";
}

// ─── Stable sub-components ───────────────────────────────────────────────────

function StepIndicator({ currentStep, skipHousehold }) {
  return (
    <div className="kitchen-onboarding-stepper" aria-label="Progreso del registro">
      {STEP_LABELS.map(({ step, label, short }) => {
        const isCurrent = currentStep === step;
        const isDone = currentStep > step;
        return (
          <div
            key={step}
            className={[
              "kitchen-onboarding-step",
              isCurrent ? "is-current" : "",
              isDone ? "is-complete" : "",
              skipHousehold && step === 2 ? "is-disabled" : "",
            ].filter(Boolean).join(" ")}
            aria-label={label}
          >
            <span className="kitchen-onboarding-step-index">
              {isDone ? "✓" : step}
            </span>
            <span className="kitchen-onboarding-step-label">
              <span className="kitchen-onboarding-step-label-full">{label}</span>
              <span className="kitchen-onboarding-step-label-short">{short}</span>
            </span>
          </div>
        );
      })}
    </div>
  );
}

function Toggle({ id, label, description, checked, onChange }) {
  return (
    <div className="kitchen-field kitchen-toggle-field">
      <div className="kitchen-toggle-row">
        <span className="kitchen-label">{label}</span>
        <label className="kitchen-toggle" htmlFor={id}>
          <input
            id={id}
            type="checkbox"
            className="kitchen-toggle-input"
            checked={checked}
            onChange={(e) => onChange(e.target.checked)}
          />
          <span className="kitchen-toggle-track" />
        </label>
      </div>
      {description ? <p className="kitchen-muted">{description}</p> : null}
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export default function ClerkOnboardingPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { isLoaded, signUp, setActive } = useSignUp();
  const { user: clerkUser } = useUser();
  const { user, setUser, setOnboardingRequired, refreshUser } = useAuth();

  // ── Phase ────────────────────────────────────────────────────────────
  const [phase, setPhase] = useState("credentials");

  // ── Form ─────────────────────────────────────────────────────────────
  const [form, setForm] = useState({
    email: "",
    password: "",
    confirmPassword: "",
    inviteToken: "",
    inviteCode: "",
    householdMode: "",
    householdName: "",
    displayName: "",
    dinnersEnabled: false,
    avoidRepeatsEnabled: false,
    avoidRepeatsWeeks: 1,
    active: true,
    canCook: true,
    dinnerActive: true,
    dinnerCanCook: true,
  });

  // ── Verification code (split digits for auto-advance UX) ─────────────
  const [codeDigits, setCodeDigits] = useState(["", "", "", "", "", ""]);
  const digitRefs = useRef([]);

  // ── Status ───────────────────────────────────────────────────────────
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  // ── Email availability ────────────────────────────────────────────────
  const [emailCheck, setEmailCheck] = useState({ state: "idle", email: "" });
  const emailCheckTimerRef = useRef(null);

  // ── Invite details ────────────────────────────────────────────────────
  const [inviteDetails, setInviteDetails] = useState(null);
  const [inviteLoaded, setInviteLoaded] = useState(false);

  // ── Household code validation ─────────────────────────────────────────
  const [codeValidating, setCodeValidating] = useState(false);
  const [validatedCode, setValidatedCode] = useState("");
  const [validatedHousehold, setValidatedHousehold] = useState(null);

  // ── Resend cooldown ───────────────────────────────────────────────────
  const [resendCooldown, setResendCooldown] = useState(0);
  const resendTimerRef = useRef(null);

  // ── Submit locks (prevent double-submit) ──────────────────────────────
  const submitLockRef = useRef(false);
  const finalStartedRef = useRef(false);

  // ─── Derived values ───────────────────────────────────────────────────────

  const normalizedEmail = String(form.email || "").trim().toLowerCase();
  const normalizedInviteCode = normalizeDigitCode(form.inviteCode);
  const emailIsValid = isValidEmail(normalizedEmail);
  const passwordLongEnough = String(form.password).length >= 8;
  const passwordsMatch = Boolean(form.password) && form.password === form.confirmPassword;
  const isInviteFlow = Boolean(form.inviteToken);
  const hasLockedEmail = Boolean(inviteDetails?.recipientEmail);
  const inviteInvalid = isInviteFlow && inviteLoaded && !inviteDetails?.householdName;
  const isCreateMode = form.householdMode === "create";
  const isJoinMode = form.householdMode === "join";
  const currentStep = PHASE_STEP[phase] ?? 1;
  const verificationCode = codeDigits.join("");

  // ─── Effects ──────────────────────────────────────────────────────────────

  // Redirect when fully onboarded
  useEffect(() => {
    if (user?.id && !user?.onboardingRequired) {
      navigate("/kitchen/semana", { replace: true });
    }
  }, [navigate, user]);

  // Read invite token/code from URL or sessionStorage on mount
  useEffect(() => {
    const token = String(
      searchParams.get("inviteToken")
      || searchParams.get("token")
      || searchParams.get("invite")
      || window.sessionStorage.getItem(STORAGE_INVITE_TOKEN_KEY)
      || ""
    ).trim();
    const code = normalizeDigitCode(
      searchParams.get("inviteCode")
      || searchParams.get("code")
      || window.sessionStorage.getItem(STORAGE_INVITE_CODE_KEY)
      || ""
    );

    setForm((prev) => ({
      ...prev,
      email: inviteDetails?.recipientEmail || prev.email || "",
      inviteToken: prev.inviteToken || token,
      inviteCode: prev.inviteCode || code,
      householdMode: prev.householdMode || (token || code ? "join" : prev.householdMode),
    }));

    if (token) window.sessionStorage.setItem(STORAGE_INVITE_TOKEN_KEY, token);
    if (code) window.sessionStorage.setItem(STORAGE_INVITE_CODE_KEY, code);
  }, [inviteDetails?.recipientEmail, searchParams]);

  // Fetch invite details from API when inviteToken is set
  useEffect(() => {
    if (!form.inviteToken) {
      setInviteDetails(null);
      setInviteLoaded(true);
      return undefined;
    }

    let active = true;
    setInviteLoaded(false);

    const load = async () => {
      try {
        const res = await fetch(buildApiUrl(`/api/kitchen/auth/invite/${encodeURIComponent(form.inviteToken)}`));
        const data = await res.json().catch(() => ({}));
        if (!active) return;
        setInviteDetails(res.ok ? {
          householdName: data.householdName || "",
          recipientEmail: data.recipientEmail || "",
          role: data.role || "",
        } : null);
      } catch {
        if (active) setInviteDetails(null);
      } finally {
        if (active) setInviteLoaded(true);
      }
    };

    void load();
    return () => { active = false; };
  }, [form.inviteToken]);

  // Debounced email availability check
  useEffect(() => {
    if (phase !== "credentials") return undefined;
    window.clearTimeout(emailCheckTimerRef.current);

    if (!normalizedEmail || !emailIsValid) {
      setEmailCheck({ state: "idle", email: "" });
      return undefined;
    }

    setEmailCheck({ state: "checking", email: normalizedEmail });
    emailCheckTimerRef.current = window.setTimeout(async () => {
      try {
        const data = await apiRequest(`/api/kitchen/auth/check-email?email=${encodeURIComponent(normalizedEmail)}`);
        setEmailCheck({ state: data?.exists ? "exists" : "available", email: normalizedEmail });
      } catch {
        setEmailCheck({ state: "error", email: normalizedEmail });
      }
    }, 400);

    return () => window.clearTimeout(emailCheckTimerRef.current);
  }, [phase, emailIsValid, normalizedEmail]);

  // Auto-fill displayName from Clerk user after email verification
  useEffect(() => {
    const suggested = clerkUser?.fullName || clerkUser?.firstName || "";
    setForm((prev) => ({
      ...prev,
      displayName: prev.displayName || suggested,
      householdName: prev.householdName || buildDefaultHouseholdName(suggested),
    }));
  }, [clerkUser]);

  // Reset household validation when code changes
  useEffect(() => {
    if (validatedCode && validatedCode !== normalizedInviteCode) {
      setValidatedCode("");
      setValidatedHousehold(null);
    }
  }, [normalizedInviteCode, validatedCode]);

  // Cleanup all timers on unmount
  useEffect(() => () => {
    window.clearTimeout(emailCheckTimerRef.current);
    window.clearTimeout(resendTimerRef.current);
  }, []);

  // ─── Disabled reason (credentials phase only) ─────────────────────────────

  const disabledReason = useMemo(() => {
    if (phase !== "credentials") return null;
    if (!emailIsValid) return "Introduce un email válido";
    if (!passwordLongEnough) return "La contraseña debe tener al menos 8 caracteres";
    if (!passwordsMatch) return "Las contraseñas no coinciden";
    if (loading) return "Enviando...";
    return null;
  }, [phase, emailIsValid, passwordLongEnough, passwordsMatch, loading]);

  // ─── Inline field validation feedback ────────────────────────────────────

  const fieldErrors = useMemo(() => {
    const e = {};
    if (normalizedEmail && !emailIsValid) {
      e.email = "Introduce un email válido.";
    } else if (emailCheck.state === "exists" && emailCheck.email === normalizedEmail) {
      e.email = "Este email ya tiene cuenta. ¿Quieres iniciar sesión?";
    }
    if (form.password && !passwordLongEnough) {
      e.password = "Mínimo 8 caracteres.";
    }
    if (form.confirmPassword && form.password !== form.confirmPassword) {
      e.confirmPassword = "Las contraseñas no coinciden.";
    }
    return e;
  }, [emailCheck, emailIsValid, form.confirmPassword, form.password, normalizedEmail, passwordLongEnough]);

  // ─── Handlers ────────────────────────────────────────────────────────────

  const updateField = (field, value) => {
    setError("");
    setForm((prev) => ({ ...prev, [field]: value }));
  };

  const startResendCooldown = () => {
    setResendCooldown(30);
    const tick = () => {
      setResendCooldown((n) => {
        if (n <= 1) return 0;
        resendTimerRef.current = window.setTimeout(tick, 1000);
        return n - 1;
      });
    };
    resendTimerRef.current = window.setTimeout(tick, 1000);
  };

  // ── Step 1a: Create Clerk account ────────────────────────────────────

  const submitCredentials = async (event) => {
    event.preventDefault();
    if (disabledReason || submitLockRef.current) return;
    if (!isLoaded) {
      setError("La aplicación aún está cargando. Espera un momento e inténtalo de nuevo.");
      return;
    }

    submitLockRef.current = true;
    setLoading(true);
    setError("");

    try {
      const created = await signUp.create({
        emailAddress: normalizedEmail,
        password: String(form.password),
      });
      const alreadyPrepared = created?.verifications?.emailAddress?.status === "unverified";
      if (!alreadyPrepared) {
        await signUp.prepareEmailAddressVerification({ strategy: "email_code" });
      }
      setPhase("verify");
      startResendCooldown();
    } catch (err) {
      if (isCaptchaError(err)) {
        setError("No se pudo cargar la verificación de seguridad. Recarga la página e inténtalo de nuevo.");
      } else {
        setError(normalizeClerkError(err, "No se pudo crear la cuenta. Inténtalo de nuevo."));
      }
    } finally {
      setLoading(false);
      submitLockRef.current = false;
    }
  };

  // ── Step 1b: Verify email code ────────────────────────────────────────

  const doVerification = async (code) => {
    if (code.length !== 6 || loading) return;
    setLoading(true);
    setError("");

    try {
      const result = await signUp.attemptEmailAddressVerification({ code });
      if (result.status !== "complete" || !result.createdSessionId) {
        setError("No pudimos verificar el código. Revisa el email e inténtalo de nuevo.");
        return;
      }
      await setActive({ session: result.createdSessionId });
      setPhase(isInviteFlow ? "profile" : "household");
    } catch (err) {
      setError(normalizeClerkError(err, "El código no es válido o ha caducado."));
      // Clear digits so user can re-enter
      setCodeDigits(["", "", "", "", "", ""]);
      setTimeout(() => digitRefs.current[0]?.focus(), 50);
    } finally {
      setLoading(false);
    }
  };

  const submitVerification = (event) => {
    event?.preventDefault();
    void doVerification(verificationCode);
  };

  const resendCode = async () => {
    if (resendCooldown > 0 || loading) return;
    setError("");
    setLoading(true);
    try {
      await signUp.prepareEmailAddressVerification({ strategy: "email_code" });
      setCodeDigits(["", "", "", "", "", ""]);
      startResendCooldown();
      setTimeout(() => digitRefs.current[0]?.focus(), 50);
    } catch (err) {
      setError(normalizeClerkError(err, "No pudimos reenviar el código. Inténtalo de nuevo."));
    } finally {
      setLoading(false);
    }
  };

  // ── Digit input handlers ──────────────────────────────────────────────

  const handleDigitChange = (index, rawValue) => {
    const digit = rawValue.replace(/\D/g, "").slice(-1);
    let nextDigits;
    setCodeDigits((prev) => {
      nextDigits = [...prev];
      nextDigits[index] = digit;
      return nextDigits;
    });
    setError("");
    if (digit && index < 5) {
      setTimeout(() => digitRefs.current[index + 1]?.focus(), 0);
    }
    if (digit && index === 5) {
      const full = (nextDigits || [...codeDigits.slice(0, 5), digit]).join("");
      if (full.length === 6) {
        setTimeout(() => void doVerification(full), 0);
      }
    }
  };

  const handleDigitKeyDown = (index, e) => {
    if (e.key === "Backspace" && !codeDigits[index] && index > 0) {
      digitRefs.current[index - 1]?.focus();
    }
    if (e.key === "ArrowLeft" && index > 0) digitRefs.current[index - 1]?.focus();
    if (e.key === "ArrowRight" && index < 5) digitRefs.current[index + 1]?.focus();
  };

  const handleDigitPaste = (e) => {
    e.preventDefault();
    const pasted = e.clipboardData.getData("text").replace(/\D/g, "").slice(0, 6);
    if (!pasted) return;
    const next = ["", "", "", "", "", ""];
    for (let i = 0; i < pasted.length; i++) next[i] = pasted[i];
    setCodeDigits(next);
    const focusIdx = Math.min(pasted.length, 5);
    setTimeout(() => digitRefs.current[focusIdx]?.focus(), 0);
    if (pasted.length === 6) {
      setTimeout(() => void doVerification(pasted), 0);
    }
  };

  // ── Step 2: Household ────────────────────────────────────────────────

  const validateHouseholdCode = async () => {
    if (codeValidating || normalizedInviteCode.length !== 6) return;
    setError("");
    setCodeValidating(true);
    setValidatedHousehold(null);
    try {
      const data = await apiRequest(`/api/kitchen/auth/resolve-household/${normalizedInviteCode}`);
      setValidatedCode(normalizedInviteCode);
      setValidatedHousehold({ name: data?.household?.name || "" });
    } catch (err) {
      setValidatedCode("");
      setValidatedHousehold(null);
      if (isUserLimitReachedError(err)) {
        setError("Este hogar ha alcanzado el límite de usuarios de su plan actual.");
      } else {
        setError(err.message || "No encontramos ningún hogar con ese código.");
      }
    } finally {
      setCodeValidating(false);
    }
  };

  const canContinueHousehold = useMemo(() => {
    if (isCreateMode) return true;
    if (!isJoinMode) return false;
    if (isInviteFlow) return Boolean(inviteDetails?.householdName);
    return Boolean(validatedHousehold?.name) && validatedCode === normalizedInviteCode;
  }, [inviteDetails?.householdName, isCreateMode, isInviteFlow, isJoinMode, normalizedInviteCode, validatedCode, validatedHousehold?.name]);

  const submitHousehold = () => {
    if (!canContinueHousehold) return;
    setError("");
    setPhase("profile");
  };

  // ── Step 3: Profile ──────────────────────────────────────────────────

  const canContinueProfile = Boolean(String(form.displayName || "").trim());

  const submitProfile = (event) => {
    event.preventDefault();
    if (!canContinueProfile) {
      setError("El nombre visible es obligatorio.");
      return;
    }
    setError("");
    setPhase("preferences");
  };

  // ── Step 4: Preferences + finalize ───────────────────────────────────

  const canSubmitFinal = useMemo(() => {
    if (!canContinueProfile) return false;
    if (isCreateMode && !String(form.householdName || "").trim()) return false;
    if (isCreateMode && form.avoidRepeatsEnabled) {
      const w = Number(form.avoidRepeatsWeeks);
      if (!Number.isInteger(w) || w < 1 || w > 12) return false;
    }
    return true;
  }, [canContinueProfile, form.avoidRepeatsEnabled, form.avoidRepeatsWeeks, form.householdName, isCreateMode]);

  const submitFinal = async (event) => {
    event.preventDefault();
    if (!canSubmitFinal || finalStartedRef.current || loading) return;

    finalStartedRef.current = true;
    setLoading(true);
    setError("");

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
          inviteToken: form.inviteToken || undefined,
        }),
      });
      window.sessionStorage.removeItem(STORAGE_INVITE_TOKEN_KEY);
      window.sessionStorage.removeItem(STORAGE_INVITE_CODE_KEY);
      setUser(data.user);
      setOnboardingRequired(false);
      await refreshUser({ authMode: "clerk" });
      navigate("/kitchen/semana", { replace: true });
    } catch (err) {
      finalStartedRef.current = false;
      setError(err.message || "No pudimos terminar tu registro. Inténtalo de nuevo.");
    } finally {
      setLoading(false);
    }
  };

  // ── Navigation ────────────────────────────────────────────────────────

  const goBack = () => {
    setError("");
    if (phase === "verify") { setPhase("credentials"); return; }
    if (phase === "profile" && !isInviteFlow) { setPhase("household"); return; }
    if (phase === "preferences") { setPhase("profile"); }
  };

  const canGoBack = phase === "verify" || phase === "preferences" || (phase === "profile" && !isInviteFlow);

  // ─── Render ───────────────────────────────────────────────────────────────

  return (
    <div className="kitchen-app">
      <div className="kitchen-container kitchen-login-wrap">
        <Card className="kitchen-login-card kitchen-auth-card kitchen-onboarding-card">

          <header className="kitchen-auth-header">
            <span className="kitchen-auth-kicker">Registro seguro</span>
            <h2 className="kitchen-login-title">{PHASE_TITLE[phase]}</h2>
            <p className="kitchen-login-subtitle">{PHASE_SUBTITLE[phase]}</p>
          </header>

          <StepIndicator currentStep={currentStep} skipHousehold={isInviteFlow} />

          {isInviteFlow && inviteDetails?.householdName ? (
            <div className="kitchen-alert info">
              Te estás uniendo a <strong>{inviteDetails.householdName}</strong>.
            </div>
          ) : null}

          {error ? <div className="kitchen-alert error" role="alert">{error}</div> : null}

          {/* ── CREDENTIALS ────────────────────────────────────────────── */}
          {phase === "credentials" ? (
            <form className="kitchen-onboarding-form" onSubmit={submitCredentials} noValidate>
              {inviteInvalid ? (
                <div className="kitchen-alert error">
                  Esta invitación no es válida o ha caducado. Pide una nueva invitación.
                </div>
              ) : null}

              <div className="kitchen-signup-fields">
                <label className="kitchen-ui-input-group" htmlFor="su-email">
                  <span className="kitchen-login-label">EMAIL</span>
                  <input
                    id="su-email"
                    className={`kitchen-ui-input${
                      fieldErrors.email ? " is-error"
                        : emailCheck.state === "available" && emailCheck.email === normalizedEmail ? " is-valid"
                        : ""
                    }`}
                    type="email"
                    autoComplete="email"
                    inputMode="email"
                    placeholder="tu@email.com"
                    value={form.email}
                    readOnly={hasLockedEmail}
                    onChange={(e) => updateField("email", e.target.value)}
                  />
                  {fieldErrors.email ? (
                    <span className="kitchen-signup-field-error">{fieldErrors.email}</span>
                  ) : emailCheck.state === "checking" && emailCheck.email === normalizedEmail ? (
                    <span className="kitchen-signup-field-hint">Comprobando disponibilidad...</span>
                  ) : null}
                </label>

                <label className="kitchen-ui-input-group" htmlFor="su-password">
                  <span className="kitchen-login-label">CONTRASEÑA</span>
                  <input
                    id="su-password"
                    className={`kitchen-ui-input${
                      fieldErrors.password ? " is-error"
                        : form.password && passwordLongEnough ? " is-valid"
                        : ""
                    }`}
                    type="password"
                    autoComplete="new-password"
                    placeholder="Mínimo 8 caracteres"
                    value={form.password}
                    onChange={(e) => updateField("password", e.target.value)}
                  />
                  {fieldErrors.password ? (
                    <span className="kitchen-signup-field-error">{fieldErrors.password}</span>
                  ) : null}
                </label>

                <label className="kitchen-ui-input-group" htmlFor="su-confirm">
                  <span className="kitchen-login-label">REPITE LA CONTRASEÑA</span>
                  <input
                    id="su-confirm"
                    className={`kitchen-ui-input${
                      fieldErrors.confirmPassword ? " is-error"
                        : passwordsMatch ? " is-valid"
                        : ""
                    }`}
                    type="password"
                    autoComplete="new-password"
                    placeholder="Repite la contraseña"
                    value={form.confirmPassword}
                    onChange={(e) => updateField("confirmPassword", e.target.value)}
                  />
                  {fieldErrors.confirmPassword ? (
                    <span className="kitchen-signup-field-error">{fieldErrors.confirmPassword}</span>
                  ) : null}
                </label>
              </div>

              <div id="clerk-captcha" />

              <div className="kitchen-onboarding-footer">
                <button
                  type="button"
                  className="kitchen-button secondary"
                  onClick={() => navigate(LOGIN_PATH)}
                >
                  Ya tengo cuenta
                </button>
                <button
                  type="submit"
                  className="kitchen-ui-button kitchen-login-submit"
                  disabled={Boolean(disabledReason) || inviteInvalid || (isInviteFlow && !inviteLoaded)}
                  title={disabledReason || undefined}
                >
                  {loading ? "Enviando código..." : "Continuar"}
                </button>
              </div>
            </form>
          ) : null}

          {/* ── VERIFY ─────────────────────────────────────────────────── */}
          {phase === "verify" ? (
            <form className="kitchen-onboarding-form" onSubmit={submitVerification} noValidate>
              <p className="kitchen-auth-hint" style={{ textAlign: "center" }}>
                Enviamos el código a <strong>{normalizedEmail}</strong>.
                Revisa también la carpeta de spam.
              </p>

              <div className="kitchen-signup-code-grid" role="group" aria-label="Código de verificación">
                {codeDigits.map((digit, i) => (
                  <input
                    key={i}
                    ref={(el) => { digitRefs.current[i] = el; }}
                    className="kitchen-signup-code-digit"
                    type="text"
                    inputMode="numeric"
                    autoComplete={i === 0 ? "one-time-code" : "off"}
                    maxLength={1}
                    value={digit}
                    onChange={(e) => handleDigitChange(i, e.target.value)}
                    onKeyDown={(e) => handleDigitKeyDown(i, e)}
                    onPaste={i === 0 ? handleDigitPaste : undefined}
                    aria-label={`Dígito ${i + 1} del código`}
                    disabled={loading}
                  />
                ))}
              </div>

              {loading ? (
                <p className="kitchen-auth-hint" style={{ textAlign: "center" }}>Verificando...</p>
              ) : null}

              <div className="kitchen-onboarding-footer">
                <button
                  type="button"
                  className="kitchen-button secondary"
                  onClick={goBack}
                  disabled={loading}
                >
                  Volver
                </button>
                <button
                  type="button"
                  className="kitchen-button ghost"
                  onClick={resendCode}
                  disabled={resendCooldown > 0 || loading}
                >
                  {resendCooldown > 0 ? `Reenviar (${resendCooldown}s)` : "Reenviar código"}
                </button>
              </div>
            </form>
          ) : null}

          {/* ── HOUSEHOLD ──────────────────────────────────────────────── */}
          {phase === "household" ? (
            <div className="kitchen-onboarding-panel">
              <div className="kitchen-onboarding-choice-grid">
                <button
                  type="button"
                  className={`kitchen-onboarding-choice-card${isCreateMode ? " is-selected" : ""}`}
                  onClick={() => updateField("householdMode", "create")}
                >
                  <span className="kitchen-onboarding-choice-kicker">Opción A</span>
                  <strong>Crear un hogar nuevo</strong>
                  <p>Empezarás con tu propio hogar y el plan Basic.</p>
                </button>
                <button
                  type="button"
                  className={`kitchen-onboarding-choice-card${isJoinMode ? " is-selected" : ""}`}
                  onClick={() => updateField("householdMode", "join")}
                >
                  <span className="kitchen-onboarding-choice-kicker">Opción B</span>
                  <strong>Unirme a un hogar existente</strong>
                  <p>Entra con el código de 6 dígitos que te compartió tu hogar.</p>
                </button>
              </div>

              {isJoinMode ? (
                <div className="kitchen-onboarding-substep">
                  <h3 className="kitchen-onboarding-section-title">Código del hogar</h3>
                  <label className="kitchen-ui-input-group" htmlFor="su-hcode">
                    <span className="kitchen-login-label">CÓDIGO DE 6 DÍGITOS</span>
                    <input
                      id="su-hcode"
                      className="kitchen-ui-input"
                      inputMode="numeric"
                      placeholder="123456"
                      maxLength={6}
                      value={normalizedInviteCode}
                      onChange={(e) => updateField("inviteCode", e.target.value)}
                    />
                  </label>
                  <div className="kitchen-onboarding-inline-actions">
                    <button
                      type="button"
                      className="kitchen-button secondary"
                      disabled={codeValidating || normalizedInviteCode.length !== 6}
                      onClick={validateHouseholdCode}
                    >
                      {codeValidating ? "Validando..." : "Validar código"}
                    </button>
                  </div>
                  {validatedHousehold?.name ? (
                    <div className="kitchen-onboarding-resolved-card">
                      <strong>{validatedHousehold.name}</strong>
                      <p>Código correcto. Puedes continuar.</p>
                    </div>
                  ) : null}
                </div>
              ) : null}

              {isCreateMode ? (
                <p className="kitchen-auth-hint">
                  Empezarás con el plan Basic. Podrás invitar a miembros de tu hogar después de entrar.
                </p>
              ) : null}

              <div className="kitchen-onboarding-footer">
                <div />
                <button
                  type="button"
                  className="kitchen-ui-button kitchen-login-submit"
                  disabled={!canContinueHousehold}
                  onClick={submitHousehold}
                >
                  Continuar
                </button>
              </div>
            </div>
          ) : null}

          {/* ── PROFILE ────────────────────────────────────────────────── */}
          {phase === "profile" ? (
            <form className="kitchen-onboarding-form" onSubmit={submitProfile} noValidate>
              <label className="kitchen-ui-input-group" htmlFor="su-displayname">
                <span className="kitchen-login-label">NOMBRE VISIBLE</span>
                <input
                  id="su-displayname"
                  className={`kitchen-ui-input${canContinueProfile ? " is-valid" : ""}`}
                  type="text"
                  autoComplete="name"
                  placeholder="¿Cómo te llaman?"
                  value={form.displayName}
                  onChange={(e) => updateField("displayName", e.target.value)}
                />
              </label>
              <p className="kitchen-auth-hint">
                Tu hogar te verá con este nombre. Se usará para generar tus iniciales en el avatar.
              </p>
              <div className="kitchen-onboarding-footer">
                {canGoBack ? (
                  <button type="button" className="kitchen-button secondary" onClick={goBack}>
                    Volver
                  </button>
                ) : <div />}
                <button
                  type="submit"
                  className="kitchen-ui-button kitchen-login-submit"
                  disabled={!canContinueProfile}
                >
                  Continuar
                </button>
              </div>
            </form>
          ) : null}

          {/* ── PREFERENCES ────────────────────────────────────────────── */}
          {phase === "preferences" ? (
            <form className="kitchen-onboarding-form" onSubmit={submitFinal} noValidate>
              {isCreateMode ? (
                <section className="kitchen-onboarding-section">
                  <h3 className="kitchen-onboarding-section-title">Preferencias del hogar</h3>

                  <label className="kitchen-ui-input-group" htmlFor="su-hname">
                    <span className="kitchen-login-label">NOMBRE DEL HOGAR</span>
                    <input
                      id="su-hname"
                      className="kitchen-ui-input"
                      type="text"
                      placeholder="Mi hogar"
                      value={form.householdName}
                      onChange={(e) => updateField("householdName", e.target.value)}
                    />
                  </label>

                  <Toggle
                    id="su-dinners"
                    label="Planificamos cenas"
                    description="Actívalo si también queréis organizar cenas dentro del hogar."
                    checked={form.dinnersEnabled}
                    onChange={(v) => updateField("dinnersEnabled", v)}
                  />

                  <Toggle
                    id="su-avoidrepeats"
                    label="Evitar repetir platos"
                    description="Lunchfy intentará espaciar los platos para que el menú sea más variado."
                    checked={form.avoidRepeatsEnabled}
                    onChange={(v) => updateField("avoidRepeatsEnabled", v)}
                  />

                  {form.avoidRepeatsEnabled ? (
                    <label className="kitchen-ui-input-group" htmlFor="su-repeatweeks">
                      <span className="kitchen-login-label">SEMANAS SIN REPETIR</span>
                      <input
                        id="su-repeatweeks"
                        className="kitchen-ui-input"
                        type="number"
                        min="1"
                        max="12"
                        value={form.avoidRepeatsWeeks}
                        onChange={(e) => updateField("avoidRepeatsWeeks", Number(e.target.value || 1))}
                      />
                    </label>
                  ) : null}
                </section>
              ) : null}

              <section className="kitchen-onboarding-section">
                <h3 className="kitchen-onboarding-section-title">Tus preferencias personales</h3>

                <Toggle
                  id="su-active"
                  label="Contarme como comensal por defecto"
                  description="Aparecerás automáticamente como persona que come cuando se planifiquen comidas."
                  checked={form.active}
                  onChange={(v) => updateField("active", v)}
                />

                <Toggle
                  id="su-cancook"
                  label="Puedo cocinar"
                  description="Tu perfil podrá entrar en las asignaciones de cocina."
                  checked={form.canCook}
                  onChange={(v) => updateField("canCook", v)}
                />

                <Toggle
                  id="su-dinneractive"
                  label="Contarme también en cenas"
                  description="Si el hogar usa cenas, aparecerás por defecto en esa planificación."
                  checked={form.dinnerActive}
                  onChange={(v) => updateField("dinnerActive", v)}
                />

                <Toggle
                  id="su-dinnercancook"
                  label="Puedo cocinar cenas"
                  description="También podrás ser asignado como cocinero en las cenas."
                  checked={form.dinnerCanCook}
                  onChange={(v) => updateField("dinnerCanCook", v)}
                />
              </section>

              <div className="kitchen-onboarding-footer">
                <button
                  type="button"
                  className="kitchen-button secondary"
                  onClick={goBack}
                  disabled={loading}
                >
                  Volver
                </button>
                <button
                  type="submit"
                  className="kitchen-ui-button kitchen-login-submit"
                  disabled={!canSubmitFinal || loading}
                >
                  {loading ? "Entrando..." : "Entrar en Lunchfy"}
                </button>
              </div>
            </form>
          ) : null}

          {phase !== "credentials" ? (
            <div className="kitchen-auth-footer-actions">
              <button
                type="button"
                className="kitchen-login-link"
                onClick={() => navigate(LOGIN_PATH)}
              >
                Ya tengo cuenta
              </button>
            </div>
          ) : null}

        </Card>
      </div>
    </div>
  );
}
