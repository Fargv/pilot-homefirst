/**
 * Barrel export for the rewards animation system.
 *
 * Usage:
 *   import { triggerMilestone, triggerReward, burstParticles } from '../components/rewards/index.js';
 *   import MilestoneToast from '../components/rewards/MilestoneToast.jsx';
 *
 * triggerReward({ type, label, title, subtitle, icon, variant, anchorRef })
 *   → type 'shopping-item' : fires burstParticles around anchorRef.current
 *   → any other type       : fires triggerMilestone toast
 */

export {
  burstParticles,
  triggerMilestone,
  useRewardAnimation
} from "../../hooks/useRewardAnimation.js";

export { default as MilestoneToast } from "./MilestoneToast.jsx";

import { burstParticles, triggerMilestone } from "../../hooks/useRewardAnimation.js";

/**
 * triggerReward — unified entry point matching the spec.
 *
 * @param {object} opts
 * @param {'shopping-item'|'milestone'|'challenge'|'bites'|'weekly'} [opts.type='milestone']
 * @param {string}  [opts.label]      – short text (used as toast title when title not given)
 * @param {string}  [opts.title]      – toast title
 * @param {string}  [opts.subtitle]   – toast subtitle
 * @param {string}  [opts.icon]       – emoji for the toast
 * @param {string}  [opts.variant]    – 'check'|'trophy'|'bites'|'flame'|'spark'
 * @param {object}  [opts.anchorRef]  – React ref whose .current is the anchor DOM element
 */
export function triggerReward({
  type     = "milestone",
  label    = "",
  title    = "",
  subtitle = "",
  icon     = "✓",
  variant  = "check",
  anchorRef
} = {}) {
  if (type === "shopping-item") {
    burstParticles(anchorRef?.current ?? null, { count: 5 });
  } else {
    triggerMilestone({ title: title || label, subtitle, icon, variant });
  }
}
