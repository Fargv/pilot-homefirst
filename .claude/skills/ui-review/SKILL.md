---
name: ui-review
description: Use when the user wants to review UI, analyze design, improve visual appearance, find style inconsistencies, or passes a screenshot of a Lunchfy/HomeFirst screen. Detects color/typography/spacing inconsistencies, alignment issues, viewport overflows, design system violations, weak visual hierarchy, incorrect button weight, and missing interaction states. Specific to the Lunchfy PWA React stack (kitchen.css, --hf-* CSS variables, mobile-first).
version: 1.0.0
user-invocable: true
argument-hint: "[component-path | screen-name | screenshot]"
---

Produce a structured, prioritized UI audit of a Lunchfy/HomeFirst screen or component. Return concrete, copy-paste-ready CSS/JSX fixes. No vague suggestions — every finding ships with code.

## Context loading

Before analyzing, load the design system:

1. **Identify the target.** From the argument: a JSX file path, a screen name (e.g. "lista de la compra", "ShoppingPage"), or a screenshot. If a screenshot was provided, read it visually.
2. **Read the component.** Glob `frontend/src/kitchen/**/*.jsx` and read the matching file(s). If a screenshot only, skip this step.
3. **Sample the CSS tokens.** Read lines 1–120 of `frontend/src/kitchen/kitchen.css` to extract the `--hf-*` variable table and the base resets.
4. **Find component-specific styles.** Grep `kitchen.css` for class names present in the target component and read those sections (±20 lines of context each).

If no argument: ask "¿Qué pantalla o componente quieres revisar? Puedes pasar la ruta del JSX, el nombre de la pantalla, o un screenshot."

## Lunchfy design system reference

Keep these rules in scope during analysis. They are the ground truth for what "correct" looks like in this project.

### CSS variables (--hf-* prefix)
- **Brand**: `--hf-brand` (indigo `#4f46e5`), `--hf-brand-light` (`#6366f1`)
- **Text**: `--hf-text` (dark), `--hf-text-muted` (secondary), `--hf-text-inverse` (on dark)
- **Surfaces**: `--hf-card-bg`, `--hf-surface`, `--hf-surface-soft`
- **Borders**: `--hf-border` (~`#e5e7eb` light / `rgba(255,255,255,0.12)` dark)
- **Radius**: `--hf-radius-lg` (cards ~16px), `--hf-radius-md` (~12px), `--hf-radius-sm` (~8px)
- **Shadows**: use `rgba(79,94,170,0.X)` indigo-tinted shadows, not pure black
- Never hardcode hex colors that duplicate a variable. Flag any `#4f46e5` not using `--hf-brand`.

### Typography scale
- `h1`: `clamp(1.05rem, 2.1vw, 1.45rem)`, weight 700, color `#27336a`
- `h4` section heads: uppercase, weight 700, `font-size: 12–13px`, letter-spacing `0.06em`
- Body: `14–15px`, line-height `1.5`
- Muted / secondary: `.kitchen-muted` class or `color: var(--hf-text-muted)`
- Minimum readable size: **12px** — anything smaller is a defect

### Spacing grid (8px base)
- Micro: 4px · Component gaps: 8px · Section gaps: 16px · Card padding: 16–20px
- Consecutive same-value paddings are a monotony signal
- Card internal spacing must have visual rhythm (top ≠ sides ≠ bottom is fine and expected)

### Interaction states required on every interactive element
- **hover**: visual change (background, border-color, color, or transform) within `0.15–0.2s`
- **focus-visible**: `outline` or `box-shadow` ring, never `outline: none` without a replacement
- **active/pressed**: `transform: scale(0.97)` or color deepens — must be perceptible
- **disabled**: `opacity: 0.5` + `cursor: not-allowed`, or equivalent — no silent ignoring
- **loading**: spinner, skeleton, or reduced opacity — never a frozen UI

### Button hierarchy
Three tiers, must be visually distinct:
1. **Primary** (`.kitchen-button`): filled brand gradient or solid, high contrast
2. **Secondary** (`.kitchen-button.secondary`): border-only or muted fill
3. **Ghost / icon** (`.kitchen-button.ghost`): transparent, subtle border on hover only
- Two primary buttons side-by-side is a defect: one must demote to secondary
- Icon-only buttons need `width`/`height` ≥ 34px, `aria-label` non-negotiable

### Border-radius consistency
- Cards and modals: `--hf-radius-lg` (16px)
- Inputs, selects, chips: 12–14px
- Pill badges / tags: `999px`
- Icon buttons: 12–14px (never `50%` unless intentionally circular)
- Inconsistent radius within the same component = defect

