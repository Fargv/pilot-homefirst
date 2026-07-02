/**
 * TourBitesIndicator.jsx — floating bites counter pinned during the whole tour.
 * Educates the user: every guided action visibly feeds this counter.
 * On award: count-up + glow + a rising "+N" chip + particle burst.
 */

import React, { useEffect, useRef, useState } from "react";
import BitesIcon from "../BitesIcon.jsx";
import { countUp, glowPulse } from "../../motion.js";
import { burstParticles } from "../../hooks/useRewardAnimation.js";
import { useGuidedTour } from "./GuidedTourProvider.jsx";

export default function TourBitesIndicator() {
  const { wallet, lastAward, sessionBites } = useGuidedTour();
  const total = wallet?.totalBites ?? null;
  const countRef = useRef(null);
  const pillRef = useRef(null);
  const prevTotalRef = useRef(total);
  const [floatingAward, setFloatingAward] = useState(null);

  useEffect(() => {
    const prev = prevTotalRef.current;
    prevTotalRef.current = total;
    if (total === null || prev === null || prev === total || !countRef.current) return;
    countUp(countRef.current, { from: prev, to: total });
    if (total > prev) glowPulse(pillRef.current);
  }, [total]);

  useEffect(() => {
    if (!lastAward) return;
    setFloatingAward(lastAward);
    burstParticles(pillRef.current, { count: 6, radius: 34 });
    const timer = setTimeout(() => setFloatingAward(null), 1400);
    return () => clearTimeout(timer);
  }, [lastAward]);

  if (total === null && sessionBites === 0) return null;

  return (
    <div className="gt-bites-pill" ref={pillRef} role="status" aria-live="polite">
      <BitesIcon size={16} decorative />
      <span className="gt-bites-count" ref={countRef}>{total ?? sessionBites}</span>
      <span className="gt-bites-label">Bites</span>
      {sessionBites > 0 ? (
        <span className="gt-bites-session">+{sessionBites} en el tour</span>
      ) : null}
      {floatingAward ? (
        <span key={floatingAward.at} className="gt-bites-float" aria-hidden="true">
          +{floatingAward.amount}
        </span>
      ) : null}
    </div>
  );
}
