---
name: ux-review
description: Use when the user wants to review UX, improve usability, simplify a screen, says something is confusing or overwhelming, or passes a screenshot asking to improve the user experience. Detects overwhelming screens, buried primary actions, over-stepped flows, elements that should collapse, touch usability issues, missing feedback, and information hierarchy conflicts. Specific to Lunchfy/HomeFirst as a mobile-first PWA React app.
version: 1.0.0
user-invocable: true
argument-hint: "[component-path | screen-name | screenshot]"
---

Produce a structured UX audit of a Lunchfy/HomeFirst screen or flow. Return a numbered friction map, a reorganization proposal, and concrete component changes — not design theory. Every recommendation is implementable in the current React/CSS stack.

## Context loading

Before analyzing:

1. **Identify the target.** From the argument: a JSX file path, a screen name, or a screenshot. If a screenshot was provided, read it visually.
2. **Read the component.** Glob `frontend/src/kitchen/**/*.jsx` and read the matching file(s) fully. Structure matters — read it all, not just the render.
3. **Count interactive elements.** List every button, input, tab, link, and toggle visible in the render. This number is the "cognitive load index" for step 1 of the analysis.
4. **Identify the primary flow.** What is the single most important action a user can take on this screen? It should be obvious from the JSX. If it's not, that's the first friction point.

If no argument: ask "¿Qué pantalla o flujo quieres revisar? Puedes pasar la ruta del JSX, el nombre de la pantalla, o un screenshot."

## Lunchfy UX context

These are fixed facts about the product. Every recommendation must be compatible with them.

### Platform constraints
- **Primary device**: Android/iOS mobile, 375–414px viewport, touch input
- **PWA**: installed on home screen, no browser chrome in standalone mode — back navigation is not guaranteed
- **Session context**: users open the app while shopping (hands occupied), cooking (hands dirty), or meal planning (seated, relaxed). The screen's context determines acceptable complexity.
- **Bottom nav**: 56px + safe-area inset occupies the bottom — content behind it is invisible

### Interaction budget per screen
The number of immediately visible, distinct interactive elements a user must evaluate before taking their primary action. Lower is better.

| Budget | Context |
|---|---|
| ≤ 4 | Ideal for task-focused screens (shopping while in a store) |
| 5–7 | Acceptable for planning screens (seated, deliberate) |
| 8–10 | Warning — consider collapsing secondary actions |
| > 10 | Red flag — redesign required |

Count: every tab, button, input, link, and toggle that is visible without scrolling on a 375px screen.

### Progressive disclosure principle
Secondary actions, secondary information, and context-specific features must be hidden behind one interaction (tap, toggle, expand) unless they are needed on every single visit.

Candidates for progressive disclosure in Lunchfy:
- Budget cards / financial data → behind a toggle chip
- Weekly challenges → collapsible banner
- Bulk actions ("mark all") → overflow `···` menu
- Share/export → icon button, not labeled button
- Filter/sort options → bottom sheet, not persistent toolbar
- Historical data → secondary tab, not default view

### Mobile touch rules
- **Tap target minimum**: 44×44px (WCAG 2.5.5)
- **Spacing between targets**: ≥ 8px to prevent accidental activation
- **Swipe gestures**: only use if there is no other path — swipe is invisible
- **Long press**: never the only path to a feature
- **Bottom-heavy layout**: primary actions belong in the bottom 40% of the screen (thumb-reachable zone on phones held one-handed)
- **Sticky headers**: keep them to a maximum of 80px total — taller headers leave insufficient content area

### Feedback requirements
Every user action must produce a visible response within 100ms:
- Tap → pressed state (visual depression or color change)
- Async operation → spinner or skeleton, never a frozen UI
- Success → toast or inline confirmation (≤ 5s, dismissible)
- Error → inline message near the problematic element, not only a top banner
- Destructive action → confirmation (dialog or bottom sheet), never silent

### Information hierarchy law
Each screen has exactly one primary message or action. Everything else is secondary.

Hierarchy levels:
1. **Primary**: the single most important action/info — largest, highest contrast, most prominent
2. **Secondary**: supporting actions/info — present but visually subordinate
3. **Tertiary**: contextual, optional, or rare actions — hidden by default, revealed on demand

If the analysis finds two elements competing for level 1, that is a friction point.

### Screen archetypes in Lunchfy
Match the target screen to its archetype and apply the corresponding rule set:

| Archetype | Examples | Rule |
|---|---|---|
| **Task** | Lista de la compra (store mode), Guided Cooking | Minimize to ≤4 visible actions. No decorative UI. Speed is UX. |
| **Planning** | Semana / Week view, Meal picker | Allow 5–7 actions. Progressive disclosure for filters. |
| **Discovery** | Catálogo, Recetas | Allow browsing patterns (infinite scroll, filters visible). Up to 8 visible actions. |
| **Settings/Admin** | Admin panel, Settings | Grouped lists. Actions contextual, never global. |
| **Confirmation** | Purchase confirm, Delete confirm | Single primary action + cancel. Nothing else. |

## Analysis framework

### Step 1 — Cognitive load map

List every interactive element visible without scrolling on 375px. Format:

```
[N] ElementType "Label/Aria" — purpose — visible? (yes/no) — size estimate
```

Then state: **Interaction budget: N / 10**

