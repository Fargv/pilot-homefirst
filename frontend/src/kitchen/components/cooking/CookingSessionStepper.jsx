import React, { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { useCookingSession } from "../../contexts/CookingSessionContext.jsx";
import RecipeStepCard from "./RecipeStepCard.jsx";
import { formatDuration } from "../../utils/recipeStepParser.js";
import { displayIngredientQuantity } from "../../utils/recipeScaling.js";

// ─── Completion screen ────────────────────────────────────────────────────────

function CompletionScreen({ session, onCookAgain, onClose }) {
  const elapsed = session.startedAt
    ? Math.round((Date.now() - new Date(session.startedAt).getTime()) / 1000)
    : null;

  return (
    <div className="cooking-completion">
      <div className="cooking-completion-emoji" aria-hidden="true">🎉</div>
      <h2 className="cooking-completion-title">¡Receta completada!</h2>
      <p className="cooking-completion-recipe">{session.recipeName}</p>

      <div className="cooking-completion-stats">
        {elapsed ? (
          <div className="cooking-completion-stat">
            <span className="cooking-completion-stat-value">{formatDuration(elapsed)}</span>
            <span className="cooking-completion-stat-label">Tiempo total</span>
          </div>
        ) : null}
        <div className="cooking-completion-stat">
          <span className="cooking-completion-stat-value">{session.selectedServings}</span>
          <span className="cooking-completion-stat-label">
            {session.selectedServings === 1 ? "persona" : "personas"}
          </span>
        </div>
        <div className="cooking-completion-stat">
          <span className="cooking-completion-stat-value">{session.steps.length}</span>
          <span className="cooking-completion-stat-label">
            {session.steps.length === 1 ? "paso" : "pasos"}
          </span>
        </div>
      </div>

      <div className="cooking-completion-actions">
        <button type="button" className="cooking-cta" onClick={onCookAgain}>
          Cocinar de nuevo
        </button>
        <button type="button" className="cooking-btn-secondary" onClick={onClose}>
          Cerrar
        </button>
      </div>
    </div>
  );
}

// ─── Chevron icons ────────────────────────────────────────────────────────────

function ChevronLeft() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" width="22" height="22" fill="none"
      stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M15 18l-6-6 6-6" />
    </svg>
  );
}

function ChevronRight() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" width="22" height="22" fill="none"
      stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M9 18l6-6-6-6" />
    </svg>
  );
}

function ChevronDown() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" width="20" height="20" fill="none"
      stroke="currentColor" strokeWidth="2" strokeLinecap="round">
      <path d="M19 9l-7 7-7-7" />
    </svg>
  );
}

// ─── Main stepper ─────────────────────────────────────────────────────────────

