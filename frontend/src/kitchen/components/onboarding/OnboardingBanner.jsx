import React, { useEffect, useState } from "react";
import { useOnboarding } from "../../contexts/OnboardingContext.jsx";
import { useWeeklyChallenge } from "../../contexts/WeeklyChallengeContext.jsx";
import { useAuth } from "../../auth.jsx";
import { canUseDinnersFeature } from "../../subscription.js";
import OnboardingPanel from "./OnboardingPanel.jsx";
import BitesIcon from "../BitesIcon.jsx";

const COLLAPSED_KEY = "lunchfy_onboarding_banner_collapsed";

function readCollapsedPref() {
  try {
    return localStorage.getItem(COLLAPSED_KEY) === "1";
  } catch {
    return false;
  }
}

function writeCollapsedPref(v) {
  try {
    localStorage.setItem(COLLAPSED_KEY, v ? "1" : "0");
  } catch {
    // ignore
  }
}

function StarIcon() {
  return (
    <svg viewBox="0 0 20 20" fill="none" width={14} height={14}>
      <path d="M10 2l2.09 4.26L17 7.27l-3.5 3.41.83 4.82L10 13.25l-4.33 2.25.83-4.82L3 7.27l4.91-.71L10 2z"
        fill="#f59e0b" stroke="#f59e0b" strokeWidth="1" strokeLinejoin="round" />
    </svg>
  );
}

function ChevronDownIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" width={14} height={14}>
      <path d="m6 9 6 6 6-6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function ChevronUpIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" width={14} height={14}>
      <path d="m18 15-6-6-6 6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function RewardToast({ event, onDismiss }) {
  if (!event) return null;
  return (
    <div className="onboarding-reward-toast-wrap" onClick={onDismiss}>
      <div className="onboarding-reward-toast">
        <div className="onboarding-reward-toast-icon">
          <StarIcon />
        </div>
        <div>
          <p className="onboarding-reward-toast-title">{"¡Reto completado!"}</p>
          <p className="onboarding-reward-toast-subtitle">{event.title}</p>
        </div>
        <div className="onboarding-reward-toast-bites">
          <BitesIcon size={14} />
          <span>+{event.rewardBites}</span>
        </div>
      </div>
    </div>
  );
}

/** Small tasteful note shown before Beta Pro is unlocked */
function BetaProHint({ onboardingDone, weeklyState }) {
  const { user } = useAuth();
  const plan = String(user?.subscriptionPlan || "basic").toLowerCase();
  const planSource = user?.planSource || "";

  // Only show for basic users who haven't unlocked Beta Pro yet
  if (plan === "pro" || plan === "premium") return null;
  if (planSource === "beta_pro" || user?.betaProActive === true) return null;

  // Calculate whether conditions are getting close (show hint when onboarding OR weekly not done)
  const weeklyComplete = weeklyState && weeklyState.completedCount >= weeklyState.totalCount && weeklyState.totalCount > 0;
  const allDone = onboardingDone && weeklyComplete;
  if (allDone) return null;

  return (
    <div className="onboarding-beta-pro-hint">
      <span className="onboarding-beta-pro-hint-icon">⭐</span>
      <span>Completa el onboarding y todos los retos de tu primera semana para desbloquear <strong>Pro Beta</strong>.</span>
    </div>
  );
}

/** Celebratory modal shown once when the onboarding guide is fully completed. */
function OnboardingCompletionModal({ onDismiss }) {
  return (
    <div
      className="onboarding-completion-backdrop"
      role="dialog"
      aria-modal="true"
      aria-labelledby="onboarding-completion-title"
    >
      <div className="onboarding-completion-modal" onClick={(e) => e.stopPropagation()}>
        <button
          type="button"
          className="onboarding-completion-close-x"
          onClick={onDismiss}
          aria-label="Cerrar"
        >
          ×
        </button>

        <div className="onboarding-completion-icon" aria-hidden="true">🎉</div>

        <h2 className="onboarding-completion-title" id="onboarding-completion-title">
          ¡Enhorabuena!
        </h2>
        <p className="onboarding-completion-subtitle">
          Has completado el onboarding de Lunchfy.
        </p>

        <div className="onboarding-completion-areas">
          <p className="onboarding-completion-areas-label">Ya conoces lo esencial:</p>
          <ul className="onboarding-completion-areas-list">
            <li><span aria-hidden="true">📅</span> <strong>Planificación</strong> — organiza tu semana de comidas</li>
            <li><span aria-hidden="true">🍳</span> <strong>Cocina</strong> — gestiona tus platos</li>
            <li><span aria-hidden="true">🥕</span> <strong>Productos</strong> — tu despensa digital</li>
            <li><span aria-hidden="true">🛒</span> <strong>Lista</strong> — siempre al día y automática</li>
            <li><span aria-hidden="true">📦</span> <strong>Básicos</strong> — lo que compras cada semana</li>
            <li><span aria-hidden="true">📚</span> <strong>Catálogo</strong> — platos listos para usar</li>
          </ul>
        </div>

        <div className="onboarding-completion-next-hint">
          <p>
            Ahora tienes acceso a los <strong>retos semanales</strong>.
            Completa los de tu primera semana para desbloquear <strong>Pro Beta</strong> si eres elegible.
          </p>
        </div>

        <div className="onboarding-completion-actions">
          <button
            type="button"
            className="kitchen-ui-button onboarding-completion-cta"
            onClick={onDismiss}
          >
            Ver retos semanales
          </button>
          <button
            type="button"
            className="onboarding-completion-secondary"
            onClick={onDismiss}
          >
            Continuar
          </button>
        </div>
      </div>
    </div>
  );
}

