import React, { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { useCookingSession } from "../../contexts/CookingSessionContext.jsx";
import RecipeStepCard from "./RecipeStepCard.jsx";
import { formatDuration } from "../../utils/recipeStepParser.js";
import { displayIngredientQuantity } from "../../utils/recipeScaling.js";
import { formatRemaining, getRemainingMs, normalizeTimerStatus } from "../../utils/timerService.js";

// ─── Icons ───────────────────────────────────────────────────────────────────

function ArrowLeftIcon() {
  return (
    <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor"
      strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" style={{ display: "block", flexShrink: 0 }}>
      <path d="M19 12H6M11 6l-6 6 6 6" />
    </svg>
  );
}

function ArrowRightIcon() {
  return (
    <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor"
      strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" style={{ display: "block", flexShrink: 0 }}>
      <path d="M5 12h13M13 6l6 6-6 6" />
    </svg>
  );
}

function CheckIcon() {
  return (
    <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor"
      strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" style={{ display: "block", flexShrink: 0 }}>
      <path d="M20 6 9 17l-5-5" />
    </svg>
  );
}

function MinimizeIcon() {
  return (
    <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor"
      strokeWidth="2" strokeLinecap="round" aria-hidden="true" style={{ display: "block" }}>
      <path d="M6 9l6 6 6-6" />
    </svg>
  );
}

function XIcon() {
  return (
    <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor"
      strokeWidth="2.5" strokeLinecap="round" aria-hidden="true" style={{ display: "block" }}>
      <path d="M18 6 6 18M6 6l12 12" />
    </svg>
  );
}

function ChefHatIcon() {
  return (
    <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor"
      strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" style={{ display: "block", flexShrink: 0 }}>
      <path d="M6 13.5a4 4 0 1 1 1.2-7.8 4.2 4.2 0 0 1 7.6 0A4 4 0 1 1 18 13.5" />
      <path d="M7 13.5V19a1 1 0 0 0 1 1h8a1 1 0 0 0 1-1v-5.5" />
    </svg>
  );
}

function ListIcon() {
  return (
    <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor"
      strokeWidth="1.9" strokeLinecap="round" aria-hidden="true" style={{ display: "block", flexShrink: 0 }}>
      <path d="M9 6h11M9 12h11M9 18h11M4.4 6h.02M4.4 12h.02M4.4 18h.02" />
    </svg>
  );
}

function ClockIcon() {
  return (
    <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor"
      strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" style={{ display: "block", flexShrink: 0 }}>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7.6V12l3 1.9" />
    </svg>
  );
}

function SmallPlayIcon() {
  return (
    <svg viewBox="0 0 20 20" width="13" height="13" fill="currentColor" aria-hidden="true" style={{ display: "block" }}>
      <path d="M6.5 4.5l9 5.5-9 5.5v-11z" />
    </svg>
  );
}

function SmallPauseIcon() {
  return (
    <svg viewBox="0 0 20 20" width="13" height="13" fill="currentColor" aria-hidden="true" style={{ display: "block" }}>
      <rect x="5" y="4" width="3.5" height="12" rx="1" />
      <rect x="11.5" y="4" width="3.5" height="12" rx="1" />
    </svg>
  );
}

function SmallXIcon() {
  return (
    <svg viewBox="0 0 20 20" width="13" height="13" fill="none" stroke="currentColor"
      strokeWidth="2.4" strokeLinecap="round" aria-hidden="true" style={{ display: "block" }}>
      <path d="M15 5 5 15M5 5l10 10" />
    </svg>
  );
}

function SmallJumpIcon() {
  return (
    <svg viewBox="0 0 20 20" width="13" height="13" fill="none" stroke="currentColor"
      strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" style={{ display: "block" }}>
      <path d="M5 10h9M10 6l4 4-4 4" />
    </svg>
  );
}

function sortTimerEntries(entries) {
  const rank = { finished: 0, running: 1, paused: 2 };
  return entries.sort(([, a], [, b]) => {
    const aStatus = normalizeTimerStatus(a.status);
    const bStatus = normalizeTimerStatus(b.status);
    const statusDiff = (rank[aStatus] ?? 9) - (rank[bStatus] ?? 9);
    if (statusDiff !== 0) return statusDiff;
    return getRemainingMs(a) - getRemainingMs(b);
  });
}

function ActiveTimersPanel({ session, tick, onTimerAction, onGoToStep }) {
  void tick;
  const entries = sortTimerEntries(Object.entries(session.timers || {})
    .filter(([, timer]) => ["running", "paused", "finished"].includes(normalizeTimerStatus(timer.status)))
  );

  if (entries.length === 0) return null;

  const runningCount = entries.filter(([, timer]) => normalizeTimerStatus(timer.status) === "running").length;
  const summaryText = `${entries.length} ${entries.length === 1 ? "activo" : "activos"}`;
  const visibleTimerRows = Math.min(entries.length, 4);

  return (
    <details
      className="cm-active-timers"
      open={entries.length <= 6}
      style={{ "--cm-active-timers-list-height": `${visibleTimerRows * 34 + 8}px` }}
    >
      <summary className="cm-active-timers-summary" aria-label={`Temporizadores activos, ${summaryText}`}>
        <span className="cm-active-timers-title">
          <ClockIcon />
          Temporizadores activos
        </span>
        <span className="cm-active-timers-count">{summaryText}</span>
      </summary>

      <div className="cm-active-timers-list" aria-live="polite">
        {entries.map(([key, timer]) => {
          const status = normalizeTimerStatus(timer.status);
          const stepIndex = Number.isFinite(timer.stepIndex) ? timer.stepIndex : parseInt(String(key).split("_")[0], 10);
          const step = session.steps[Number.isFinite(stepIndex) ? stepIndex : 0];
          const stepTitle = timer.stepTitle || step?.title || `Paso ${(Number.isFinite(stepIndex) ? stepIndex : 0) + 1}`;
          const timerLabel = timer.timerLabel || "Temporizador";
          const remainingMs = getRemainingMs(timer);
          const statusLabel = status === "running" ? "En marcha" : status === "paused" ? "Pausado" : "Listo";
          const tooltip = `Paso ${(Number.isFinite(stepIndex) ? stepIndex : 0) + 1} · ${stepTitle} · ${timerLabel} · ${formatRemaining(remainingMs)} restantes`;
          const durationMs = timer.originalDurationMs ?? timer.durationMs ?? 0;
          const meta = {
            stepId: timer.stepId,
            stepIndex: Number.isFinite(stepIndex) ? stepIndex : 0,
            stepTitle,
            timerId: timer.timerId || "default",
            timerLabel,
            durationMs,
            originalDurationMs: durationMs,
          };

          return (
            <div key={key} className={`cm-active-timer-row is-${status}`} title={tooltip}>
              <button
                type="button"
                className="cm-active-timer-info"
                onClick={() => onGoToStep(Number.isFinite(stepIndex) ? stepIndex : 0)}
                aria-label={tooltip}
              >
                <span className="cm-active-timer-step">P{(Number.isFinite(stepIndex) ? stepIndex : 0) + 1}</span>
                <span className="cm-active-timer-copy">
                  <span className="cm-active-timer-name">{timerLabel}</span>
                </span>
              </button>
              <span className="cm-active-timer-time">{formatRemaining(remainingMs)}</span>
              <span className={`cm-active-timer-badge is-${status}`}>{statusLabel}</span>
              <div className="cm-active-timer-actions">
                {status === "running" ? (
                  <button
                    type="button"
                    className="cm-active-timer-iconbtn"
                    onClick={() => onTimerAction(key, "pause", durationMs, meta)}
                    aria-label={`Pausar ${tooltip}`}
                    title={`Pausar ${tooltip}`}
                  >
                    <SmallPauseIcon />
                  </button>
                ) : null}
                {status === "paused" ? (
                  <button
                    type="button"
                    className="cm-active-timer-iconbtn"
                    onClick={() => onTimerAction(key, "resume", durationMs, meta)}
                    aria-label={`Reanudar ${tooltip}`}
                    title={`Reanudar ${tooltip}`}
                  >
                    <SmallPlayIcon />
                  </button>
                ) : null}
                <button
                  type="button"
                  className="cm-active-timer-iconbtn"
                  onClick={() => onTimerAction(key, "cancel", durationMs, meta)}
                  aria-label={`Cancelar ${tooltip}`}
                  title={`Cancelar ${tooltip}`}
                >
                  <SmallXIcon />
                </button>
                <button
                  type="button"
                  className="cm-active-timer-iconbtn"
                  onClick={() => onGoToStep(Number.isFinite(stepIndex) ? stepIndex : 0)}
                  aria-label={`Ir al paso ${(Number.isFinite(stepIndex) ? stepIndex : 0) + 1}`}
                  title={`Ir al paso ${(Number.isFinite(stepIndex) ? stepIndex : 0) + 1}`}
                >
                  <SmallJumpIcon />
                </button>
              </div>
            </div>
          );
        })}
      </div>

      {runningCount > 1 ? (
        <div className="cm-active-timers-live" aria-live="polite">
          {runningCount} temporizadores en marcha
        </div>
      ) : null}
    </details>
  );
}

function RefreshIcon() {
  return (
    <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor"
      strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" style={{ display: "block", flexShrink: 0 }}>
      <path d="M3.5 12a8.5 8.5 0 1 0 2.5-6M3 4.5V9h4.5" />
    </svg>
  );
}

function UsersIcon() {
  return (
    <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor"
      strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" style={{ display: "block", flexShrink: 0 }}>
      <path d="M16 20v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2M9 11a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7M22 20v-2a4 4 0 0 0-3-3.87M16 4.13a3.5 3.5 0 0 1 0 6.74" />
    </svg>
  );
}

// ─── Completion screen ────────────────────────────────────────────────────────

function CompletionScreen({ session, onCookAgain, onClose }) {
  const elapsed = session.startedAt
    ? Math.round((Date.now() - new Date(session.startedAt).getTime()) / 1000)
    : null;

  return (
    <div className="cm-complete">
      <div className="cm-complete-check" aria-hidden="true">
        <div className="cm-complete-check-ring" />
        <svg width="104" height="104" viewBox="0 0 104 104" style={{ position: "relative" }}>
          <circle cx="52" cy="52" r="48" fill="var(--success-bg, #f0fdf4)" stroke="var(--success-border, #bbf7d0)" strokeWidth="2" />
          <path d="M33 53l13 13 26-29" fill="none"
            stroke="var(--success-text, #166534)" strokeWidth="6"
            strokeLinecap="round" strokeLinejoin="round"
            className="cm-complete-check-path" />
        </svg>
      </div>

      <div className="cm-complete-eyebrow">Buen trabajo</div>
      <h2 className="cm-complete-title">Receta completada</h2>
      <p className="cm-complete-recipe">{session.recipeName}</p>

      <div className="cm-complete-stats">
        <div className="cm-complete-stat">
          <UsersIcon />
          <span>{session.selectedServings} {session.selectedServings === 1 ? "persona" : "personas"}</span>
        </div>
        {elapsed ? (
          <>
            <div className="cm-complete-stat-sep" aria-hidden="true" />
            <div className="cm-complete-stat">
              <span>{formatDuration(elapsed)}</span>
            </div>
          </>
        ) : null}
        <div className="cm-complete-stat-sep" aria-hidden="true" />
        <div className="cm-complete-stat">
          <span>{session.steps.length} {session.steps.length === 1 ? "paso" : "pasos"}</span>
        </div>
      </div>

      <div className="cm-complete-actions">
        <button type="button" className="cm-pill cm-pill--secondary cm-pill--full" onClick={onCookAgain}>
          <RefreshIcon /> Cocinar de nuevo
        </button>
        <button type="button" className="cm-pill cm-pill--ghost cm-pill--full" onClick={onClose}>
          Cerrar
        </button>
      </div>
    </div>
  );
}

// ─── Cancel sheet ─────────────────────────────────────────────────────────────

function CancelSheet({ onKeep, onConfirm }) {
  return (
    <div className="cm-cancel-backdrop" role="presentation" onClick={onKeep}>
      <div
        className="cm-cancel-sheet"
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="cm-cancel-title"
        aria-describedby="cm-cancel-body"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="cm-cancel-handle" aria-hidden="true" />
        <div className="cm-cancel-header">
          <div className="cm-cancel-icon-sq" aria-hidden="true">
            <XIcon />
          </div>
          <h3 id="cm-cancel-title" className="cm-cancel-title">¿Cancelar la receta?</h3>
        </div>
        <p id="cm-cancel-body" className="cm-cancel-body">
          Perderás el progreso de los pasos y los temporizadores en marcha.
        </p>
        <div className="cm-cancel-actions">
          <button type="button" className="cm-pill cm-pill--primary cm-pill--full" onClick={onKeep}>
            <ChefHatIcon /> Seguir cocinando
          </button>
          <button type="button" className="cm-pill cm-pill--danger cm-pill--full" onClick={onConfirm}>
            Sí, cancelar
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Main stepper ─────────────────────────────────────────────────────────────

export default function CookingSessionStepper() {
  const [cancelConfirmOpen, setCancelConfirmOpen] = useState(false);
  const [ingredientPanelOpen, setIngredientPanelOpen] = useState(false);
  const [checkedStepIngredients, setCheckedStepIngredients] = useState({});
  const {
    session,
    isStepperOpen,
    endSession,
    goToStep,
    toggleStepComplete,
    completeSession,
    minimizeStepper,
    timerAction,
    timerTick,
  } = useCookingSession();

  // Keyboard navigation
  useEffect(() => {
    if (!isStepperOpen || !session || session.isComplete) return;
    const handler = (e) => {
      if (e.key === "ArrowRight" || e.key === "ArrowDown") {
        if (session.currentStepIndex < session.steps.length - 1) {
          goToStep(session.currentStepIndex + 1);
        }
      } else if (e.key === "ArrowLeft" || e.key === "ArrowUp") {
        if (session.currentStepIndex > 0) {
          goToStep(session.currentStepIndex - 1);
        }
      } else if (e.key === "Escape") {
        if (cancelConfirmOpen) {
          setCancelConfirmOpen(false);
        } else if (ingredientPanelOpen) {
          setIngredientPanelOpen(false);
        } else {
          minimizeStepper();
        }
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [isStepperOpen, session, goToStep, minimizeStepper, ingredientPanelOpen, cancelConfirmOpen]);

  useEffect(() => {
    if (!isStepperOpen || !session) {
      setCancelConfirmOpen(false);
    }
  }, [isStepperOpen, session]);

  useEffect(() => {
    setCheckedStepIngredients({});
  }, [session?.recipeId, session?.startedAt]);

  if (!session || !isStepperOpen) return null;

  const { steps, currentStepIndex, completedSteps, timers, isComplete, recipeName, selectedServings, ingredients, baseServings } = session;

  const pausedTimerCount = Object.values(timers || {}).filter((t) => normalizeTimerStatus(t.status) === "paused").length;
  const currentStep = steps[currentStepIndex];
  const isFirst = currentStepIndex === 0;
  const isLast  = currentStepIndex === steps.length - 1;

  const handlePrev = () => goToStep(currentStepIndex - 1);

  const handleConfirmCancel = () => {
    setCancelConfirmOpen(false);
    endSession();
  };

  const handleNext = () => {
    if (!completedSteps.includes(currentStepIndex)) {
      toggleStepComplete(currentStepIndex);
    }
    if (isLast) {
      completeSession();
    } else {
      goToStep(currentStepIndex + 1);
    }
  };

  const toggleStepIngredient = (stepIndex, ingredientKey) => {
    setCheckedStepIngredients((prev) => {
      const stepKey = String(stepIndex);
      const current = new Set(prev[stepKey] || []);
      if (current.has(ingredientKey)) {
        current.delete(ingredientKey);
      } else {
        current.add(ingredientKey);
      }
      return {
        ...prev,
        [stepKey]: Array.from(current)
      };
    });
  };

  const stepper = (
    <div
      className="cooking-stepper-overlay"
      role="presentation"
    >
      <div
        className={`cm-dialog${isComplete ? " cm-dialog--complete" : ""}`}
        role="dialog"
        aria-modal="true"
        aria-label={`Modo cocina: ${recipeName}`}
        onClick={(e) => e.stopPropagation()}
      >
        {isComplete ? (
          <CompletionScreen
            session={session}
            onCookAgain={endSession}
            onClose={endSession}
          />
        ) : (
          <>
          {/* ── Top bar ── */}
          <div className="cm-topbar">
            <div className="cm-topbar-left">
              <span className="cm-topbar-label">
                Paso {currentStepIndex + 1} de {steps.length}
              </span>
              <div className="cm-topbar-dots" aria-hidden="true">
                {steps.map((_, k) => (
                  <button
                    key={k}
                    type="button"
                    tabIndex={-1}
                    className={[
                      "cm-topbar-dot",
                      k < currentStepIndex ? "is-done" : "",
                      k === currentStepIndex ? "is-current" : "",
                    ].filter(Boolean).join(" ")}
                    onClick={() => goToStep(k)}
                  />
                ))}
              </div>
            </div>
            <div className="cm-topbar-right">
              {pausedTimerCount > 0 && (
                <span className="cm-topbar-paused" aria-label={`${pausedTimerCount} temporizador${pausedTimerCount !== 1 ? "es" : ""} en pausa`}>
                  ⏸ {pausedTimerCount}
                </span>
              )}
              {ingredients && ingredients.length > 0 && (
                <button
                  type="button"
                  className="cm-iconbtn"
                  onClick={() => setIngredientPanelOpen((v) => !v)}
                  aria-label="Ver ingredientes"
                  aria-expanded={ingredientPanelOpen}
                >
                  <ListIcon />
                </button>
              )}
              <button
                type="button"
                className="cm-iconbtn"
                onClick={minimizeStepper}
                aria-label="Minimizar modo cocina"
              >
                <MinimizeIcon />
              </button>
              <button
                type="button"
                className="cm-iconbtn cm-iconbtn--danger"
                onClick={() => setCancelConfirmOpen(true)}
                aria-label="Cancelar receta"
              >
                <XIcon />
              </button>
            </div>
          </div>

          {/* ── Gradient progress bar ── */}
          <div className="cm-progress" aria-hidden="true">
            <div
              className="cm-progress-fill"
              style={{ width: `${((currentStepIndex + 1) / steps.length) * 100}%` }}
              role="progressbar"
              aria-valuenow={currentStepIndex + 1}
              aria-valuemin={1}
              aria-valuemax={steps.length}
            />
          </div>

          {/* ── Scrollable step content ── */}
          <div className="cm-step-scroll">
            <ActiveTimersPanel
              session={session}
              tick={timerTick}
              onTimerAction={timerAction}
              onGoToStep={goToStep}
            />
            <RecipeStepCard
              step={currentStep}
              stepNumber={currentStepIndex + 1}
              totalSteps={steps.length}
              isComplete={completedSteps.includes(currentStepIndex)}
              timers={timers}
              executionId={session.executionId}
              recipeId={session.recipeId}
              timerTick={timerTick}
              onTimerAction={timerAction}
              onToggleComplete={() => toggleStepComplete(currentStepIndex)}
              allIngredients={ingredients || []}
              baseServings={baseServings || 4}
              selectedServings={selectedServings || 4}
              checkedIngredients={checkedStepIngredients[String(currentStep.index ?? currentStepIndex)] || []}
              onToggleIngredient={(ingredientKey) => toggleStepIngredient(currentStep.index ?? currentStepIndex, ingredientKey)}
            />
          </div>

          {/* ── Navigation ── */}
          <div className="cm-nav">
            <button
              type="button"
              className="cm-pill cm-pill--ghost cm-nav-prev"
              onClick={handlePrev}
              disabled={isFirst}
              aria-label="Paso anterior"
            >
              <ArrowLeftIcon />
              Anterior
            </button>
            {isLast ? (
              <button
                type="button"
                className="cm-pill cm-pill--ok cm-nav-next"
                onClick={handleNext}
                aria-label="Finalizar receta"
              >
                Finalizar <CheckIcon />
              </button>
            ) : (
              <button
                type="button"
                className="cm-pill cm-pill--primary cm-nav-next"
                onClick={handleNext}
                aria-label="Siguiente paso"
              >
                Siguiente <ArrowRightIcon />
              </button>
            )}
          </div>

          {/* ── Cancel sheet ── */}
          {cancelConfirmOpen ? (
            <CancelSheet
              onKeep={() => setCancelConfirmOpen(false)}
              onConfirm={handleConfirmCancel}
            />
          ) : null}

          {/* ── Ingredient sheet (unchanged) ── */}
          {ingredientPanelOpen && ingredients && ingredients.length > 0 ? (
            <>
              <div
                className="cooking-ing-backdrop"
                role="presentation"
                onClick={() => setIngredientPanelOpen(false)}
              />
              <div
                className="cooking-ing-sheet"
                role="dialog"
                aria-modal="true"
                aria-label="Lista de ingredientes"
              >
                <div className="cooking-ing-handle" aria-hidden="true" />
                <div className="cooking-ing-header">
                  <div>
                    <h3 className="cooking-ing-title">Todos los ingredientes</h3>
                    <p className="cooking-ing-sub">
                      Para {selectedServings} {selectedServings === 1 ? "persona" : "personas"}
                    </p>
                  </div>
                  <button
                    type="button"
                    className="cooking-ing-close"
                    onClick={() => setIngredientPanelOpen(false)}
                    aria-label="Cerrar lista de ingredientes"
                  >
                    <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" aria-hidden="true">
                      <path d="M6 6l12 12M18 6l-12 12" />
                    </svg>
                  </button>
                </div>
                <ul className="cooking-ing-list">
                  {ingredients.map((ing, idx) => {
                    const qty = displayIngredientQuantity(ing, baseServings, selectedServings);
                    return (
                      <li key={idx} className="cooking-ing-row">
                        <span className="cooking-ing-name">{ing.name}</span>
                        {qty ? <span className="cooking-ing-qty">{qty}</span> : null}
                      </li>
                    );
                  })}
                </ul>
              </div>
            </>
          ) : null}
          </>
        )}
      </div>
    </div>
  );

  return createPortal(stepper, document.body);
}
