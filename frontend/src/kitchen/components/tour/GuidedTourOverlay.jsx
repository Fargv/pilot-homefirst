/**
 * GuidedTourOverlay.jsx
 *
 * Visual layer of the guided tutorial — coach marks, not modal slides:
 *  - spotlight hole over the current target (box-shadow technique, animated)
 *  - TINY coach bubble: progress pill + short title + one command + controls.
 *    Anchored next to the target with an arrow, placed via
 *    computeBubblePosition (never covers the target, never cut off, honors
 *    sticky header / bottom nav insets)
 *  - mobile: when no anchored placement can avoid covering the target, a slim
 *    bottom coach bar is used instead — the target stays visible and tappable
 *  - small fallback panel with one-line copy when there is no valid target
 *  - welcome / finish are compact centered cards; finish hands off to the
 *    challenge onboarding ("Abrir onboarding") — the tutorial grants NO bites
 *
 * Portal at document.body, above every app surface (z 10500+).
 */

import React, { useLayoutEffect, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  progressLabelFor,
  resolveStepTitle,
  stepCompletionEvents,
  stepBlocksOutside
} from "./guidedTourSteps.js";
import { computeBubblePosition } from "./bubblePosition.js";
import { useGuidedTour } from "./GuidedTourProvider.jsx";
import "./tour.css";

const SPOT_PADDING = 6;
const SIDE_PLACEMENT_MIN_VW = 640; // below this, only top/bottom placements
const HEADER_INSET = 74;           // sticky app header keep-out
const BOTTOM_NAV_INSET = 84;       // mobile bottom nav keep-out

