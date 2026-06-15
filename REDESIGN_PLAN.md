# LUNCHFY UI/UX REDESIGN — FABLE EXECUTION PLAN

## CONSTRAINTS (non-negotiable)
- Branch: DEV only. Never touch main. Never merge.
- No business logic changes.
- No database schema changes.
- No API contract changes.
- No breaking existing features.
- Commit after each phase. Small, atomic commits.
- Run build + lint after each phase before continuing.

## APPROACH
You are running a full UI/UX redesign pass.
The goal is NOT to add features.
The goal is to make Lunchfy feel like a product built by a senior 
design team — think Linear, Notion, Arc, Airbnb.

Work autonomously. Make reasonable design decisions.
Do NOT ask for confirmation on individual choices.
DO surface blockers that could break existing functionality.

Use Graphify MCP first to map the architecture, component 
hierarchy, and identify duplication before touching any file.
If Graphify is unavailable, inspect the codebase normally.

---

## PHASE 0 — MAP & DESIGN SYSTEM AUDIT (start here)

1. Run Graphify to build the knowledge graph.
2. Identify all shared UI primitives currently in use:
   Buttons, Inputs, Selects, Chips, Tabs, Badges, Modals, 
   Drawers, Toasts, Cards, Empty states, Skeletons.
3. Identify inconsistencies: mixed border radii, inconsistent 
   spacing, mixed shadow values, typography conflicts.
4. Identify duplicated components doing the same job.
5. Output a brief audit summary before proceeding to Phase 1.
   Format: "AUDIT COMPLETE. Issues found: [N]. Proceeding to Phase 1."

---

## PHASE 1 — DESIGN TOKENS & PRIMITIVES

Goal: everything visual comes from a single source of truth.

- Define or consolidate CSS custom properties (or Tailwind config):
  - Spacing scale (4px base grid)
  - Border radius scale (sm/md/lg/xl/full)
  - Shadow scale (sm/md/lg/overlay)
  - Typography scale (xs/sm/base/lg/xl/2xl/3xl)
  - Color tokens (surface, border, text hierarchy, brand, state)
  
- Audit and normalize every shared primitive:
  - Buttons: primary, secondary, ghost, destructive. 
    Consistent sizing, padding, radius, hover/press states.
  - Inputs and Selects: unified border, focus ring, error state.
  - Cards: unified padding, radius, shadow, hover elevation.
  - Badges and Chips: consistent size and color use.
  - Modals and Drawers: consistent overlay, animation, padding.
  - Toasts: consistent position, duration, style.
  - Empty states: illustration or icon + headline + CTA pattern.
  - Skeletons: consistent shimmer style matching card shapes.

- Remove visual noise: excessive borders, competing shadows, 
  redundant backgrounds.

Commit: "design(tokens): unify design system primitives"

---

## PHASE 2 — MOTION SYSTEM

Goal: a consistent, intentional animation language across the app.

- Create a central motion utility (e.g. motion.ts or similar):
  - Duration tokens: fast (120ms), normal (200ms), slow (350ms)
  - Easing tokens: ease-out for entrances, ease-in for exits, 
    spring for interactive feedback
  - Always respect prefers-reduced-motion

- Implement with Anime.js (already in the project if present, 
  or add it — it is lightweight):
  - Card entrances: fade + translate-y on mount
  - Modal/Drawer open: scale + fade
  - Modal/Drawer close: fade out
  - Success states: scale bounce + checkmark draw
  - XP/Bites gain: number count-up + glow pulse
  - Shopping list item check: strikethrough + fade + slide out
  - Weekly challenge completion: confetti or ring fill
  - Task/Recipe completion: satisfying check animation
  - Accordion expand/collapse: height + opacity
  - Screen transitions: subtle cross-fade

Rules:
- Fast. Elegant. Never slow down the app.
- Animations should be additive — they enhance, not block.
- Every animation must have a reduced-motion fallback.

Commit: "design(motion): add motion system and micro-interactions"

---

## PHASE 3 — SCREEN BY SCREEN PASS

Work through each screen. For each one:
1. Fix mobile layout issues (overflow, crowded headers, 
   awkward spacing, horizontal scroll).
2. Apply design tokens from Phase 1.
3. Apply motion from Phase 2 where relevant.
4. Improve information hierarchy.
5. Surface primary actions, hide secondary ones.
6. Improve empty states.

Screens (in order of priority):

### Planning (flagship feature)
- Make the weekly planner feel premium.
- Day selector: clear active state, thumb-friendly.
- Meal cards: better density, cleaner layout.
- Empty day states: encouraging, actionable.
- Drag/drop feedback if present: improve visual cues.

### Kitchen
- Clear visual distinction between master dishes, 
  user dishes, and overrides.
  Use subtle premium indicators — not visual clutter.
- Better card density on mobile.
- Actions at thumb-friendly positions.

### Shopping List
- Item check: fast, satisfying, animated.
- Category transitions: smooth.
- Progress indicator: clear, motivating.
- Completion moment: rewarding.

### Catalog
- Same dish hierarchy treatment as Kitchen.
- Filter/search UX: improve on mobile.

### Gamification (XP / Bites / Challenges)
- Progress indicators: feel earned, not gamey.
- Unlock moments: satisfying reveal.
- Weekly challenge: clear state (locked / in progress / done).
- Reward feedback: users should feel good, not manipulated.

### Settings
- Clean, grouped, readable on mobile.
- No developer-looking layouts.

### Admin (if accessible)
- Functional over decorative.
- Tables and lists: readable, consistent.

Commit per screen or per logical group:
"design(planning): improve weekly planner UX"
"design(kitchen): improve dish hierarchy and mobile layout"
etc.

---

## PHASE 4 — FINAL AUDIT

Walk every screen one more time. Flag and fix anything that:
- Still looks AI-generated or vibe-coded
- Feels inconsistent with the new system
- Has spacing/padding that doesn't fit the grid
- Has a component that wasn't updated in earlier phases
- Has an interaction without a motion counterpart

Commit: "design(audit): final polish pass"

---

## DELIVERABLE

When all phases are complete, output:

1. Files changed (grouped by phase)
2. Major UX improvements
3. Major visual improvements  
4. Animation improvements
5. Mobile improvements
6. Remaining opportunities for future refinement

---

## TOKEN EFFICIENCY NOTES (for Fable)

- Use Graphify graph to navigate — avoid re-reading full files.
- Load only the files relevant to the current phase.
- When a component is shared, fix it once at source — 
  do not patch each usage individually.
- Prefer modifying existing components over creating new ones.
- If a file needs inspection, read only the relevant section first.