### Step 2 — Primary action test

Answer: "What is the ONE thing the user must do on this screen?"

Then check:
- Is it the largest / highest-contrast element? (If not → friction point)
- Is it reachable without scrolling on 375px? (If not → friction point)
- Is it in the bottom 40% of the screen? (If not → improvement)
- Does anything else compete visually for the same attention? (If yes → friction point)

### Step 3 — Progressive disclosure audit

For each non-primary element, ask: "Does the user need this on every single visit?"

- Yes → keep visible
- No, but sometimes → collapse behind a toggle, chip, or `···` menu
- Rarely → move to a secondary screen or bottom sheet
- Almost never → remove or archive

### Step 4 — Flow efficiency

Count the taps required for the user's most common task on this screen.

State: **Task: [task name] — Taps required: N**

Benchmark:
- ≤ 2 taps: excellent
- 3 taps: acceptable
- 4 taps: should optimize
- ≥ 5 taps: redesign the flow

### Step 5 — Touch usability check

- Any tap target visually appearing < 44px? → defect
- Any two tap targets with < 8px visual gap? → defect
- Any swipe-only interaction? → defect (add fallback)
- Primary CTA reachable one-handed? → if in top 30% of screen, flag

### Step 6 — Feedback coverage

For each async or destructive action in the component, verify:
- Loading state exists
- Success state exists
- Error state exists near the action (not only in a global banner)

### Step 7 — Information hierarchy

Identify the visual weight of each element (approximate). State whether hierarchy is:
- **Clear**: one obvious level-1 element, clear subordination
- **Confused**: two or more elements competing for level 1
- **Flat**: everything appears equal weight — no visual leadership

## Output format

Respond with this exact structure.

---

### UX Review — [ScreenName / ComponentName]

**Archetype**: [Task / Planning / Discovery / Settings / Confirmation]
**Interaction budget**: [N] / 10 — [Aceptable / Advertencia / Alerta]
**Primary action identified**: [What it is, or "No clear primary action — friction point"]
**Tap count for primary task**: [N] taps

---

#### Mapa de fricción

Numbered list of friction points in severity order. Each point is a specific, observable problem.

**[F1] [Short title]** — 🔴 Crítico / 🟠 Importante / 🟡 Mejora
- **Observación**: [What specifically is the problem — cite element names, JSX line if known]
- **Impacto en usuario**: [Concrete consequence — "el usuario tarda X taps de más", "el usuario no sabe dónde mirar", etc.]
- **Causa raíz**: [Why this happens — layout, information architecture, missing state, etc.]

[Continue for all friction points]

---

#### Propuesta de reorganización

Describe the redesigned screen as a component tree / priority stack. Be concrete about what moves where.

```
SCREEN: [ScreenName] (375px, task archetype)
├── [VISIBLE] Header row: title + [icon cluster: refresh · share · ···]
├── [VISIBLE] Controls bar: week nav + tabs (one line)
├── [COLLAPSED → toggle] Budget section
├── [VISIBLE, PRIMARY] Add-input (48px, placeholder "¿Qué necesitas comprar?")
├── [VISIBLE] Item list (category cards with checkbox · name · qty)
└── [···  MENU] Bulk actions (mark all / unmark all)
```

Then explain the key decisions:
- What was collapsed and why
- What was promoted to primary and why
- What was moved to the overflow menu and why
- What tap count the new flow achieves

---

#### Cambios concretos por componente

For each change, specify the implementation approach:

**[C1] [What to change]**
- **Dónde**: `ComponentName.jsx` or `kitchen.css`
- **Tipo de cambio**: Colapsar / Mover a menú / Redimensionar / Reordenar / Añadir estado / Eliminar
- **Implementación**:
```jsx
// Concrete JSX or CSS snippet
```
- **Tap delta**: [–N taps] / [Sin cambio en taps pero reduce carga cognitiva]

---

#### Priorización

Ordered by impact-per-effort ratio. First item = do it now.

| # | Cambio | Impacto | Esfuerzo | Hacer |
|---|---|---|---|---|
| 1 | [Change] | Alto/Medio/Bajo | Alto/Medio/Bajo | Ahora |
| 2 | ... | ... | ... | Esta semana |
| 3 | ... | ... | ... | Backlog |

---

#### Estado UX general

`Excelente — apto para producción` / `Aceptable — mejoras menores recomendadas` / `Requiere trabajo — fricción significativa` / `Bloqueante — rediseño necesario`

---

## Behavior rules

- **Mobile-first always**: every proposal must work on 375px one-handed. Desktop is a bonus.
- **No theory**: "consider improving information architecture" is not acceptable. Say exactly which element moves where and what the JSX change is.
- **Preserve functionality**: never propose removing a feature. Only collapse, reorder, or move it behind one interaction.
- **Respect the stack**: proposals must be implementable in React + kitchen.css. No third-party libraries, no new state management patterns, no new routing.
- **Cite evidence**: every friction point must reference a specific element, line, or behavior. No vague impressions.
- **Count taps**: the tap-count delta is the primary metric. A change that saves 2 taps is worth 10 color tweaks.
- **Screenshot analysis**: if given a screenshot without code access, count visible elements, identify the visual primary action, and describe what to look for in the JSX. Be explicit about what you can confirm visually vs. what needs code verification.
