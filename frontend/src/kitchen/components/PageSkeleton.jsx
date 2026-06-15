import React from "react";

/**
 * Generic route-level skeleton shown while a lazy page chunk loads.
 * Shapes only — header bar + content cards with a 1.5s shimmer — so the
 * hand-off to any real page feels seamless.
 */
export default function PageSkeleton() {
  return (
    <div className="hf-page-skel" aria-hidden="true">
      <div className="hf-page-skel-header" />
      <div className="hf-page-skel-card" />
      <div className="hf-page-skel-card" />
      <div className="hf-page-skel-card hf-page-skel-card-short" />
      <div className="hf-page-skel-card" />
    </div>
  );
}