export default function OnboardingBanner({ suppressEvents = false } = {}) {
  const { state, rewardEvent, dismissReward, completionEvent, dismissCompletionEvent } = useOnboarding();
  const { state: weeklyState } = useWeeklyChallenge();
  const [panelOpen, setPanelOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(readCollapsedPref);

  const toggleCollapsed = (next) => {
    writeCollapsedPref(next);
    setCollapsed(next);
  };

  if (!state || state.status === "disabled") return null;
  if (state.status === "completed") {
    return (
      <>
        {!suppressEvents && completionEvent && <OnboardingCompletionModal onDismiss={dismissCompletionEvent} />}
        {!suppressEvents && rewardEvent && <RewardToast event={rewardEvent} onDismiss={dismissReward} />}
      </>
    );
  }

  const next = state.nextChallenge;
  // Fix: totalCount is always available from onboarding state
  const completedCount = state.completedCount ?? 0;
  const totalCount = state.totalCount ?? 0;
  const progressPercent = state.progressPercent ?? 0;

  if (collapsed) {
    return (
      <>
        <div className="onboarding-guide-slim" role="region" aria-label="Guía de inicio">
          <div className="onboarding-guide-slim-top">
            <div className="onboarding-guide-slim-heading">
              <StarIcon />
              <span className="onboarding-guide-slim-title">Guía de inicio</span>
            </div>
            <div className="onboarding-guide-slim-right">
              <span className="onboarding-guide-slim-count">
                {completedCount}/{totalCount} completados
              </span>
              <button
                type="button"
                onClick={() => toggleCollapsed(false)}
                className="onboarding-guide-collapse-btn"
                aria-label="Expandir guía"
              >
                <ChevronDownIcon />
              </button>
            </div>
          </div>
          <div className="onboarding-progress onboarding-progress-compact" style={{ marginBottom: 0 }}>
            <div style={{ width: `${progressPercent}%` }} />
          </div>
        </div>
        {!suppressEvents && rewardEvent && <RewardToast event={rewardEvent} onDismiss={dismissReward} />}
      </>
    );
  }

  return (
    <>
      <div className="onboarding-guide-card">
        <div className="onboarding-guide-top">
          <div className="onboarding-guide-heading">
            <StarIcon />
            <span>{"GUÍA DE INICIO"}</span>
          </div>
          <div className="onboarding-guide-actions">
            <span>{completedCount}/{totalCount}</span>
            <button
              type="button"
              onClick={() => toggleCollapsed(true)}
              className="onboarding-guide-minimize"
              aria-label="Minimizar"
            >
              <ChevronUpIcon />
            </button>
          </div>
        </div>

        <div className="onboarding-progress onboarding-progress-compact">
          <div style={{ width: `${progressPercent}%` }} />
        </div>

        {/* Pre-unlock Beta Pro hint */}
        <BetaProHint onboardingDone={false} weeklyState={weeklyState} />

        {next ? (
          <div className="onboarding-guide-next" onClick={() => setPanelOpen(true)}>
            <p className="onboarding-guide-kicker">{"Próximo reto:"}</p>
            <div className="onboarding-guide-next-row">
              <p className="onboarding-guide-next-title">{next.title}</p>
              <span className="onboarding-reward-badge">
                <BitesIcon size={13} />
                +{next.rewardBites}
              </span>
            </div>
            {next.key === "explore_app" && state.exploreProgress ? (
              <div className="onboarding-guide-subprogress">
                <div className="onboarding-progress onboarding-progress-mini">
                  <div style={{ width: `${(state.exploreProgress.count / state.exploreProgress.total) * 100}%` }} />
                </div>
                <span>{state.exploreProgress.count}/{state.exploreProgress.total} pantallas</span>
              </div>
            ) : next.howTo ? (
              <p className="onboarding-guide-howto">{next.howTo}</p>
            ) : null}
          </div>
        ) : (
          <p className="onboarding-guide-complete">{"¡Todos los retos completados!"}</p>
        )}

        <button type="button" onClick={() => setPanelOpen(true)} className="onboarding-guide-view-all">
          Ver todos los retos
        </button>
      </div>

      {panelOpen && <OnboardingPanel onClose={() => setPanelOpen(false)} />}
      {!suppressEvents && rewardEvent && <RewardToast event={rewardEvent} onDismiss={dismissReward} />}

      <style>{`
        @keyframes onboardingToastIn {
          from { opacity: 0; transform: translateX(-50%) translateY(20px) scale(0.9); }
          to { opacity: 1; transform: translateX(-50%) translateY(0) scale(1); }
        }
      `}</style>
    </>
  );
}
