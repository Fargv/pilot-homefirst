import React, { useCallback, useEffect, useRef, useState } from "react";
import { useLocation } from "react-router-dom";
import { useWeeklyChallenge } from "../../contexts/WeeklyChallengeContext.jsx";
import { useOnboarding } from "../../contexts/OnboardingContext.jsx";
import { useAuth } from "../../auth.jsx";
import BitesIcon from "../BitesIcon.jsx";

const COLLAPSED_KEY = "lunchfy_weekly_card_collapsed";

function readCollapsedPref() {
  try {
    const stored = localStorage.getItem(COLLAPSED_KEY);
    return stored === null ? true : stored === "1";
  } catch {
    return true;
  }
}

function writeCollapsedPref(v) {
  try {
    localStorage.setItem(COLLAPSED_KEY, v ? "1" : "0");
  } catch {
    // ignore
  }
}

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

function CheckCircleIcon() {
  return (
    <svg viewBox="0 0 20 20" fill="none" width={15} height={15}>
      <circle cx="10" cy="10" r="8.5" stroke="currentColor" strokeWidth="1.5" />
      <path d="M6 10.5l3 3 5-6" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
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
        fill="var(--warning-text, #f59e0b)" stroke="var(--warning-text, #f59e0b)" strokeWidth="1" strokeLinejoin="round" />
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

function ChallengeRow({ challenge }) {
  const { completed, title, description, guidance, rewardBites, progress, target } = challenge;

  const hasProgress = typeof progress === "number" && typeof target === "number" && target > 1;
  const progressPct = hasProgress ? Math.min(100, Math.round((progress / target) * 100)) : 0;
  const helpText = (guidance || description || "").trim();

  return (
    <div className={`weekly-challenge-row${completed ? " is-completed" : ""}`}>
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
          {!completed && helpText && (
            <p className="weekly-challenge-guidance weekly-challenge-guidance--visible">{helpText}</p>
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

export default function WeeklyChallengeCard({ closeOnRouteChange = false } = {}) {
  const { state: weeklyState } = useWeeklyChallenge();
  const { state: onboardingState } = useOnboarding();
  const { user } = useAuth();
  const location = useLocation();
  const [collapsed, setCollapsed] = useState(readCollapsedPref);
  const [doneExpanded, setDoneExpanded] = useState(false);
  const [closing, setClosing] = useState(false);
  const prevAllDoneRef = useRef(false);
  const cardRef = useRef(null);
  const closingTimerRef = useRef(null);

  // Compute derived values — safe to derive even before early returns
  const completedCount = weeklyState ? (weeklyState.completedCount ?? 0) : 0;
  const totalCount = weeklyState
    ? (weeklyState.totalCount ?? weeklyState.totalMainChallenges ?? 0)
    : 0;
  const weeklyAllDone = completedCount >= totalCount && totalCount > 0;

  // Auto-collapse to done chip when completion is first detected this session.
  useEffect(() => {
    if (weeklyAllDone && !prevAllDoneRef.current) {
      setDoneExpanded(false);
    }
    prevAllDoneRef.current = weeklyAllDone;
  }, [weeklyAllDone]);

  // Route change: collapse immediately without animation.
  useEffect(() => {
    if (!closeOnRouteChange) return;
    clearTimeout(closingTimerRef.current);
    setClosing(false);
    setCollapsed(true);
    setDoneExpanded(false);
  }, [closeOnRouteChange, location.pathname]);

  // Cleanup timer on unmount.
  useEffect(() => () => clearTimeout(closingTimerRef.current), []);

  // Animate the sheet closed, then update state once the animation finishes.
  const closeSheet = useCallback(() => {
    if (closing) return;
    const reduced =
      typeof window !== "undefined" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const delay = reduced ? 0 : 230;
    setClosing(true);
    clearTimeout(closingTimerRef.current);
    closingTimerRef.current = setTimeout(() => {
      setClosing(false);
      if (weeklyAllDone) {
        setDoneExpanded(false);
      } else {
        writeCollapsedPref(true);
        setCollapsed(true);
      }
    }, delay);
  }, [closing, weeklyAllDone]);

  // Outside-click + Escape when the sheet is open.
  useEffect(() => {
    const expanded = doneExpanded || (!collapsed && !weeklyAllDone);
    if (!expanded) return;

    const syncOverlayTop = () => {
      const header = document.querySelector(".kitchen-ui-header");
      if (!header) return;
      document.documentElement.style.setProperty(
        "--kitchen-mobile-progress-overlay-top",
        `${Math.round(header.getBoundingClientRect().bottom + 8)}px`
      );
    };
    const handlePointerDown = (event) => {
      if (cardRef.current?.contains(event.target)) return;
      closeSheet();
    };
    const handleKeyDown = (event) => {
      if (event.key !== "Escape") return;
      closeSheet();
    };

    syncOverlayTop();
    window.addEventListener("resize", syncOverlayTop);
    // Defer pointerdown listener by one event-loop tick so that iOS ghost
    // events (synthetic mousedown/pointerdown fired after the tap that opened
    // the sheet) don't immediately trigger closeSheet().
    let deferTimerId = setTimeout(() => {
      document.addEventListener("pointerdown", handlePointerDown);
    }, 0);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      clearTimeout(deferTimerId);
      window.removeEventListener("resize", syncOverlayTop);
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
      document.documentElement.style.removeProperty("--kitchen-mobile-progress-overlay-top");
    };
  }, [collapsed, doneExpanded, weeklyAllDone, closeSheet]);

  // ── Early renders ──────────────────────────────────────────────────────
  if (!onboardingState || onboardingState.status !== "completed") return null;
  if (!weeklyState) return null;

  // Normalize progress percent (fallback if backend didn't send it)
  const progressPercent = weeklyState.progressPercent
    ?? (totalCount > 0 ? Math.round((completedCount / totalCount) * 100) : 0);

  // Pre-unlock Beta Pro hint: show for Basic users who haven't unlocked it yet
  const plan = String(user?.subscriptionPlan || "basic").toLowerCase();
  const planSource = user?.planSource || "";
  const showBetaProHint = (plan === "basic") && planSource !== "beta_pro" && user?.betaProActive !== true;

  const openSheet = () => {
    writeCollapsedPref(false);
    setCollapsed(false);
  };

  // ── All done → compact done chip (default state when all challenges complete) ──
  if (weeklyAllDone && !doneExpanded) {
    return (
      <>
        <div
          className="weekly-challenge-done-chip"
          role="button"
          tabIndex={0}
          aria-label="Ver retos semanales completados"
          onClick={() => setDoneExpanded(true)}
          onKeyDown={(event) => {
            if (event.key === "Enter" || event.key === " ") {
              event.preventDefault();
              setDoneExpanded(true);
            }
          }}
        >
          <CheckCircleIcon />
          <span className="weekly-challenge-done-chip-text">Retos semanales completados</span>
          <span className="weekly-challenge-done-chip-week">Semana {weeklyState.participationWeek ?? weeklyState.cycleWeekIndex}</span>
          <span className="weekly-challenge-done-chip-expand" aria-hidden="true">
            <ChevronDownIcon />
          </span>
        </div>
      </>
    );
  }

  // ── Collapsed slim bar (in-progress) ──────────────────────────────────
  if (collapsed && !weeklyAllDone) {
    return (
      <>
        <div
          className="weekly-challenge-slim"
          role="button"
          tabIndex={0}
          aria-label="Expandir retos semanales"
          onClick={openSheet}
          onKeyDown={(event) => {
            if (event.key === "Enter" || event.key === " ") {
              event.preventDefault();
              openSheet();
            }
          }}
        >
          <div className="weekly-challenge-slim-top">
            <div className="weekly-challenge-slim-heading">
              <TrophyIcon />
              <span className="weekly-challenge-slim-title">Retos semanales</span>
              {weeklyState.curriculum === "pro" && (
                <span className="weekly-challenge-curriculum-chip weekly-challenge-curriculum-chip--pro">PRO</span>
              )}
            </div>
            <div className="weekly-challenge-slim-right">
              <span className="weekly-challenge-slim-count">
                {completedCount}/{totalCount} completados
              </span>
              <span className="onboarding-guide-collapse-btn weekly-challenge-collapse-btn" aria-hidden="true">
                <ChevronDownIcon />
              </span>
            </div>
          </div>
          <div className="onboarding-progress onboarding-progress-compact weekly-challenge-progress-bar" style={{ marginBottom: 0 }}>
            <div style={{ width: `${progressPercent}%` }} />
          </div>
        </div>
      </>
    );
  }

  // ── Full expanded card / bottom sheet on mobile ────────────────────────
  return (
    <>
      <div className={`weekly-challenge-mobile-backdrop${closing ? " is-closing" : ""}`} aria-hidden="true" />
      <div className={`weekly-challenge-card${closing ? " is-closing" : ""}`} ref={cardRef}>
        <div className="weekly-challenge-top">
          <div className="weekly-challenge-heading">
            <TrophyIcon />
            <span>RETOS SEMANALES</span>
            {weeklyState.curriculum === "pro" && (
              <span className="weekly-challenge-curriculum-chip weekly-challenge-curriculum-chip--pro">PRO</span>
            )}
          </div>
          <div className="onboarding-guide-actions">
            <span>{completedCount}/{totalCount}</span>
            <button
              type="button"
              onClick={closeSheet}
              className="onboarding-guide-minimize"
              aria-label="Minimizar"
            >
              <ChevronUpIcon />
            </button>
          </div>
        </div>

        {/* Progress bar only while in progress */}
        {!weeklyAllDone && (
          <div className="onboarding-progress onboarding-progress-compact weekly-challenge-progress-bar">
            <div style={{ width: `${progressPercent}%` }} />
          </div>
        )}

        {/* Pre-unlock Beta Pro hint (only for basic users before unlock, only while in-progress) */}
        {showBetaProHint && !weeklyAllDone && (
          <div className="onboarding-beta-pro-hint weekly-beta-pro-hint">
            <span className="onboarding-beta-pro-hint-icon">⭐</span>
            <span>Completa el onboarding y todos los retos de tu primera semana para desbloquear <strong>Pro Beta</strong>.</span>
          </div>
        )}

        <div className="weekly-challenge-week-label">
          Semana {weeklyState.participationWeek ?? weeklyState.cycleWeekIndex}
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
          <div className="weekly-challenge-footer-row">
            <BitesIcon size={12} />
            <span>
              <strong>{weeklyState.totalBitesEarned || 0}</strong>
              <span> / {weeklyState.totalBitesAvailable} bites</span>
            </span>
          </div>
          <div className="weekly-challenge-footer-bar" aria-hidden="true">
            <div style={{ width: `${progressPercent}%` }} />
          </div>
        </div>
      </div>

    </>
  );
}
