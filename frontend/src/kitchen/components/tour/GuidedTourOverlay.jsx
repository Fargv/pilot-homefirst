/**
 * GuidedTourOverlay.jsx
 *
 * Visual layer of the guided tour: dimmed backdrop with an animated spotlight
 * hole over the current target, an anchored tooltip card (bottom sheet on
 * mobile), welcome/finish variants, progress indicator and the floating bites
 * counter. Portal at document.body, above every app surface (z 10500+).
 *
 * Spotlight = one absolutely-positioned div whose giant box-shadow dims the
 * rest of the screen; transitions on top/left/width/height give the smooth
 * "spotlight travels" effect without SVG masks.
 */

import React, { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import BitesIcon from "../BitesIcon.jsx";
import { TOUR_STEPS, progressLabelFor } from "./guidedTourSteps.js";
import { useGuidedTour } from "./GuidedTourProvider.jsx";
import TourBitesIndicator from "./TourBitesIndicator.jsx";
import "./tour.css";

const SPOT_PADDING = 8;
const CARD_WIDTH = 372;
const CARD_MARGIN = 14;
const MOBILE_BREAKPOINT = 640;

function useViewportSize() {
  const [size, setSize] = useState({ w: window.innerWidth, h: window.innerHeight });
  useEffect(() => {
    const onResize = () => setSize({ w: window.innerWidth, h: window.innerHeight });
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);
  return size;
}

// Live-tracks the target rect (scroll, layout shifts, animations).
function useSpotRect(targetEl) {
  const [rect, setRect] = useState(null);
  const rectRef = useRef(null);

  useEffect(() => {
    if (!targetEl) { rectRef.current = null; setRect(null); return; }

    const read = () => {
      const r = targetEl.getBoundingClientRect();
      const nextRect = {
        top: Math.round(r.top - SPOT_PADDING),
        left: Math.round(r.left - SPOT_PADDING),
        width: Math.round(r.width + SPOT_PADDING * 2),
        height: Math.round(r.height + SPOT_PADDING * 2)
      };
      const prev = rectRef.current;
      if (
        !prev ||
        Math.abs(prev.top - nextRect.top) > 1 ||
        Math.abs(prev.left - nextRect.left) > 1 ||
        Math.abs(prev.width - nextRect.width) > 1 ||
        Math.abs(prev.height - nextRect.height) > 1
      ) {
        rectRef.current = nextRect;
        setRect(nextRect);
      }
    };

    read();
    const interval = setInterval(read, 200);
    window.addEventListener("scroll", read, true);
    window.addEventListener("resize", read);
    return () => {
      clearInterval(interval);
      window.removeEventListener("scroll", read, true);
      window.removeEventListener("resize", read);
    };
  }, [targetEl]);

  return rect;
}

function ProgressDots({ stepIndex }) {
  const label = progressLabelFor(stepIndex);
  if (!label) return null;
  return <span className="gt-progress">{label}</span>;
}

function RewardBadge({ step }) {
  if (!step?.rewardStep) return null;
  return (
    <span className="gt-reward-badge" title={step.rewardCopy || "Recompensa del tour"}>
      <BitesIcon size={13} decorative />
      +5 {step.rewardCopy || ""}
    </span>
  );
}

export default function GuidedTourOverlay() {
  const {
    step, stepIndex, next, back, skip, finishAndPlan, finish,
    advancing, targetEl, targetMissing, resolvingTarget,
    sessionBites, demoRecipeName
  } = useGuidedTour();

  const { w: vw, h: vh } = useViewportSize();
  const isMobile = vw < MOBILE_BREAKPOINT;
  const spotRect = useSpotRect(targetEl);
  const cardRef = useRef(null);
  const [cardHeight, setCardHeight] = useState(0);

  useEffect(() => {
    if (cardRef.current) setCardHeight(cardRef.current.offsetHeight);
  }, [stepIndex, spotRect, targetMissing, vw]);

  if (!step) return null;

  const isWelcome = step.kind === "welcome";
  const isFinish = step.kind === "finish";
  const isCentered = isWelcome || isFinish || !step.target || targetMissing;
  const showSpot = Boolean(spotRect && !isCentered);
  const body = targetMissing && step.fallbackBody ? step.fallbackBody : step.body;

  // Desktop anchored card position: prefer configured placement, flip when
  // there is not enough room, clamp horizontally to the viewport.
  let cardStyle = null;
  if (!isMobile && showSpot) {
    const spaceBelow = vh - (spotRect.top + spotRect.height);
    const preferBottom = step.placement !== "top";
    const fitsBelow = spaceBelow > cardHeight + CARD_MARGIN * 2;
    const fitsAbove = spotRect.top > cardHeight + CARD_MARGIN * 2;
    const placeBottom = preferBottom ? fitsBelow || !fitsAbove : !fitsAbove && fitsBelow;
    const left = Math.min(
      Math.max(spotRect.left + spotRect.width / 2 - CARD_WIDTH / 2, CARD_MARGIN),
      vw - CARD_WIDTH - CARD_MARGIN
    );
    cardStyle = placeBottom
      ? { top: spotRect.top + spotRect.height + CARD_MARGIN, left, width: CARD_WIDTH }
      : { top: spotRect.top - cardHeight - CARD_MARGIN, left, width: CARD_WIDTH };
  }

  const dimStyle = showSpot
    ? { top: spotRect.top, left: spotRect.left, width: spotRect.width, height: spotRect.height }
    : null;

  return createPortal(
    <div className={`gt-root${isMobile ? " gt-mobile" : ""}`} role="dialog" aria-modal="false" aria-label="Tour guiado">
      {/* Click blocker: skipped on interactive steps so the highlighted control works. */}
      {!step.interactive ? <div className="gt-blocker" aria-hidden="true" /> : null}

      {showSpot ? (
        <div className="gt-spotlight" style={dimStyle} aria-hidden="true" />
      ) : (
        <div className="gt-dim-full" aria-hidden="true" />
      )}

      {resolvingTarget && !showSpot ? (
        <div className="gt-waiting" aria-hidden="true"><span /><span /><span /></div>
      ) : null}

      {/* ── Card ── */}
      <div
        ref={cardRef}
        className={`gt-card${isCentered ? " gt-card-centered" : ""}${isMobile && !isCentered ? " gt-card-sheet" : ""}`}
        style={cardStyle ?? undefined}
      >
        {isWelcome ? (
          <>
            <div className="gt-hero" aria-hidden="true">👋</div>
            <h2 className="gt-title">{step.title}</h2>
            <p className="gt-body">{step.body}</p>
            <ul className="gt-bullets">
              {step.bullets.map((b) => (
                <li key={b.text}><span aria-hidden="true">{b.icon}</span>{b.text}</li>
              ))}
            </ul>
            <div className="gt-actions gt-actions-column">
              <button type="button" className="kitchen-ui-button gt-primary" onClick={next} disabled={advancing}>
                Empezar tour · 2 min
              </button>
              <button type="button" className="gt-text-btn" onClick={skip}>
                Ahora no
              </button>
            </div>
          </>
        ) : isFinish ? (
          <>
            <div className="gt-hero" aria-hidden="true">🎉</div>
            <h2 className="gt-title">{step.title}</h2>
            {sessionBites > 0 ? (
              <div className="gt-finish-bites">
                <BitesIcon size={18} decorative />
                <span>Has ganado <strong>+{sessionBites} Bites</strong> durante el tour</span>
              </div>
            ) : null}
            <p className="gt-body">{step.body}</p>
            <div className="gt-actions gt-actions-column">
              <button type="button" className="kitchen-ui-button gt-primary" onClick={finishAndPlan}>
                Planificar mi semana
              </button>
              <button type="button" className="gt-text-btn" onClick={finish}>
                Cerrar
              </button>
            </div>
          </>
        ) : (
          <>
            <div className="gt-card-top">
              <ProgressDots stepIndex={stepIndex} />
              <button type="button" className="gt-text-btn gt-skip" onClick={skip}>
                Saltar tour
              </button>
            </div>
            <h2 className="gt-title">{step.title}</h2>
            <p className="gt-body">
              {body}
              {step.dynamicRecipe && demoRecipeName ? (
                <> Prueba con <strong>«{demoRecipeName}»</strong>.</>
              ) : null}
            </p>
            <RewardBadge step={step} />
            <div className="gt-actions">
              <button
                type="button"
                className="gt-secondary-btn"
                onClick={back}
                disabled={advancing || stepIndex <= 1}
                aria-label="Paso anterior"
              >
                Atrás
              </button>
              <button type="button" className="kitchen-ui-button gt-primary" onClick={next} disabled={advancing}>
                {TOUR_STEPS[stepIndex + 1]?.kind === "finish" ? "Terminar" : "Siguiente"}
              </button>
            </div>
          </>
        )}
      </div>

      <TourBitesIndicator />
    </div>,
    document.body
  );
}
