import React, { useState } from "react";
import { useOnboarding } from "../../contexts/OnboardingContext.jsx";
import BitesIcon from "../BitesIcon.jsx";

const PHASE_COLORS = {
  1: { bg: "var(--info-bg, #eef2ff)", border: "var(--info-border, #c7d2fe)", accent: "var(--info-text, #4338ca)" },
  2: { bg: "var(--warning-bg, #fefce8)", border: "var(--warning-border, #fde68a)", accent: "var(--warning-text, #d97706)" },
  3: { bg: "var(--success-bg, #f0fdf4)", border: "var(--success-border, #bbf7d0)", accent: "var(--success-text, #16a34a)" },
  4: { bg: "var(--premium-bg, #fff7ed)", border: "var(--premium-border, #fed7aa)", accent: "var(--premium-text, #ea580c)" },
  5: { bg: "var(--chip-active-bg, #fdf2f8)", border: "var(--chip-border, #f5d0fe)", accent: "var(--chip-active-text, #9333ea)" },
  6: { bg: "var(--chip-bg, #f0f9ff)", border: "var(--chip-border, #bae6fd)", accent: "var(--chip-text, #0284c7)" },
  7: { bg: "var(--danger-bg, #fff1f2)", border: "var(--danger-border, #fecdd3)", accent: "var(--danger-text, #e11d48)" }
};

const EXPLORE_SCREEN_LABELS = {
  visit_week: "Planificaci\u00f3n",
  visit_dishes: "Cocina",
  visit_shopping: "Lista de la compra",
  visit_catalog: "Cat\u00e1logo",
  visit_settings: "Ajustes"
};

