/**
 * bubblePosition.js — pure placement math for the coach bubble.
 *
 * Given the spotlight rect, the measured bubble size and the viewport, picks
 * top/bottom/left/right (preferring the step's hint), falls back to the side
 * with the most space, and always clamps fully inside the viewport so the
 * bubble is never cut off — on any screen size. Also returns where the arrow
 * should sit so it keeps pointing at the target after clamping.
 *
 * Kept free of DOM access so it can be unit-tested with plain node:test.
 */

const MARGIN = 10; // min gap to viewport edges
const GAP = 12;    // gap between spotlight and bubble

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), Math.max(min, max));
}

/**
 * @param {object} opts
 * @param {{top:number,left:number,width:number,height:number}} opts.spot  spotlight rect (viewport coords)
 * @param {{width:number,height:number}} opts.bubble                       measured bubble size
 * @param {{width:number,height:number}} opts.viewport
 * @param {"top"|"bottom"|"left"|"right"} [opts.preferred="bottom"]
 * @param {boolean} [opts.allowSides=true]  false on narrow screens → only top/bottom
 * @returns {{top:number,left:number,placement:string,arrow:{side:string,offset:number}}}
 */
export function computeBubblePosition({ spot, bubble, viewport, preferred = "bottom", allowSides = true }) {
  const vw = viewport.width;
  const vh = viewport.height;
  const cx = spot.left + spot.width / 2;
  const cy = spot.top + spot.height / 2;

  const space = {
    top: spot.top - MARGIN,
    bottom: vh - (spot.top + spot.height) - MARGIN,
    left: spot.left - MARGIN,
    right: vw - (spot.left + spot.width) - MARGIN
  };

  const fits = {
    top: space.top >= bubble.height + GAP,
    bottom: space.bottom >= bubble.height + GAP,
    left: allowSides && space.left >= bubble.width + GAP,
    right: allowSides && space.right >= bubble.width + GAP
  };

  const opposite = { top: "bottom", bottom: "top", left: "right", right: "left" };
  const candidates = [
    preferred,
    opposite[preferred],
    "bottom",
    "top",
    ...(allowSides ? ["right", "left"] : [])
  ].filter((p, i, arr) => arr.indexOf(p) === i && (allowSides || p === "top" || p === "bottom"));

  let placement = candidates.find((p) => fits[p]);
  if (!placement) {
    // Nothing fits cleanly — take the vertical side with the most room and
    // clamp; vertical placements are always safe against horizontal overflow.
    placement = space.bottom >= space.top ? "bottom" : "top";
  }

  let top;
  let left;
  if (placement === "bottom") {
    top = spot.top + spot.height + GAP;
    left = clamp(cx - bubble.width / 2, MARGIN, vw - bubble.width - MARGIN);
  } else if (placement === "top") {
    top = spot.top - GAP - bubble.height;
    left = clamp(cx - bubble.width / 2, MARGIN, vw - bubble.width - MARGIN);
  } else if (placement === "right") {
    top = clamp(cy - bubble.height / 2, MARGIN, vh - bubble.height - MARGIN);
    left = spot.left + spot.width + GAP;
  } else {
    top = clamp(cy - bubble.height / 2, MARGIN, vh - bubble.height - MARGIN);
    left = spot.left - GAP - bubble.width;
  }

  // Final clamp: the bubble must be fully on-screen even in degenerate cases
  // (huge targets, tiny viewports, keyboards). Never cut off.
  top = clamp(top, MARGIN, Math.max(MARGIN, vh - bubble.height - MARGIN));
  left = clamp(left, MARGIN, Math.max(MARGIN, vw - bubble.width - MARGIN));

  // Arrow: sits on the bubble edge facing the target, aligned to the target
  // center but kept away from the bubble's rounded corners.
  const arrowSide = opposite[placement]; // edge of the bubble the arrow sits on
  const arrowOffset = arrowSide === "top" || arrowSide === "bottom"
    ? clamp(cx - left, 18, bubble.width - 18)
    : clamp(cy - top, 18, bubble.height - 18);

  return { top, left, placement, arrow: { side: arrowSide, offset: arrowOffset } };
}
