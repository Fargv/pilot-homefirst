// Source reference for the package scene order.
// The self-contained runtime does not require React; this file is included so
// the package contains the JSX source counterpart expected by the original
// Lunchfy Tutorial 9x16.dc.html wrapper.

export const LUNCHFY_TUTORIAL_SCENES = [
  { id: "hero", label: "Lunchfy brand intro", full: "0s-7s", teaser: "0s-4s" },
  { id: "problem", label: "Kitchen planning pain", full: "7s-15s" },
  { id: "plan", label: "Weekly planner", full: "15s-25s", teaser: "4s-8s" },
  { id: "recipes", label: "Recipe library", full: "25s-34s" },
  { id: "shopping", label: "Auto shopping list", full: "34s-43s", teaser: "8s-12s" },
  { id: "family", label: "Household sharing", full: "43s-50s" },
  { id: "final", label: "CTA", full: "50s-54s", teaser: "12s-15s" },
];

export default function LunchfyVideo() {
  return null;
}
