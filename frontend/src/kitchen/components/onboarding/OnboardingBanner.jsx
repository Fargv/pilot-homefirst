import React, { useState } from "react";
import { useOnboarding } from "../../contexts/OnboardingContext.jsx";
import OnboardingPanel from "./OnboardingPanel.jsx";
import BitesIcon from "../BitesIcon.jsx";

function StarIcon() {
  return (
    <svg viewBox="0 0 20 20" fill="none" width={14} height={14}>
      <path d="M10 2l2.09 4.26L17 7.27l-3.5 3.41.83 4.82L10 13.25l-4.33 2.25.83-4.82L3 7.27l4.91-.71L10 2z"
        fill="#f59e0b" stroke="#f59e0b" strokeWidth="1" strokeLinejoin="round" />
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
          <p className="onboarding-reward-toast-title">{"\u00a1Reto completado!"}</p>
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

export default function OnboardingBanner() {
  const { state, rewardEvent, dismissReward } = useOnboarding();
  const [panelOpen, setPanelOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(false);

  if (!state || state.status === "disabled") return null;
  if (state.status === "completed") {
    return (
      <>
        {rewardEvent && <RewardToast event={rewardEvent} onDismiss={dismissReward} />}
      </>
    );
  }

  const next = state.nextChallenge;

  if (collapsed) {
    return (
      <>
        <button type="button" onClick={() => setCollapsed(false)} className="onboarding-guide-pill">
          <StarIcon />
          <span>{state.completedCount}/{state.totalCount}</span>
          <BitesIcon size={12} />
        </button>
        {rewardEvent && <RewardToast event={rewardEvent} onDismiss={dismissReward} />}
      </>
    );
  }

  return (
    <>
      <div className="onboarding-guide-card">
        <div className="onboarding-guide-top">
          <div className="onboarding-guide-heading">
            <StarIcon />
            <span>{"GU\u00cdA DE INICIO"}</span>
          </div>
          <div className="onboarding-guide-actions">
            <span>{state.completedCount}/{state.totalCount}</span>
            <button
              type="button"
              onClick={() => setCollapsed(true)}
              className="onboarding-guide-minimize"
              aria-label="Minimizar"
            >
              -
            </button>
          </div>
        </div>

        <div className="onboarding-progress onboarding-progress-compact">
          <div style={{ width: `${state.progressPercent}%` }} />
        </div>

        {next ? (
          <div className="onboarding-guide-next" onClick={() => setPanelOpen(true)}>
            <p className="onboarding-guide-kicker">{"Pr\u00f3ximo reto:"}</p>
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
          <p className="onboarding-guide-complete">{"\u00a1Todos los retos completados!"}</p>
        )}

        <button type="button" onClick={() => setPanelOpen(true)} className="onboarding-guide-view-all">
          Ver todos los retos
        </button>
      </div>

      {panelOpen && <OnboardingPanel onClose={() => setPanelOpen(false)} />}
      {rewardEvent && <RewardToast event={rewardEvent} onDismiss={dismissReward} />}

      <style>{`
        @keyframes onboardingToastIn {
          from { opacity: 0; transform: translateX(-50%) translateY(20px) scale(0.9); }
          to { opacity: 1; transform: translateX(-50%) translateY(0) scale(1); }
        }
      `}</style>
    </>
  );
}
