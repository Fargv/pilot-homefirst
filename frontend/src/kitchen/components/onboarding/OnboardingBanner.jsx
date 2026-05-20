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
    <div
      style={{
        position: "fixed", bottom: 80, left: "50%", transform: "translateX(-50%)",
        zIndex: 1200, pointerEvents: "auto"
      }}
      onClick={onDismiss}
    >
      <div style={{
        background: "#1e1b4b", color: "#fff",
        borderRadius: 14, padding: "10px 18px",
        display: "flex", alignItems: "center", gap: 10,
        boxShadow: "0 8px 30px rgba(0,0,0,0.25)",
        animation: "onboardingToastIn 0.35s cubic-bezier(0.34,1.56,0.64,1)",
        minWidth: 240, maxWidth: 340
      }}>
        <div style={{
          background: "#312e81", borderRadius: 10, width: 36, height: 36,
          display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0
        }}>
          <StarIcon />
        </div>
        <div>
          <p style={{ margin: 0, fontSize: 13, fontWeight: 700, lineHeight: 1.3 }}>
            ¡Reto completado!
          </p>
          <p style={{ margin: "2px 0 0", fontSize: 12, color: "#a5b4fc", lineHeight: 1.3 }}>
            {event.title}
          </p>
        </div>
        <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 4, flexShrink: 0 }}>
          <BitesIcon size={14} />
          <span style={{ fontWeight: 800, fontSize: 15, color: "#fbbf24" }}>+{event.rewardBites}</span>
        </div>
      </div>
    </div>
  );
}

export default function OnboardingBanner() {
  const { state, rewardEvent, dismissReward, isEligible } = useOnboarding();
  const [panelOpen, setPanelOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(false);

  if (!isEligible || !state) return null;
  if (state.status === "completed" || state.status === "disabled") return (
    <>
      {rewardEvent && <RewardToast event={rewardEvent} onDismiss={dismissReward} />}
    </>
  );

  const next = state.nextChallenge;

  if (collapsed) {
    return (
      <>
        <button
          type="button"
          onClick={() => setCollapsed(false)}
          style={{
            position: "fixed", bottom: 74, right: 16, zIndex: 900,
            background: "linear-gradient(135deg, #4338ca, #6d28d9)",
            border: "none", borderRadius: 999, padding: "8px 14px",
            display: "flex", alignItems: "center", gap: 6,
            boxShadow: "0 4px 18px rgba(67,56,202,0.4)", cursor: "pointer",
            color: "#fff", fontSize: 12, fontWeight: 700
          }}
        >
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
      <div
        style={{
          margin: "0 16px 12px",
          background: "linear-gradient(135deg, #eef2ff 0%, #f5f3ff 100%)",
          border: "1.5px solid #c7d2fe",
          borderRadius: 14,
          padding: "12px 14px",
          boxShadow: "0 2px 12px rgba(99,102,241,0.08)"
        }}
      >
        {/* Top row */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, marginBottom: 8 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <StarIcon />
            <span style={{ fontSize: 12, fontWeight: 800, color: "#4338ca", letterSpacing: "0.03em" }}>
              GUÍA DE INICIO
            </span>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <span style={{ fontSize: 11, color: "#6b7280" }}>{state.completedCount}/{state.totalCount}</span>
            <button
              type="button"
              onClick={() => setCollapsed(true)}
              style={{ background: "none", border: "none", cursor: "pointer", color: "#9ca3af", padding: 2, fontSize: 16, lineHeight: 1 }}
              aria-label="Minimizar"
            >
              ‒
            </button>
          </div>
        </div>

        {/* Progress bar */}
        <div style={{ height: 5, background: "#ddd6fe", borderRadius: 999, marginBottom: 10 }}>
          <div style={{
            height: "100%", borderRadius: 999,
            background: "linear-gradient(90deg, #6366f1, #8b5cf6)",
            width: `${state.progressPercent}%`,
            transition: "width 0.5s ease"
          }} />
        </div>

        {/* Next challenge */}
        {next ? (
          <div
            style={{ cursor: "pointer" }}
            onClick={() => setPanelOpen(true)}
          >
            <p style={{ margin: "0 0 3px", fontSize: 12, color: "#6b7280" }}>Próximo reto:</p>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
              <p style={{ margin: 0, fontSize: 13, fontWeight: 700, color: "#1e1b4b", lineHeight: 1.4, flex: 1 }}>
                {next.title}
              </p>
              <span style={{ display: "flex", alignItems: "center", gap: 3, flexShrink: 0, fontSize: 13, fontWeight: 700, color: "#4338ca" }}>
                <BitesIcon size={13} />
                +{next.rewardBites}
              </span>
            </div>
            {next.howTo && (
              <p style={{ margin: "5px 0 0", fontSize: 11, color: "#4b5563", lineHeight: 1.5, fontStyle: "italic" }}>
                {next.howTo}
              </p>
            )}
          </div>
        ) : (
          <p style={{ margin: 0, fontSize: 13, color: "#374151" }}>¡Todos los retos completados!</p>
        )}

        {/* View all */}
        <button
          type="button"
          onClick={() => setPanelOpen(true)}
          style={{
            marginTop: 10, width: "100%",
            background: "linear-gradient(135deg, #4338ca, #6d28d9)",
            border: "none", borderRadius: 8, padding: "8px 0",
            color: "#fff", fontSize: 12, fontWeight: 700, cursor: "pointer"
          }}
        >
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