export default function CookingSessionStepper() {
  const [cancelConfirmOpen, setCancelConfirmOpen] = useState(false);
  const [ingredientPanelOpen, setIngredientPanelOpen] = useState(false);
  const {
    session,
    isStepperOpen,
    endSession,
    goToStep,
    toggleStepComplete,
    completeSession,
    minimizeStepper,
    timerAction,
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
        if (ingredientPanelOpen) {
          setIngredientPanelOpen(false);
        } else {
          minimizeStepper();
        }
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [isStepperOpen, session, goToStep, minimizeStepper, ingredientPanelOpen]);

  useEffect(() => {
    if (!isStepperOpen || !session) {
      setCancelConfirmOpen(false);
    }
  }, [isStepperOpen, session]);

  if (!session || !isStepperOpen) return null;

  const { steps, currentStepIndex, completedSteps, timers, isComplete, recipeName, selectedServings, ingredients, baseServings } = session;

  const pausedTimerCount = Object.values(timers || {}).filter((t) => t.status === "paused").length;
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

  const stepper = (
    <div
      className="cooking-stepper-overlay"
      role="dialog"
      aria-modal="true"
      aria-label={`Modo cocina: ${recipeName}`}
    >
      {isComplete ? (
        <CompletionScreen
          session={session}
          onCookAgain={endSession}
          onClose={endSession}
        />
      ) : (
        <>
          {/* ── Header ── */}
          <div className="cooking-stepper-header">
            <div className="cooking-stepper-header-info">
              <h2 className="cooking-stepper-recipe-name">{recipeName}</h2>
              <p className="cooking-stepper-servings">
                Para {selectedServings} {selectedServings === 1 ? "persona" : "personas"}
              </p>
            </div>
            <div className="cooking-stepper-header-right">
              {pausedTimerCount > 0 && (
                <span className="cooking-stepper-paused-hint" aria-label={`${pausedTimerCount} temporizador${pausedTimerCount !== 1 ? "es" : ""} en pausa`}>
                  ⏸ {pausedTimerCount} en pausa
                </span>
              )}
              {ingredients && ingredients.length > 0 ? (
                <button
                  type="button"
                  className="cooking-stepper-ingredients-btn"
                  onClick={() => setIngredientPanelOpen((v) => !v)}
                  aria-label="Ver ingredientes"
                  aria-expanded={ingredientPanelOpen}
                >
                  <svg viewBox="0 0 20 20" width="16" height="16" fill="none" aria-hidden="true" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M3 5h14M3 10h14M3 15h8" />
                  </svg>
                  Ver ingredientes
                </button>
              ) : null}
              <button
                type="button"
                className="cooking-stepper-cancel"
                onClick={() => setCancelConfirmOpen(true)}
              >
                Cancelar
              </button>
              <button
                type="button"
                className="cooking-stepper-minimize"
                onClick={minimizeStepper}
                aria-label="Minimizar modo cocina"
              >
                <ChevronDown />
              </button>
            </div>
          </div>

          {/* ── Progress ── */}
          <div
            className="cooking-progress-row"
            aria-label={`Paso ${currentStepIndex + 1} de ${steps.length}`}
          >
            <span className="cooking-progress-label">
              Paso {currentStepIndex + 1} de {steps.length}
            </span>
            <div
              className="cooking-progress-bar"
              role="progressbar"
              aria-valuenow={currentStepIndex + 1}
              aria-valuemin={1}
              aria-valuemax={steps.length}
            >
              <div
                className="cooking-progress-fill"
                style={{ width: `${Math.round(((currentStepIndex + 1) / steps.length) * 100)}%` }}
              />
            </div>
          </div>

          {/* ── Step dots ── */}
          <div className="cooking-step-dots" aria-hidden="true">
            {steps.map((_, i) => (
              <button
                key={i}
                type="button"
                className={[
                  "cooking-step-dot",
                  i === currentStepIndex ? "is-current" : "",
                  completedSteps.includes(i) ? "is-done" : "",
                ].filter(Boolean).join(" ")}
                onClick={() => goToStep(i)}
                tabIndex={-1}
              />
            ))}
          </div>

          {/* ── Step area ── */}
          <div className="cooking-step-area">
            <RecipeStepCard
              step={currentStep}
              stepNumber={currentStepIndex + 1}
              totalSteps={steps.length}
              isComplete={completedSteps.includes(currentStepIndex)}
              timers={timers}
              onTimerAction={timerAction}
              onToggleComplete={() => toggleStepComplete(currentStepIndex)}
              allIngredients={ingredients || []}
              baseServings={baseServings || 4}
              selectedServings={selectedServings || 4}
            />
          </div>

          {/* ── Navigation ── */}
          <div className="cooking-nav">
            <button
              type="button"
              className="cooking-nav-btn cooking-nav-prev"
              onClick={handlePrev}
              disabled={isFirst}
              aria-label="Paso anterior"
            >
              <ChevronLeft />
              Anterior
            </button>
            <button
              type="button"
              className="cooking-nav-btn cooking-nav-next"
              onClick={handleNext}
              aria-label={isLast ? "Finalizar receta" : "Siguiente paso"}
            >
              {isLast ? "Finalizar" : "Siguiente"}
              {!isLast && <ChevronRight />}
            </button>
          </div>

          {cancelConfirmOpen ? (
            <div className="cooking-cancel-confirm-backdrop" role="presentation">
              <div
                className="cooking-cancel-confirm"
                role="alertdialog"
                aria-modal="true"
                aria-labelledby="cooking-cancel-title"
                aria-describedby="cooking-cancel-body"
              >
                <h3 id="cooking-cancel-title">¿Cancelar receta?</h3>
                <p id="cooking-cancel-body">Se perderá el progreso de esta elaboración.</p>
                <div className="cooking-cancel-confirm-actions">
                  <button
                    type="button"
                    className="cooking-btn-secondary"
                    onClick={() => setCancelConfirmOpen(false)}
                  >
                    Seguir cocinando
                  </button>
                  <button
                    type="button"
                    className="cooking-danger-btn"
                    onClick={handleConfirmCancel}
                  >
                    Cancelar receta
                  </button>
                </div>
              </div>
            </div>
          ) : null}

          {/* ── Ingredient sheet (fixed overlay; timers keep running behind it) ── */}
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
  );

  return createPortal(stepper, document.body);
}