function useViewportSize() {
  const [size, setSize] = useState({ w: window.innerWidth, h: window.innerHeight });
  useEffect(() => {
    const onResize = () => setSize({ w: window.innerWidth, h: window.innerHeight });
    window.addEventListener("resize", onResize);
    window.addEventListener("orientationchange", onResize);
    return () => {
      window.removeEventListener("resize", onResize);
      window.removeEventListener("orientationchange", onResize);
    };
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

// Four transparent strips around the spotlight hole: background clicks are
// swallowed while the target itself stays fully interactive. Plain divs still
// let wheel/touch scrolling bubble to the document.
function BlockerStrips({ spot, viewport }) {
  const { width: vw, height: vh } = viewport;
  const right = spot.left + spot.width;
  const bottom = spot.top + spot.height;
  const strips = [
    { top: 0, left: 0, width: vw, height: Math.max(0, spot.top) },
    { top: bottom, left: 0, width: vw, height: Math.max(0, vh - bottom) },
    { top: spot.top, left: 0, width: Math.max(0, spot.left), height: spot.height },
    { top: spot.top, left: right, width: Math.max(0, vw - right), height: spot.height }
  ];
  return strips.map((s, i) => (
    <div key={i} className="gt-shield" style={s} aria-hidden="true" />
  ));
}

export default function GuidedTourOverlay() {
  const {
    step, stepIndex, activeSteps, ctx,
    next, back, skip, skipStep, finish, finishAndOpenOnboarding,
    actionDone, targetEl, targetMissing, resolvingTarget
  } = useGuidedTour();

  const { w: vw, h: vh } = useViewportSize();
  const isMobile = vw < SIDE_PLACEMENT_MIN_VW;
  const spotRect = useSpotRect(targetEl);
  const bubbleRef = useRef(null);
  const [bubbleSize, setBubbleSize] = useState(null);

  const isWelcome = step?.kind === "welcome";
  const isFinish = step?.kind === "finish";
  const isActionStep = stepCompletionEvents(step).length > 0;
  const inFallback = Boolean(targetMissing);
  const isCentered = isWelcome || isFinish || !step?.target || inFallback;
  const showSpot = Boolean(spotRect && !isCentered);
  const titleText = resolveStepTitle(step, ctx);
  const commandText = inFallback && step?.fallbackBody ? step.fallbackBody : step?.command;

  // Measure the bubble after each content change so placement uses real size.
  useLayoutEffect(() => {
    if (!bubbleRef.current) { setBubbleSize(null); return; }
    const { offsetWidth, offsetHeight } = bubbleRef.current;
    setBubbleSize((prev) => (
      prev && prev.width === offsetWidth && prev.height === offsetHeight
        ? prev
        : { width: offsetWidth, height: offsetHeight }
    ));
  }, [stepIndex, commandText, actionDone, spotRect, vw, vh]);

  if (!step) return null;

  // Anchored placement; on mobile, unavoidable overlap → slim bottom coach bar
  // instead of covering the action.
  let bubbleStyle = { top: -9999, left: -9999 }; // offscreen until measured
  let arrow = null;
  let useCoachBar = false;
  if (showSpot && bubbleSize) {
    const pos = computeBubblePosition({
      spot: spotRect,
      bubble: bubbleSize,
      viewport: { width: vw, height: vh },
      preferred: step.placement || "bottom",
      allowSides: !isMobile,
      insets: {
        top: HEADER_INSET,
        bottom: isMobile ? BOTTOM_NAV_INSET : 12,
        left: 10,
        right: 10
      }
    });
    if (pos.covered && isMobile) {
      useCoachBar = true;
    } else {
      bubbleStyle = { top: pos.top, left: pos.left };
      arrow = pos.arrow;
    }
  }

  const progressLabel = progressLabelFor(activeSteps, stepIndex);
  const blockOutside = stepBlocksOutside(step);

  const controls = (
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
        <button type="button" className="gt-text-btn gt-skip-step" onClick={skipStep} disabled={actionDone}>
          Omitir paso
        </button>
      ) : (
        <button type="button" className="kitchen-ui-button gt-primary" onClick={next}>
          {activeSteps[stepIndex + 1]?.kind === "finish" ? "Terminar" : "Continuar"}
        </button>
      )}
    </div>
  );

  const bubbleContent = (
    <>
      <div className="gt-card-top">
        {progressLabel ? <span className="gt-progress">{progressLabel}</span> : <span />}
        <button type="button" className="gt-text-btn gt-skip" onClick={skip}>
          Saltar
        </button>
      </div>
      <h2 className="gt-title">{titleText}</h2>
      {commandText ? (
        <p className={`gt-hint${actionDone ? " gt-hint--done" : ""}`}>
          {actionDone ? "✓ ¡Hecho!" : commandText}
        </p>
      ) : null}
      {controls}
    </>
  );

  return createPortal(
    <div className="gt-root" role="dialog" aria-modal="false" aria-label="Tutorial guiado">
      {/* Click control: info/welcome/finish get a full blocker; action steps
          with blockOutside get strips AROUND the spotlight so only the
          intended target is clickable. Scrolling always works. */}
      {!isActionStep || inFallback ? (
        <div className="gt-blocker" aria-hidden="true" />
      ) : blockOutside && showSpot ? (
        <BlockerStrips spot={spotRect} viewport={{ width: vw, height: vh }} />
      ) : null}

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
          <h2 className="gt-title">{titleText}</h2>
          <p className="gt-hint">{step.command}</p>
          <div className="gt-actions gt-actions-column">
            <button type="button" className="kitchen-ui-button gt-primary" onClick={next}>
              Empezar
            </button>
            <button type="button" className="gt-text-btn" onClick={skip}>
              Saltar
            </button>
          </div>
        </div>
      ) : isFinish ? (
        <div className="gt-card gt-card-centered">
          <div className="gt-hero" aria-hidden="true">🎉</div>
          <h2 className="gt-title">{titleText}</h2>
          <p className="gt-hint">{step.command}</p>
          <div className="gt-actions gt-actions-column">
            <button type="button" className="kitchen-ui-button gt-primary" onClick={finishAndOpenOnboarding}>
              Abrir onboarding
            </button>
            <button type="button" className="gt-text-btn" onClick={finish}>
              Cerrar
            </button>
          </div>
        </div>
      ) : isCentered ? (
        // Small fallback panel: no valid target (empty data, closed modal…).
        <div className="gt-card gt-card-mini" ref={bubbleRef}>
          {bubbleContent}
        </div>
      ) : useCoachBar ? (
        // Mobile coach bar: slim, above the bottom nav, target fully visible.
        <div className="gt-coach-bar" ref={bubbleRef}>
          {progressLabel ? <span className="gt-progress">{progressLabel}</span> : null}
          <span className={`gt-coach-bar-text${actionDone ? " gt-hint--done" : ""}`}>
            {actionDone ? "✓ ¡Hecho!" : commandText || titleText}
          </span>
          <button type="button" className="gt-text-btn gt-skip-step" onClick={skipStep} disabled={actionDone}>
            Omitir
          </button>
          <button type="button" className="gt-text-btn" onClick={skip} aria-label="Saltar tutorial">
            ✕
          </button>
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
    </div>,
    document.body
  );
}
