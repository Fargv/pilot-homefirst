/**
 * bubblePosition.js — pure placement math for the coach bubble.
 *
 * Given the spotlight rect, the measured bubble size, the viewport and safe
 * insets (sticky header, bottom nav, safe areas), picks top/bottom/left/right
 * (preferring the step's hint), rejects any placement that would overlap the
 * target — the bubble must never cover the thing the user has to click —
 * clamps fully inside the usable viewport, and reports `covered: true` when
 * geometry makes overlap unavoidable so the caller can shrink the bubble.
 *
 * Kept free of DOM access so it can be unit-tested with plain node:test.
 */

const GAP = 12; // gap between spotlight and bubble

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), Math.max(min, max));
}

function rectsIntersect(a, b) {
  return !(
    a.left + a.width <= b.left ||
    a.left >= b.left + b.width ||
    a.top + a.height <= b.top ||
    a.top >= b.top + b.height
  );
}

function overlapArea(a, b) {
  const w = Math.min(a.left + a.width, b.left + b.width) - Math.max(a.left, b.left);
  const h = Math.min(a.top + a.height, b.top + b.height) - Math.max(a.top, b.top);
  return Math.max(0, w) * Math.max(0, h);
}

/**
 * @param {object} opts
 * @param {{top:number,left:number,width:number,height:number}} opts.spot   spotlight rect (viewport coords)
 * @param {{width:number,height:number}} opts.bubble                        measured bubble size
 * @param {{width:number,height:number}} opts.viewport
 * @param {"top"|"bottom"|"left"|"right"} [opts.preferred="bottom"]
 * @param {boolean} [opts.allowSides=true]   false on narrow screens → only top/bottom
 * @param {{top?:number,right?:number,bottom?:number,left?:number}} [opts.insets]
 *        keep-out margins for sticky header / bottom nav / safe areas
 * @returns {{top:number,left:number,placement:string,covered:boolean,arrow:{side:string,offset:number}}}
 */
export function computeBubblePosition({
  spot,
  bubble,
  viewport,
  preferred = "bottom",
  allowSides = true,
  insets = {}
}) {
  const inset = {
    top: insets.top ?? 10,
    right: insets.right ?? 10,
    bottom: insets.bottom ?? 10,
    left: insets.left ?? 10
  };
  const minTop = inset.top;
  const maxTop = viewport.height - inset.bottom - bubble.height;
  const minLeft = inset.left;
  const maxLeft = viewport.width - inset.right - bubble.width;

  const cx = spot.left + spot.width / 2;
  const cy = spot.top + spot.height / 2;

  // Raw (unclamped-axis) position per placement, then clamp both axes.
  const positionFor = (placement) => {
    let top;
    let left;
    if (placement === "bottom") {
      top = spot.top + spot.height + GAP;
      left = cx - bubble.width / 2;
    } else if (placement === "top") {
      top = spot.top - GAP - bubble.height;
      left = cx - bubble.width / 2;
    } else if (placement === "right") {
      top = cy - bubble.height / 2;
      left = spot.left + spot.width + GAP;
    } else {
      top = cy - bubble.height / 2;
      left = spot.left - GAP - bubble.width;
    }
    return {
      placement,
      top: clamp(top, minTop, Math.max(minTop, maxTop)),
      left: clamp(left, minLeft, Math.max(minLeft, maxLeft))
    };
  };

  const opposite = { top: "bottom", bottom: "top", left: "right", right: "left" };
  const order = [
    preferred,
    opposite[preferred],
    "bottom",
    "top",
    "right",
    "left"
  ].filter((p, i, arr) => arr.indexOf(p) === i && (allowSides || p === "top" || p === "bottom"));

  const candidates = order.map(positionFor);
  const bubbleRectAt = (pos) => ({ top: pos.top, left: pos.left, width: bubble.width, height: bubble.height });

  const fitsInViewport = (pos) =>
    pos.top >= minTop && pos.top <= Math.max(minTop, maxTop) &&
    pos.left >= minLeft && pos.left <= Math.max(minLeft, maxLeft);

  // 1st choice: inside the usable viewport AND not covering the target.
  let chosen = candidates.find((pos) => fitsInViewport(pos) && !rectsIntersect(bubbleRectAt(pos), spot));
  let covered = false;

  if (!chosen) {
    // Nothing avoids the target cleanly (huge targets, tiny viewports) —
    // take the candidate with the least overlap and flag it so the caller
    // can shrink the bubble and retry.
    chosen = candidates.reduce((best, pos) => {
      const area = overlapArea(bubbleRectAt(pos), spot);
      return !best || area < best.area ? { ...pos, area } : best;
    }, null);
    covered = chosen.area > 0;
  }

  // Arrow: sits on the bubble edge facing the target, aligned to the target
  // center but kept away from the bubble's rounded corners.
  const arrowSide = opposite[chosen.placement];
  const arrowOffset = arrowSide === "top" || arrowSide === "bottom"
    ? clamp(cx - chosen.left, 18, bubble.width - 18)
    : clamp(cy - chosen.top, 18, bubble.height - 18);

  return {
    top: chosen.top,
    left: chosen.left,
    placement: chosen.placement,
    covered,
    arrow: { side: arrowSide, offset: arrowOffset }
  };
}
