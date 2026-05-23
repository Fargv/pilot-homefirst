import React, { useState } from "react";
import { useWeeklyChallenge } from "../../contexts/WeeklyChallengeContext.jsx";
import { useOnboarding } from "../../contexts/OnboardingContext.jsx";
import BitesIcon from "../BitesIcon.jsx";

function TrophyIcon() {
  return (
    <svg viewBox="0 0 20 20" fill="none" width={14} height={14}>
      <path d="M10 13c-3.3 0-6-2.7-6-6V4h12v3c0 3.3-2.7 6-6 6z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round"/>
      <path d="M7 4V2.5M13 4V2.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
      <path d="M10 13v3M7 16h6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
      <path d="M4 4H2v2a2 2 0 0 0 2 2M16 4h2v2a2 2 0 0 0-2 2" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
  );
}

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

function StarIcon() {
  return (
    <svg viewBox="0 0 20 20" fill="none" width={14} height={14}>
      <path d="M10 2l2.09 4.26L17 7.27l-3.5 3.41.83 4.82L10 13.25l-4.33 2.25.83-4.82L3 7.27l4.91-.71L10 2z"
        fill="#f59e0b" stroke="#f59e0b" strokeWidth="1" strokeLinejoin="round" />
    </svg>
  );
}

function WeeklyRewardToast({ event, onDismiss }) {
  if (!event) return null;
  const totalBites = (event.challenges || []).reduce((s, c) => s + (c.rewardBites || 0), 0)
    + (event.bonusCompleted ? (event.bonusBites || 0) : 0);
  return (
    <div className="onboarding-reward-toast-wrap" onClick={onDismiss}>
      <div className="onboarding-reward-toast">
        <div className="onboarding-reward-toast-icon">
          <StarIcon />
        </div>
        <div>
          <p className="onboarding-reward-toast-title">&#161;Reto semanal completado!</p>
          {event.challenges?.map((c) => (
            <p key={c.key} className="onboarding-reward-toast-subtitle">{c.title}</p>
          ))}
          {event.bonusCompleted && (
            <p className="onboarding-reward-toast-subtitle">&#127873; Bonus desbloqueado</p>
          )}
        </div>
        <div className="onboarding-reward-toast-bites">
          <BitesIcon size={14} />
          <span>+{totalBites}</span>
        </div>
      </div>
    </div>
  );
}

function ChallengeRow({ challenge }) {
  const [expanded, setExpanded] = useState(false);
  const { completed, title, description, guidance, rewardBites, progress, target } = challenge;

  const hasProgress = typeof progress === "number" && typeof target === "number" && target > 1;
  const progressPct = hasProgress ? Math.min(100, Math.round((progress / target) * 100)) : 0;

  return (
    <div
      className={`weekly-challenge-row${completed ? " is-completed" : ""}`}
      onClick={() => !completed && setExpanded((v) => !v)}
    >
      <div className="weekly-challenge-row-main">
        <div className={`weekly-challenge-status${completed ? " is-done" : ""}`}>
          {completed ? <CheckIcon /> : <span className="weekly-challenge-circle" />}
        </div>
        <div className="weekly-challenge-content">
          <div className="weekly-challenge-title-row">
            <span className="weekly-challenge-title">{title}</span>
            <span className="onboarding-reward-badge weekly-challenge-reward">
              <BitesIcon size={12} />
              +{rewardBites}
            </span>
          </div>
          {hasProgress && !completed && (
            <div className="weekly-challenge-mini-progress">
              <div className="weekly-challenge-mini-bar">
                <div style={{ width: `${progressPct}%` }} />
              </div>
              <span>{progress}/{target}</span>
            </div>
          )}
          {expanded && !completed && (guidance || description) && (
            <p className="weekly-challenge-guidance">{guidance || description}</p>
          )}
        </div>
      </div>
    </div>
  );
}

function BonusRow({ bonus }) {
  if (!bonus) return null;
  const { title, rewardBites, completed, available } = bonus;

  return (
    <div className={`weekly-challenge-bonus-row${completed ? " is-completed" : available ? " is-available" : " is-locked"}`}>
      <div className="weekly-challenge-bonus-icon">
        {completed ? <CheckIcon /> : available ? <StarIcon /> : <LockIcon />}
      </div>
      <div className="weekly-challenge-content">
        <div className="weekly-challenge-title-row">
          <span className="weekly-challenge-title">{title}</span>
          <span className="onboarding-reward-badge weekly-challenge-reward">
            <BitesIcon size={12} />
            +{rewardBites}
          </span>
        </div>
        {!available && !completed && (
          <p className="weekly-challenge-locked-copy">Completa todos los retos para desbloquear</p>
        )}
      </div>
    </div>
  );
}

export default function WeeklyChallengeCard() {
  const { state: weeklyState, rewardEvent, dismissReward } = useWeeklyChallenge();
  const { state: onboardingState } = useOnboarding();
  const [collapsed, setCollapsed] = useState(false);

  if (!onboardingState || onboardingState.status !== "completed") return null;
  if (!weeklyState) return null;

  if (collapsed) {
    return (
      <>
        <button type="button" onClick={() => setCollapsed(false)} className="onboarding-guide-pill weekly-challenge-pill">
          <TrophyIcon />
          <span>{weeklyState.completedCount}/{weeklyState.totalCount}</span>
          <BitesIcon size={12} />
        </button>
        {rewardEvent && <WeeklyRewardToast event={rewardEvent} onDismiss={dismissReward} />}
      </>
    );
  }

  return (
    <>
      <div className="weekly-challenge-card">
        <div className="weekly-challenge-top">
          <div className="weekly-challenge-heading">
            <TrophyIcon />
            <span>RETOS SEMANALES</span>
          </div>
          <div className="onboarding-guide-actions">
            <span>{weeklyState.completedCount}/{weeklyState.totalCount}</span>
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
          <div style={{ width: `${weeklyState.progressPercent}%` }} />
        </div>

        <div className="weekly-challenge-week-label">
          Semana {weeklyState.cycleWeekIndex} de 4
        </div>

        <div className="weekly-challenge-list">
          {(weeklyState.challenges || []).map((c) => (
            <ChallengeRow key={c.key} challenge={c} />
          ))}
        </div>

        {weeklyState.bonus && (
          <div className="weekly-challenge-bonus-section">
            <div className="weekly-challenge-bonus-divider">BONUS</div>
            <BonusRow bonus={weeklyState.bonus} />
          </div>
        )}

        <div className="weekly-challenge-footer">
          <BitesIcon size={12} />
          <span>
            <strong>{weeklyState.totalBitesEarned || 0}</strong>
            <span> / {weeklyState.totalBitesAvailable} bites</span>
          </span>
        </div>
      </div>

      {rewardEvent && <WeeklyRewardToast event={rewardEvent} onDismiss={dismissReward} />}
    </>
  );
}
