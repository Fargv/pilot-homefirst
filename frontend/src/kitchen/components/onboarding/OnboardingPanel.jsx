import React, { useState } from "react";
import { useOnboarding } from "../../contexts/OnboardingContext.jsx";
import BitesIcon from "../BitesIcon.jsx";

const PHASE_COLORS = {
  1: { bg: "#eef2ff", border: "#c7d2fe", accent: "#4338ca" },
  2: { bg: "#fefce8", border: "#fde68a", accent: "#d97706" },
  3: { bg: "#f0fdf4", border: "#bbf7d0", accent: "#16a34a" },
  4: { bg: "#fff7ed", border: "#fed7aa", accent: "#ea580c" },
  5: { bg: "#fdf2f8", border: "#f5d0fe", accent: "#9333ea" },
  6: { bg: "#f0f9ff", border: "#bae6fd", accent: "#0284c7" },
  7: { bg: "#fff1f2", border: "#fecdd3", accent: "#e11d48" }
};

const EXPLORE_SCREEN_LABELS = {
  visit_week: "Semana",
  visit_dishes: "Platos",
  visit_shopping: "Lista de la compra",
  visit_catalog: "Catálogo",
  visit_settings: "Ajustes"
};

function CheckIcon() {
  return (
    <svg viewBox="0 0 20 20" fill="none" width={16} height={16}>
      <circle cx="10" cy="10" r="9" fill="#16a34a" />
      <path d="M6 10.5l3 3 5-6" stroke="#fff" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function LockIcon() {
  return (
    <svg viewBox="0 0 20 20" fill="none" width={14} height={14}>
      <rect x="4" y="9" width="12" height="9" rx="2" stroke="#d1d5db" strokeWidth="1.5" />
      <path d="M7 9V7a3 3 0 1 1 6 0v2" stroke="#d1d5db" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}

function ScreenCheckItem({ triggerKey, visited }) {
  const label = EXPLORE_SCREEN_LABELS[triggerKey] || triggerKey;
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
      {visited
        ? <svg viewBox="0 0 16 16" fill="none" width={14} height={14}><circle cx="8" cy="8" r="7" fill="#16a34a" /><path d="M5 8.5l2.2 2.2 4-4.5" stroke="#fff" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" /></svg>
        : <svg viewBox="0 0 16 16" fill="none" width={14} height={14}><circle cx="8" cy="8" r="7" stroke="#d1d5db" strokeWidth="1.5" /></svg>
      }
      <span style={{ fontSize: 12, color: visited ? "#374151" : "#9ca3af", fontWeight: visited ? 600 : 400 }}>
        {label}
      </span>
    </div>
  );
}

function PhaseHeader({ phase, label, color }) {
  return (
    <div style={{
      display: "flex", alignItems: "center", gap: 8,
      padding: "5px 10px", borderRadius: 8,
      background: color.bg, border: `1px solid ${color.border}`,
      marginBottom: 8
    }}>
      <span style={{ fontWeight: 700, fontSize: 11, color: color.accent, letterSpacing: "0.08em", textTransform: "uppercase" }}>
        Fase {phase} — {label}
      </span>
    </div>
  );
}

function ChallengeRow({ challenge, isNext, isLocked, exploreProgress }) {
  const [expanded, setExpanded] = useState(isNext);

  const isExplore = challenge.key === "explore_app";

  return (
    <div
      style={{
        borderRadius: 10,
        border: `1.5px solid ${challenge.completed ? "#bbf7d0" : isNext ? "#c7d2fe" : "#e5e7eb"}`,
        background: challenge.completed ? "#f0fdf4" : isNext ? "#f8faff" : "#fafafa",
        padding: "10px 14px",
        marginBottom: 6,
        opacity: isLocked ? 0.5 : 1,
        transition: "all 0.2s"
      }}
    >
      <div
        style={{ display: "flex", alignItems: "flex-start", gap: 10, cursor: (challenge.completed || isLocked) ? "default" : "pointer" }}
        onClick={() => !isLocked && !challenge.completed && setExpanded((v) => !v)}
      >
        <div style={{ flexShrink: 0, marginTop: 2 }}>
          {challenge.completed
            ? <CheckIcon />
            : isLocked
              ? <LockIcon />
              : (
                <div style={{
                  width: 16, height: 16, borderRadius: "50%",
                  border: isNext ? "2.5px solid #4338ca" : "2px solid #d1d5db",
                  background: isNext ? "#eef2ff" : "#fff"
                }} />
              )
          }
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
            <span style={{
              fontSize: 13, fontWeight: challenge.completed ? 500 : isNext ? 700 : 500,
              color: challenge.completed ? "#6b7280" : isNext ? "#1e1b4b" : isLocked ? "#9ca3af" : "#374151",
              textDecoration: challenge.completed ? "line-through" : "none"
            }}>
              {challenge.title}
            </span>
            <span style={{
              flexShrink: 0, display: "flex", alignItems: "center", gap: 3,
              fontSize: 12, fontWeight: 700,
              color: challenge.completed ? "#6b7280" : isNext ? "#4338ca" : "#9ca3af"
            }}>
              <BitesIcon size={12} />
              +{challenge.rewardBites}
            </span>
          </div>
          {isNext && !expanded && (
            <p style={{ margin: "4px 0 0", fontSize: 12, color: "#4b5563", lineHeight: 1.5 }}>
              {challenge.description}
            </p>
          )}
          {isLocked && (
            <p style={{ margin: "3px 0 0", fontSize: 11, color: "#9ca3af", fontStyle: "italic" }}>
              Completa el reto anterior para desbloquear
            </p>
          )}
        </div>
      </div>

      {expanded && !challenge.completed && !isLocked && (
        <div style={{ marginTop: 10, paddingTop: 10, borderTop: "1px solid #e5e7eb" }}>
          <p style={{ margin: "0 0 6px", fontSize: 12, color: "#374151", lineHeight: 1.6 }}>{challenge.description}</p>
          {isExplore && exploreProgress && (
            <div style={{ background: "#eef2ff", borderRadius: 8, padding: "10px 12px", margin: "8px 0" }}>
              <p style={{ margin: "0 0 8px", fontSize: 11, fontWeight: 700, color: "#4338ca" }}>
                Pantallas visitadas: {exploreProgress.count}/{exploreProgress.total}
              </p>
              <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
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
            <div style={{ background: "#eef2ff", borderRadius: 7, padding: "8px 12px" }}>
              <p style={{ margin: 0, fontSize: 12, color: "#4338ca", lineHeight: 1.6, fontStyle: "italic" }}>
                {challenge.howTo}
              </p>
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
    <div style={{
      position: "fixed", inset: 0, zIndex: 1100,
      display: "flex", alignItems: "flex-end", justifyContent: "center",
      background: "rgba(15,15,35,0.5)", backdropFilter: "blur(4px)"
    }} onClick={onClose}>
      <div
        style={{
          width: "100%", maxWidth: 520,
          background: "#fff", borderRadius: "18px 18px 0 0",
          boxShadow: "0 -8px 40px rgba(0,0,0,0.18)",
          maxHeight: "90vh", display: "flex", flexDirection: "column"
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div style={{ padding: "16px 20px 12px", borderBottom: "1px solid #f1f5f9", flexShrink: 0 }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
            <div>
              <h3 style={{ margin: 0, fontSize: 17, fontWeight: 800, color: "#1e1b4b" }}>
                Tu guía de inicio
              </h3>
              <p style={{ margin: "2px 0 0", fontSize: 12, color: "#6b7280" }}>
                Completa los retos para ganar Bites
              </p>
            </div>
            <button
              type="button"
              onClick={onClose}
              style={{ background: "#f1f5f9", border: "none", borderRadius: 8, width: 32, height: 32, cursor: "pointer", fontSize: 18, color: "#6b7280", display: "flex", alignItems: "center", justifyContent: "center" }}
            >
              ×
            </button>
          </div>

          {/* Progress bar */}
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <div style={{ flex: 1, height: 6, background: "#e5e7eb", borderRadius: 999 }}>
              <div style={{
                height: "100%", borderRadius: 999,
                background: isCompleted ? "#16a34a" : "linear-gradient(90deg, #6366f1, #8b5cf6)",
                width: `${state.progressPercent}%`,
                transition: "width 0.6s ease"
              }} />
            </div>
            <span style={{ fontSize: 12, fontWeight: 700, color: "#4338ca", flexShrink: 0 }}>
              {state.completedCount}/{state.totalCount}
            </span>
          </div>

          {/* Bites */}
          <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 8 }}>
            <BitesIcon size={14} />
            <span style={{ fontSize: 13, color: "#374151" }}>
              <strong>{(state.totalBitesEarned || 0) + 20}</strong>
              <span style={{ color: "#9ca3af" }}> / {state.totalBitesAvailable} bites ganados</span>
            </span>
          </div>
        </div>

        {/* Scrollable challenge list */}
        <div style={{ overflowY: "auto", padding: "16px 20px 32px", flex: 1 }}>
          {isCompleted ? (
            <div style={{ textAlign: "center", padding: "24px 0" }}>
              <div style={{
                width: 52, height: 52, borderRadius: "50%",
                background: "linear-gradient(135deg, #16a34a, #065f46)",
                display: "flex", alignItems: "center", justifyContent: "center",
                margin: "0 auto 16px"
              }}>
                <svg viewBox="0 0 24 24" fill="none" width={26} height={26}>
                  <path d="M5 12l5 5L20 7" stroke="#fff" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </div>
              <h4 style={{ margin: "0 0 8px", fontSize: 16, fontWeight: 800, color: "#1e1b4b" }}>
                ¡Guía completada!
              </h4>
              <p style={{ margin: 0, fontSize: 14, color: "#6b7280", lineHeight: 1.6 }}>
                Ya conoces Lunchfy a fondo. Sigue planificando y disfrutando de la app.
              </p>
            </div>
          ) : (
            phases.map((phase) => {
              const phaseChallenges = challenges.filter((c) => c.phase === phase);
              const phaseLabel = phaseChallenges[0]?.phaseLabel || `Fase ${phase}`;
              const color = PHASE_COLORS[phase] || PHASE_COLORS[1];

              return (
                <div key={phase} style={{ marginBottom: 20 }}>
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
