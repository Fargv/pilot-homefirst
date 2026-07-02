/**
 * GuidedTourOverlay.jsx
 *
 * Visual layer of the interactive guided onboarding:
 *  - spotlight hole over the current target (box-shadow technique, animated)
 *  - compact coach bubble anchored next to the target with an arrow, placed
 *    via computeBubblePosition (top/bottom/left/right + viewport clamping —
 *    never cut off on desktop, never overflowing on mobile)
 *  - action steps show the required action ("Ahora pulsa…") and NO next
 *    button; they complete when the app emits the step's event, flashing a
 *    success state before auto-advancing
 *  - floating mini-panel with fallback copy when there is no valid target
 *  - welcome / finish remain small centered cards
 *
 * Portal at document.body, above every app surface (z 10500+).
 */

import React, { useLayoutEffect, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import BitesIcon from "../BitesIcon.jsx";
import { progressLabelFor, resolveStepBody, stepCompletionEvents } from "./guidedTourSteps.js";
import { computeBubblePosition } from "./bubblePosition.js";
import { useGuidedTour } from "./GuidedTourProvider.jsx";
import TourBitesIndicator from "./TourBitesIndicator.jsx";
import "./tour.css";

const SPOT_PADDING = 6;
const SIDE_PLACEMENT_MIN_VW = 640; // below this, only top/bottom placements

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

function RewardTag({ step }) {
  if (!step?.rewardStep) return null;
  return (
    <span className="gt-reward-badge">
      <BitesIcon size={12} decorative />
      +5 al completarla
    </span>
  );
}

function WhyLine({ step }) {
  const [open, setOpen] = useState(false);
  useEffect(() => { setOpen(false); }, [step?.id]);
  if (!step?.why) return null;
  return (
    <div className="gt-why">
      <button type="button" className="gt-why-toggle" onClick={() => setOpen((v) => !v)}>
        {open ? "− " : "+ "}¿Por qué importa?
      </button>
      {open ? <p className="gt-why-text">{step.why}</p> : null}
    </div>
  );
}

export default function GuidedTourOverlay() {
  const {
    step, stepIndex, activeSteps, ctx,
    next, back, skip, skipStep, finish, finishAndPlan,
    actionDone, targetEl, targetMissing, resolvingTarget, sessionBites
  } = useGuidedTour();

  const { w: vw, h: vh } = useViewportSize();
  const spotRect = useSpotRect(targetEl);
  const bubbleRef = useRef(null);
  const [bubbleSize, setBubbleSize] = useState(null);

  const isWelcome = step?.kind === "welcome";
  const isFinish = step?.kind === "finish";
  const isActionStep = stepCompletionEvents(step).length > 0;
  const inFallback = Boolean(targetMissing);
  const isCentered = isWelcome || isFinish || !step?.target || inFallback;
  const showSpot = Boolean(spotRect && !isCentered);
  const bodyText = inFallback && step?.fallbackBody ? step.fallbackBody : resolveStepBody(step, ctx);

  // Measure the bubble after each content change so placement uses real size.
  useLayoutEffect(() => {
    if (!bubbleRef.current) { setBubbleSize(null); return; }
    const { offsetWidth, offsetHeight } = bubbleRef.current;
    setBubbleSize((prev) => (
      prev && prev.width === offsetWidth && prev.height === offsetHeight
        ? prev
        : { width: offsetWidth, height: offsetHeight }
    ));
  }, [stepIndex, bodyText, actionDone, spotRect, vw, vh]);

  if (!step) return null;

  let bubbleStyle = { top: -9999, left: -9999 }; // offscreen until measured
  let arrow = null;
  if (showSpot && bubbleSize) {
    const pos = computeBubblePosition({
      spot: spotRect,
      bubble: bubbleSize,
      viewport: { width: vw, height: vh },
      preferred: step.placement || "bottom",
      allowSides: vw >= SIDE_PLACEMENT_MIN_VW
    });
    bubbleStyle = { top: pos.top, left: pos.left };
    arrow = pos.arrow;
  }

  const progressLabel = progressLabelFor(activeSteps, stepIndex);

  const bubbleContent = (
    <>
      <div className="gt-card-top">
        {progressLabel ? <span className="gt-progress">{progressLabel}</span> : <span />}
        <button type="button" className="gt-text-btn gt-skip" onClick={skip}>
          Saltar tour
        </button>
      </div>
      <h2 className="gt-title">{step.title}</h2>
      {bodyText ? <p className="gt-body">{bodyText}</p> : null}
      {!inFallback && step.hint ? (
        <p className={`gt-hint${actionDone ? " gt-hint--done" : ""}`}>
          {actionDone ? "✓ ¡Hecho!" : step.hint}
        </p>
      ) : null}
      {!inFallback && !actionDone ? <RewardTag step={step} /> : null}
      {!inFallback ? <WhyLine step={step} /> : null}
      <div className="gt-actions">
        <button
          type="button"
          className="gt-secondary-btn"
          onClick={back}
          disabled={stepIndex <= 1}
          aria-label="Paso anterior"
        >
          Atrás
        </button>
        {isActionStep && !inFallback ? (
          // No "Siguiente" on action steps: doing the action is the only way
          // forward. "Omitir paso" is the unrewarded escape hatch.
          <button type="button" className="gt-text-btn gt-skip-step" onClick={skipStep} disabled={actionDone}>
            Omitir paso
          </button>
        ) : (
          <button type="button" className="kitchen-ui-button gt-primary" onClick={next}>
            {activeSteps[stepIndex + 1]?.kind === "finish" ? "Terminar" : "Siguiente"}
          </button>
        )}
      </div>
    </>
  );

  return createPortal(
    <div className="gt-root" role="dialog" aria-modal="false" aria-label="Onboarding guiado">
      {/* Action steps stay fully interactive; only info/welcome/finish block. */}
      {!isActionStep || inFallback ? <div className="gt-blocker" aria-hidden="true" /> : null}

      {showSpot ? (
        <div className={`gt-spotlight${actionDone ? " gt-spotlight--done" : ""}`} style={{
          top: spotRect.top, left: spotRect.left, width: spotRect.width, height: spotRect.height
        }} aria-hidden="true" />
      ) : isCentered ? (
        <div className="gt-dim-full" aria-hidden="true" />
      ) : null}

      {resolvingTarget && !showSpot && !isCentered ? (
        <div className="gt-waiting" aria-hidden="true"><span /><span /><span /></div>
      ) : null}

      {isWelcome ? (
        <div className="gt-card gt-card-centered">
          <div className="gt-hero" aria-hidden="true">👋</div>
          <h2 className="gt-title">{step.title}</h2>
          <p className="gt-body">{step.body}</p>
          <ul className="gt-bullets">
            {step.bullets.map((b) => (
              <li key={b.text}><span aria-hidden="true">{b.icon}</span>{b.text}</li>
            ))}
          </ul>
          <div className="gt-actions gt-actions-column">
            <button type="button" className="kitchen-ui-button gt-primary" onClick={next}>
              Empezar · 2 min
            </button>
            <button type="button" className="gt-text-btn" onClick={skip}>
              Ahora no
            </button>
          </div>
        </div>
      ) : isFinish ? (
        <div className="gt-card gt-card-centered">
          <div className="gt-hero" aria-hidden="true">🎉</div>
          <h2 className="gt-title">{step.title}</h2>
          {sessionBites > 0 ? (
            <div className="gt-finish-bites">
              <BitesIcon size={18} decorative />
              <span>Has ganado <strong>+{sessionBites} Bites</strong> haciendo acciones reales</span>
            </div>
          ) : null}
          <p className="gt-body">{step.body}</p>
          <div className="gt-actions gt-actions-column">
            <button type="button" className="kitchen-ui-button gt-primary" onClick={finishAndPlan}>
              Planifica tu primera semana
            </button>
            <button type="button" className="gt-text-btn" onClick={finish}>
              Cerrar
            </button>
          </div>
        </div>
      ) : isCentered ? (
        // Floating mini-panel: no valid target (empty data, plan gates…).
        <div className="gt-card gt-card-mini" ref={bubbleRef}>
          {bubbleContent}
        </div>
      ) : (
        <div
          className={`gt-bubble${actionDone ? " gt-bubble--done" : ""}`}
          ref={bubbleRef}
          style={bubbleStyle}
        >
          {arrow ? (
            <span
              className={`gt-bubble-arrow gt-bubble-arrow--${arrow.side}`}
              style={arrow.side === "top" || arrow.side === "bottom"
                ? { left: arrow.offset }
                : { top: arrow.offset }}
              aria-hidden="true"
            />
          ) : null}
          {bubbleContent}
        </div>
      )}

      <TourBitesIndicator />
    </div>,
    document.body
  );
}