### Dark mode
- Every new class that sets `background`, `color`, or `border-color` needs a `[data-theme="dark"]` counterpart unless it uses only `var(--hf-*)` tokens (which auto-adapt)
- Hardcoded light values without dark override = defect

### Mobile-first constraints
- Primary viewport: 375–414px width
- Touch targets: **minimum 44×44px** (WCAG 2.5.5) — flag anything smaller
- No horizontal overflow: `overflow-x: hidden` on shell is a symptom, not a fix
- Text must not wrap awkwardly on 375px — test mentally at that width
- Bottom nav height is ~56px + safe-area — content must not hide behind it

### Animation rules
- Duration: `150–250ms` for micro-interactions, `300–400ms` for page transitions
- Easing: `ease-out` or `cubic-bezier(0.4, 0, 0.2, 1)` — no bounce, no elastic
- Never animate `width`, `height`, or `top`/`left` — use `transform` and `opacity`
- Prefer `grid-template-rows: 0fr → 1fr` for height collapse animations

## Analysis checklist

Run every item against the target. Skip items that are clearly inapplicable (e.g., dark mode on a screenshot-only review).

**Color & theming**
- [ ] All colors use `--hf-*` variables or are justified hardcodes
- [ ] No duplicate hardcoded values that have a variable equivalent
- [ ] Dark mode coverage complete for new classes
- [ ] Gradient directions are consistent (135deg standard in this project)
- [ ] Text contrast ≥ 4.5:1 (WCAG AA) on all backgrounds

**Typography**
- [ ] No text below 12px
- [ ] Section headings follow uppercase small-caps pattern
- [ ] Line lengths under 75ch on desktop
- [ ] No heading hierarchy skips (h1 → h3 without h2)
- [ ] Weight contrast between levels ≥ 1.25 ratio in perceived heaviness

**Spacing & layout**
- [ ] 8px grid alignment (all gaps are multiples of 4)
- [ ] No identical padding on all four sides of a large container
- [ ] Cards don't nest inside cards
- [ ] Grid/flex children don't overflow their container at 375px
- [ ] `gap` values consistent within the same list or grid

**Interactive states**
- [ ] Every button/link has hover, focus-visible, and active
- [ ] Disabled states visually distinct
- [ ] Loading states present where async operations occur
- [ ] No `outline: none` without a visible replacement

**Component structure**
- [ ] Button hierarchy — no two primaries side-by-side
- [ ] Icon buttons ≥ 34px, have `aria-label`
- [ ] Touch targets ≥ 44px on mobile
- [ ] Border-radius internally consistent
- [ ] No horizontal scroll triggered

**Visual hierarchy**
- [ ] Clear primary action per screen (most visually prominent)
- [ ] Secondary info visually subordinate to primary
- [ ] Section separators used consistently
- [ ] Whitespace used to group related elements

## Output format

Respond with this exact structure. Never omit the severity classification.

---

### UI Review — [ComponentName / ScreenName]

**Summary**: [1–2 sentences on overall state]

---

#### 🔴 Crítico — [N problems]
*Defects that break usability, a11y, or cause visible bugs*

**[C1] [Short title]**
- **Problema**: [What's wrong and where — file:line if known]
- **Impacto**: [Why it matters]
- **Fix**:
```css
/* or JSX */
[concrete code]
```

#### 🟠 Importante — [N problems]
*Inconsistencies that erode design system cohesion or user trust*

**[I1] [Short title]**
- **Problema**: ...
- **Impacto**: ...
- **Fix**: ...

#### 🟡 Mejora — [N problems]
*Polish items — worth fixing before shipping*

**[M1] [Short title]**
- **Problema**: ...
- **Fix**: ...

---

#### Verificación de variables CSS
List any hardcoded values found that should use `--hf-*` variables:
| Valor hardcoded | Variable correcta |
|---|---|
| `#4f46e5` | `var(--hf-brand)` |
| ... | ... |

#### Estado general
`Apto para producción` / `Requiere correcciones menores` / `Requiere correcciones importantes` / `No apto — refactor necesario`

---

## Behavior rules

- **Be specific**: always cite the CSS class name or JSX element. "The button" is not enough; "`.shopping-overflow-btn` at `ShoppingPage.jsx:1163`" is.
- **Be concrete**: every problem gets a fix. No "consider improving the contrast" — write the corrected rule.
- **Respect existing patterns**: don't propose replacing `.kitchen-button` with a different design system. Work within what exists.
- **No false positives**: if something uses `var(--hf-brand)` correctly, don't flag it as a hardcoded color.
- **Screenshot analysis**: if given a screenshot without code access, describe what to look for by class name and file, then state what you can confirm visually vs. what needs code verification.
- **Prioritize ruthlessly**: if there are 15 problems, the top 3 in Crítico matter more than the rest combined. Say so.
