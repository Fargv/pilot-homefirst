import React, { useEffect, useMemo, useRef, useState } from "react";
import { useClerk, useUser } from "@clerk/react";
import { useNavigate, useSearchParams } from "react-router-dom";
import Card from "../components/ui/Card";
import { apiRequest, buildApiUrl } from "../api.js";
import { useAuth } from "../auth";
import { isUserLimitReachedError } from "../subscription.js";
import { AppLoadingScreen } from "../components/WeekPageSkeleton.jsx";

// ─── Constants ────────────────────────────────────────────────────────────────

const STORAGE_INVITE_TOKEN_KEY = "clerk_onboarding_invite_token";
const STORAGE_INVITE_CODE_KEY = "clerk_onboarding_invite_code";
const BASIC_PLAN = "basic";
const LOGIN_PATH = "/login";

// Steps 1 (Cuenta) and 2 (Verificación) are now handled externally by Clerk.
// This page starts at step Hogar (household).
const STEP_LABELS = [
  { step: 1, label: "Hogar", short: "Hogar" },
  { step: 2, label: "Perfil", short: "Perfil" },
  { step: 3, label: "Preferencias", short: "Prefs." },
];

const PHASE_STEP = {
  household: 1,
  profile: 2,
  preferences: 3,
};

const PHASE_TITLE = {
  household: "Tu hogar",
  profile: "Tu perfil",
  preferences: "Tus preferencias",
};

const PHASE_SUBTITLE = {
  household: "Elige si creas tu propio hogar o te unes a uno existente.",
  profile: "¿Cómo quieres que te vea tu hogar?",
  preferences: "Ajusta tus preferencias antes de entrar.",
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function normalizeDigitCode(v) {
  return String(v || "").replace(/\D/g, "").slice(0, 6);
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
              skipHousehold && step === 1 ? "is-disabled" : "",
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
  const clerk = useClerk();
  const { user: clerkUser, isLoaded: clerkIsLoaded, isSignedIn } = useUser();
  const { user, setUser, setOnboardingRequired, refreshUser } = useAuth();

  // ── Phase ────────────────────────────────────────────────────────────
  // Credentials and email verification are handled by Clerk externally.
  // This page always starts at "household" (adjusted to "profile" for invite flow).
  const [phase, setPhase] = useState("household");
  const phaseInitializedRef = useRef(false);

  // ── Form ─────────────────────────────────────────────────────────────
  const [form, setForm] = useState({
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

  // ── Status ───────────────────────────────────────────────────────────
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  // ── Invite details ────────────────────────────────────────────────────
  const [inviteDetails, setInviteDetails] = useState(null);
  const [inviteLoaded, setInviteLoaded] = useState(false);

  // ── Household code validation ─────────────────────────────────────────
  const [codeValidating, setCodeValidating] = useState(false);
  const [validatedCode, setValidatedCode] = useState("");
  const [validatedHousehold, setValidatedHousehold] = useState(null);

  // ── Submit lock ───────────────────────────────────────────────────────
  const finalStartedRef = useRef(false);

  // ─── Derived values ───────────────────────────────────────────────────────

  const normalizedInviteCode = normalizeDigitCode(form.inviteCode);
  const isInviteFlow = Boolean(form.inviteToken);
  const inviteInvalid = isInviteFlow && inviteLoaded && !inviteDetails?.householdName;
  const isCreateMode = form.householdMode === "create";
  const isJoinMode = form.householdMode === "join";
  const currentStep = PHASE_STEP[phase] ?? 1;

  // ─── Effects ──────────────────────────────────────────────────────────────

  // Redirect to app once fully onboarded
  useEffect(() => {
    if (user?.id && !user?.onboardingRequired) {
      navigate("/kitchen/semana", { replace: true });
    }
  }, [navigate, user]);

  // If Clerk is loaded but no active session → send to sign-up
  useEffect(() => {
    if (!clerkIsLoaded) return;
    if (!isSignedIn) {
      clerk.redirectToSignUp({ redirectUrl: "/onboarding/clerk" });
    }
  }, [clerkIsLoaded, isSignedIn, clerk]);

  // One-time phase initialization: stay at "household" or jump to "profile" for invite flow
  useEffect(() => {
    if (!clerkIsLoaded || !isSignedIn || phaseInitializedRef.current) return;
    if (form.inviteToken && !inviteLoaded) return; // wait for invite details first
    phaseInitializedRef.current = true;
    if (form.inviteToken) {
      setPhase("profile");
    }
    // No invite token → "household" is already the initial state
  }, [clerkIsLoaded, isSignedIn, form.inviteToken, inviteLoaded]);

  // Read invite token/code from URL params or sessionStorage on mount
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
      inviteToken: prev.inviteToken || token,
      inviteCode: prev.inviteCode || code,
      householdMode: prev.householdMode || (token || code ? "join" : prev.householdMode),
    }));

    if (token) window.sessionStorage.setItem(STORAGE_INVITE_TOKEN_KEY, token);
    if (code) window.sessionStorage.setItem(STORAGE_INVITE_CODE_KEY, code);
  }, [searchParams]);

  // Fetch invite details from API when inviteToken is known
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

  // Auto-fill displayName and householdName from Clerk user profile
  useEffect(() => {
    const suggested = clerkUser?.fullName || clerkUser?.firstName || "";
    setForm((prev) => ({
      ...prev,
      displayName: prev.displayName || suggested,
      householdName: prev.householdName || buildDefaultHouseholdName(suggested),
    }));
  }, [clerkUser]);

  // Reset household validation when the code input changes
  useEffect(() => {
    if (validatedCode && validatedCode !== normalizedInviteCode) {
      setValidatedCode("");
      setValidatedHousehold(null);
    }
  }, [normalizedInviteCode, validatedCode]);

  // ─── Handlers ────────────────────────────────────────────────────────────

  const updateField = (field, value) => {
    setError("");
    setForm((prev) => ({ ...prev, [field]: value }));
  };

  // ── Step 1: Household ─────────────────────────────────────────────────────

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

  // ── Step 2: Profile ───────────────────────────────────────────────────────

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

  // ── Step 3: Preferences + finalize ───────────────────────────────────────

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

  // ── Navigation ────────────────────────────────────────────────────────────

  const goBack = () => {
    setError("");
    if (phase === "profile" && !isInviteFlow) { setPhase("household"); return; }
    if (phase === "preferences") { setPhase("profile"); }
  };

  const canGoBack = phase === "preferences" || (phase === "profile" && !isInviteFlow);

  // ─── Loading / redirecting states ─────────────────────────────────────────

  if (!clerkIsLoaded || !isSignedIn) {
    return (
      <AppLoadingScreen
        title="Preparando tu registro"
        subtitle="Estamos verificando tu acceso seguro con Clerk."
      />
    );
  }

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

          <div className="kitchen-auth-footer-actions">
            <button
              type="button"
              className="kitchen-login-link"
              onClick={() => navigate(LOGIN_PATH)}
            >
              Ya tengo cuenta
            </button>
          </div>

        </Card>
      </div>
    </div>
  );
}