function CheckIcon() {
  return (
    <svg viewBox="0 0 20 20" fill="none" width={16} height={16}>
      <circle cx="10" cy="10" r="9" fill="currentColor" />
      <path d="M6 10.5l3 3 5-6" stroke="var(--text-inverse, #fff)" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function LockIcon() {
  return (
    <svg viewBox="0 0 20 20" fill="none" width={14} height={14}>
      <rect x="4" y="9" width="12" height="9" rx="2" stroke="currentColor" strokeWidth="1.5" />
      <path d="M7 9V7a3 3 0 1 1 6 0v2" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}

function ScreenCheckItem({ triggerKey, visited }) {
  const label = EXPLORE_SCREEN_LABELS[triggerKey] || triggerKey;
  return (
    <div className={`onboarding-screen-check ${visited ? "is-visited" : ""}`}>
      {visited ? (
        <svg viewBox="0 0 16 16" fill="none" width={14} height={14}>
          <circle cx="8" cy="8" r="7" fill="currentColor" />
          <path d="M5 8.5l2.2 2.2 4-4.5" stroke="var(--text-inverse, #fff)" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      ) : (
        <svg viewBox="0 0 16 16" fill="none" width={14} height={14}>
          <circle cx="8" cy="8" r="7" stroke="currentColor" strokeWidth="1.5" />
        </svg>
      )}
      <span>{label}</span>
    </div>
  );
}

function PhaseHeader({ phase, label, color }) {
  return (
    <div
      className="onboarding-phase-header"
      style={{
        "--onboarding-phase-bg": color.bg,
        "--onboarding-phase-border": color.border,
        "--onboarding-phase-accent": color.accent
      }}
    >
      <span>Fase {phase} - {label}</span>
    </div>
  );
}

function ChallengeRow({ challenge, isNext, isLocked, exploreProgress }) {
  const [expanded, setExpanded] = useState(isNext);
  const isExplore = challenge.key === "explore_app";
  const stateClass = challenge.completed ? "is-completed" : isLocked ? "is-locked" : isNext ? "is-active" : "";

  return (
    <div className={`onboarding-challenge-row ${stateClass}`}>
      <div
        className="onboarding-challenge-summary"
        onClick={() => !isLocked && !challenge.completed && setExpanded((v) => !v)}
      >
        <div className="onboarding-challenge-status" aria-hidden="true">
          {challenge.completed ? <CheckIcon /> : isLocked ? <LockIcon /> : <span />}
        </div>
        <div className="onboarding-challenge-content">
          <div className="onboarding-challenge-title-row">
            <span className="onboarding-challenge-title">{challenge.title}</span>
            <span className="onboarding-reward-badge onboarding-challenge-reward">
              <BitesIcon size={12} />
              +{challenge.rewardBites}
            </span>
          </div>
          {isNext && !expanded && (
            <p className="onboarding-challenge-description">{challenge.description}</p>
          )}
          {isLocked && (
            <p className="onboarding-challenge-locked-copy">Completa el reto anterior para desbloquear</p>
          )}
        </div>
      </div>

      {expanded && !challenge.completed && !isLocked && (
        <div className="onboarding-challenge-detail">
          <p className="onboarding-challenge-description">{challenge.description}</p>
          {isExplore && exploreProgress && (
            <div className="onboarding-challenge-note">
              <p className="onboarding-challenge-note-title">
                Pantallas visitadas: {exploreProgress.count}/{exploreProgress.total}
              </p>
              <div className="onboarding-screen-check-list">
                {exploreProgress.required.map((key) => (
                  <ScreenCheckItem
                    key={key}
                    triggerKey={key}
                    visited={exploreProgress.visited.includes(key)}
                  />
                ))}
              </div>
            </div>
          )}
          {challenge.howTo && (
            <div className="onboarding-challenge-hint">
              <p>{challenge.howTo}</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default function OnboardingPanel({ onClose }) {
  const { state } = useOnboarding();

  if (!state) return null;

  const challenges = state.challenges || [];
  const phases = [...new Set(challenges.map((c) => c.phase))].sort((a, b) => a - b);
  const nextChallenge = state.nextChallenge;
  const isCompleted = state.status === "completed";

  return (
    <div className="onboarding-panel-backdrop" onClick={onClose}>
      <div className="onboarding-panel-sheet" onClick={(e) => e.stopPropagation()}>
        <div className="onboarding-panel-header">
          <div className="onboarding-panel-title-row">
            <div>
              <h3>{"Tu gu\u00eda de inicio"}</h3>
              <p>Completa los retos para ganar Bites</p>
            </div>
            <button type="button" onClick={onClose} className="onboarding-panel-close" aria-label="Cerrar">
              x
            </button>
          </div>

          <div className="onboarding-panel-progress-row">
            <div className={`onboarding-progress ${isCompleted ? "is-completed" : ""}`}>
              <div style={{ width: `${state.progressPercent}%` }} />
            </div>
            <span>{state.completedCount}/{state.totalCount}</span>
          </div>

          <div className="onboarding-panel-bites">
            <BitesIcon size={14} />
            <span>
              <strong>{(state.totalBitesEarned || 0) + 20}</strong>
              <span> / {state.totalBitesAvailable} bites ganados</span>
            </span>
          </div>
        </div>

        <div className="onboarding-panel-scroll">
          {isCompleted ? (
            <div className="onboarding-completed-state">
              <div className="onboarding-completed-icon">
                <svg viewBox="0 0 24 24" fill="none" width={26} height={26}>
                  <path d="M5 12l5 5L20 7" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </div>
              <h4>{"\u00a1Gu\u00eda completada!"}</h4>
              <p>Ya conoces Lunchfy a fondo. Sigue planificando y disfrutando de la app.</p>
            </div>
          ) : (
            phases.map((phase) => {
              const phaseChallenges = challenges.filter((c) => c.phase === phase);
              const phaseLabel = phaseChallenges[0]?.phaseLabel || `Fase ${phase}`;
              const color = PHASE_COLORS[phase] || PHASE_COLORS[1];

              return (
                <div key={phase} className="onboarding-phase-group">
                  <PhaseHeader phase={phase} label={phaseLabel} color={color} />
                  {phaseChallenges.map((c) => {
                    const isNext = nextChallenge?.key === c.key;
                    const isLocked = !c.completed && !isNext;
                    return (
                      <ChallengeRow
                        key={c.key}
                        challenge={c}
                        isNext={isNext}
                        isLocked={isLocked}
                        exploreProgress={state.exploreProgress}
                      />
                    );
                  })}
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}
