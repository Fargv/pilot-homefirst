---
name: HomeFirst
description: App de menús semanales para familias — organizada, cálida, sin fricción.
default_theme: tomato-cream
brand: "#C6533F"
brand_dark: "#9F3F31"
surface: "#FFFFFF"
surface_bg: "#FAF6F1"
surface_muted: "#F0E9E1"
text: "#25211D"
text_muted: "#706A63"
border: "#E5DDD3"
danger: "#b42318"
---

# Design System: HomeFirst

## 1. Visual Positioning

HomeFirst is a domestic tool — it helps families plan meals and shop without friction. It should feel like a well-designed kitchen notebook, not like a SaaS dashboard or a recipe blog.

The previous indigo/periwinkle palette looked generic. It is the default output of a prompt. Any product designer looking at it for three seconds would know it was AI-generated. That is not acceptable for a product used daily by real households.

The new identity is warm, editorial, and practical. The brand color is a muted tomato-red. The surfaces are cream and ivory. Typography stays Montserrat with strong weights. The result feels like something a real designer chose — because it was.

**What the product should feel like:**
- A quality domestic tool, not a startup MVP
- Warm and human, not sterile and corporate
- Confident in its simplicity, not trying to look like more than it is
- The visual equivalent of a well-organized recipe binder on a real kitchen counter

**References (direction, not copy):**
- Calm (breathing space, restraint in color)
- Airbnb (warm neutrals, hierarchical but approachable)
- Monocle / Kinfolk (editorial warmth without preciousness)

**Anti-references — do not look like these:**
- Any purple/indigo SaaS tool
- Recipe blogging templates (amateur, image-heavy, no hierarchy)
- AI productivity dashboards (sterile, gradient-heavy, dark-on-dark)
- Fintech apps (navy, sharp corners, trust signaling overload)
- Gamification apps aimed at children (toyish colors, confetti everywhere)

---

## 2. Theme System

Themes are defined in `frontend/src/context/appThemes.js`. Each theme is a named token set injected onto `:root` at runtime via `ThemeContext.jsx`. The `:root` block in `kitchen.css` holds the Tomato Cream defaults — these are only visible before JS hydrates.

### Default themes (Basic plan)
| ID | Name | Mode | Character |
|---|---|---|---|
| `tomato-cream` | Tomato | Light | **Default.** Warm ivory ground, tomato brand, cream surfaces |
| `soft-blue-kitchen` | Slate Kitchen | Light | Calm slate blue, linen surfaces, planning feel |
| `periwinkle-lavender` | Classic Indigo | Light | Legacy indigo (kept for users who prefer it) |
| `jet-whale` | Jet Stream | Dark | Default dark — teal on deep ocean |

### Premium themes
| ID | Name | Mode |
|---|---|---|
| `blush-tomato` | Blush Tomato | Light |
| `royal-pink` | Royal Blue | Light |
| `sage-cream` | Sage | Light |
| `peach-vanilla` | Peach Blossom | Light |
| `lavender-mist` | Lavender Mist | Light |
| `bright-stone` | Bright Sun | Dark |
| `turquoise-black` | Turquoise | Dark |
| `midnight-forest` | Midnight Forest | Dark |
| `deep-ocean` | Deep Ocean | Dark |
| `warm-ember` | Warm Ember | Dark |
| `sulu-fir` | Sulu | Light |

### Theme rules
- Never delete a theme that has been shipped. Users may have it stored.
- Never hardcode brand colors directly in components. Always use `--hf-brand`, `--button-primary-bg`, `--nav-active-text`, etc.
- When adding a new theme, define all 40+ tokens. A theme with missing tokens will partially inherit from the previous theme and look wrong.
- `DEFAULT_THEME_ID` and `DEFAULT_DARK_THEME_ID` are the fallbacks for Basic users and OS-preference detection.
- Premium themes fall back to the Basic default of the same mode when a user downgrades.

### Token naming convention
- `--app-bg`: page background
- `--surface`: card/modal/panel background
- `--surface-muted`: subtle element background (tags, highlights)
- `--text-primary`, `--text-secondary`, `--text-muted`: text hierarchy
- `--border-soft`, `--border-strong`, `--border-focus`: border states
- `--button-primary-bg`, `--button-primary-text`: main CTA
- `--hf-brand`: the semantic brand color (used throughout for brand accents)
- `--hf-brand-dark`: hover/pressed state of brand
- `--hf-brand-rgb`: brand as `R, G, B` values (for use in `rgba()`)
- `--nav-active-bg`, `--nav-active-text`: active navigation state
- `--chip-active-bg`, `--chip-active-text`: active filter/tab state

---

## 3. Default Palette: Tomato Cream

The primary palette. Not decorative — functional. Every value has a job.

| Token | Value | Use |
|---|---|---|
| `--hf-brand` | `#C6533F` | Primary actions, active states, focus rings |
| `--hf-brand-dark` | `#9F3F31` | Hover and pressed on brand elements |
| `--hf-brand-light` | `#E07860` | Accent, secondary highlights |
| `--app-bg` | `#FAF6F1` | Page background |
| `--surface` | `#FFFFFF` | Cards, modals, inputs |
| `--surface-muted` | `#F0E9E1` | Tag backgrounds, row highlights |
| `--text-primary` | `#25211D` | Primary content |
| `--text-secondary` | `#4A3F38` | Supporting content |
| `--text-muted` | `#706A63` | Metadata, captions |
| `--border-soft` | `#E5DDD3` | Card and input borders at rest |
| `--border-focus` | `#C6533F` | Focus state border |
| `--hf-danger` | `#B42318` | Destructive actions, errors |

---

## 4. Typography

**Font:** Montserrat — `"Montserrat", "Segoe UI", system-ui, -apple-system, sans-serif`

No display font. No variable weight. No system fallback that looks different on Windows. Montserrat carries the whole hierarchy through weight and size.

### Scale
| Role | Size | Weight | Line height | Use |
|---|---|---|---|---|
| Headline | 22px | 800 | 1.2 | Page titles, header titles |
| Title | 18–20px | 700 | 1.3 | Modal titles, card names |
| Body | 14–15px | 600 | 1.5 | Form labels, card content, list items |
| Label | 12px | 700 | 1.2 | Badges, uppercase metadata, status pills |
| Caption | 11–13px | 600 | 1.4 | Timestamps, counts, helper text |

**Rule: no font-weight below 600 in any visible element.** The product is concise and decisive. A regular weight here would look unfinished.

**Rule: body line length ≤ 68ch.** Mobile is shorter. Don't let long paragraphs exist in the UI — if something needs more than 3 sentences, it belongs in an onboarding screen, not a card.

---

## 5. Elevation

Shadows answer a single question: "is this floating above something else?" If the answer is no, there is no shadow.

| Level | Value | Use |
|---|---|---|
| Flat | none | Inline elements, non-interactive list rows |
| Card | `0 1px 3px rgba(0,0,0,0.06), 0 4px 16px rgba(0,0,0,0.07)` | Content cards at rest |
| Lifted | `0 4px 6px rgba(0,0,0,0.06), 0 8px 24px rgba(0,0,0,0.10)` | Cards on hover, floating UI |
| Overlay | `0 16px 48px rgba(0,0,0,0.16)` | Modals, drawers, bottom sheets |
| Brand | `0 8px 22px rgba(198,83,63,0.26)` | Primary CTA buttons (theme-specific) |

**Rule:** shadows are responses to elevation state, not decoration. A list item with a shadow and no hover state is wrong.

---

## 6. Components

### Buttons

Pills: `border-radius: 999px`. This is not negotiable. A rectangular button in this system is a vocabulary error.

| Variant | Background | Text | Use |
|---|---|---|---|
| Primary | `--button-primary-bg` | `--button-primary-text` | One per screen area. The main action. |
| Secondary | `--button-secondary-bg` | `--button-secondary-text` | Supporting actions adjacent to primary |
| Ghost | `transparent` + `--border-soft` border | `--text-primary` | Cancel, dismiss, tertiary |
| Danger | `#B42318` | `#FFFFFF` | Irreversible destructive actions only |

- `min-height: 44px` on all mobile tap targets
- `font-weight: 700` on button labels
- Focus: `outline: 2px solid color-mix(in srgb, var(--hf-brand) 40%, transparent); outline-offset: 2px`
- Disabled: `opacity: 0.55; cursor: not-allowed`
- Hover on primary: lighten to `--hf-brand-dark`. Do not use a glow or scale transform.

### Cards

- `border-radius: 16–24px` on content cards (`--radius-lg`, `--radius-xl`)
- Background: `--surface` (`#FFF`) always. Cards do not take the page background color.
- Border: `1px solid var(--card-border)` when on a muted background; omit when a shadow is sufficient
- Internal padding: 20–24px standard, 14–16px compact list items
- Do not nest cards. If you're putting a card inside a card, rethink the layout.
- Do not add a shadow to a card that has no hover state.

### Modals

- Background: `--modal-bg`
- Border: `1px solid var(--modal-border)`
- `border-radius: 20–24px`
- Overlay: `rgba(0,0,0,0.44)` backdrop
- Header: title (700, 17px) + optional subtitle, padding 20–24px
- Footer: action buttons right-aligned; cancel on left if included
- Destructive modals: body text must name the consequence clearly ("Se eliminará este plato permanentemente"). The danger button goes last.
- Do not put raw forms inside modals without visual breathing room. 20px padding minimum.
- Do not use a modal for something that can live inline or in a bottom sheet.

### Inputs and Forms

- `border-radius: 14px` (`--radius-md`)
- Height: `44px` (`--input-height`)
- Border: `1px solid var(--input-border)` at rest
- Focus: border becomes `--input-focus-border` (the brand color), no outer glow
- Placeholder: `--input-placeholder` color, `font-weight: 500` (lighter than input text)
- Error: border becomes `--hf-danger`, inline error message below the field in `--danger-text`
- Label: `font-weight: 700`, `font-size: 13px`, `margin-bottom: 6px`, always above the field
- Disabled: `opacity: 0.55`
- Select elements: styled consistently with inputs — no default OS chrome

### Chips, Pills, Badges

- Chips and filter pills: `border-radius: 999px`, `font-weight: 700`, `font-size: 12–13px`
- Inactive: `--chip-bg` background, `--chip-text` text, `--chip-border` border
- Active: `--chip-active-bg` background, `--chip-active-text` text, no border or brand border
- Status badges: semantic colors only (success/warning/danger/info). Do not invent new badge colors.
- Category chips: user-defined color. Use `--category-bg` and `--category-text` from context.
- Do not use random colors for badges that do not represent a semantic state.

### Navigation

- Top-level mobile nav: fixed bottom bar, `backdrop-filter: blur(14px)`, `--nav-bg` background
- Active tab: `--nav-active-bg` fill on icon area, `--nav-active-text` color
- Desktop top nav: sticky, `border-bottom: 1px solid var(--border-soft)`
- Active link: brand color text + subtle background tint
- Never use more than 5 items in bottom nav

### Page Headers (phdr-* system)

The shared page header uses the `.phdr-*` component classes defined in `kitchen.css`. See the "STANDARD PAGE HEADER EXTENSIONS" section for the full class list.

- Pill segmented tabs: `.phdr-seg-group` / `.phdr-seg` / `.phdr-seg.is-active`
- Search row: `.phdr-search-row` / `.phdr-search-input` / `.phdr-icon-btn`
- Primary CTA: `.phdr-cta-btn`
- Filter indicator dot: `.phdr-filter-dot`

All tab active states use `--button-primary-bg`. All inputs use `--border-soft` / `--border-focus`. All icon buttons use `--surface` / `--border-soft`.

---

## 7. Landing Page

The landing page inherits the app token system via `landing.css`. When the default theme changes, the landing page changes automatically.

Rules:
- Hero: use `--hf-bg-gradient` as background. No custom gradient.
- Eyebrow labels: `--hf-brand` text, `--app-bg-soft` background
- Hero title: 800 weight, `clamp(2rem, 5.5vw, 3.2rem)`
- Section alt rows: `--surface-muted` background — not a new color
- Feature cards: same card rules as above
- Pricing: recommended plan gets `--hf-brand` border
- CTAs: use `kitchen-button` classes, not custom button styles
- No custom purple/indigo overrides in landing content

---

## 8. Gamification and Rewards

Gamification should feel like a quality achievement — not like a children's app rewarding you for clicking a button.

- XP/reward toasts: clean, brief, brand-color accent. No confetti animation by default.
- Achievement banners: use card-like surface with brand accent. Keep it compact.
- Challenge cards: structured like any other card. Color only for semantic states (active/complete/locked).
- Progress indicators: thin, brand-colored. Not animated loops.
- Avoid: star explosions, rainbow gradients, oversized animations, "level up!" text in comic sans energy.

---

## 9. Motion

Motion must earn its place. If an animation can be removed and the user doesn't notice, it should be removed.

| Role | Duration | Easing |
|---|---|---|
| Micro feedback (tap, press) | 80–120ms | ease-out |
| Component transitions (expand, reveal) | 180–250ms | ease-out-quart |
| Page/route transitions | 250–350ms | ease-out-quart |
| Overlay in/out | 200–280ms | ease-out |

- Easing: always ease-out for entries. Slightly faster ease-in for exits.
- Never animate layout properties (`width`, `height`, `top`, `left`). Use `transform` and `opacity`.
- Never bounce or spring on functional UI. Reserve spring curves for deliberate delight moments (reward, first-run).
- Always respect `prefers-reduced-motion`. The media query block at the end of `kitchen.css` handles this globally — any new animation must work within it.

---

## 10. Accessibility

- Color contrast: minimum 4.5:1 for text on backgrounds (WCAG AA). Check `--text-muted` on `--surface-muted` on each theme.
- Focus states: visible on all interactive elements. `outline: 2px solid color-mix(in srgb, var(--hf-brand) 40%, transparent); outline-offset: 2px`
- Color is never the only indicator of state. Pair color with shape, icon, or text.
- Touch targets: `min-height: 44px` on all tappable elements.
- Semantic HTML: buttons are `<button>`, links are `<a>`, form fields have `<label>`.
- `aria-label` on icon-only buttons.

---

## 11. Do / Don't

### Do
- Use `--hf-brand` and the semantic tokens. Never hardcode brand hex values in components.
- Keep primary actions at one per screen area. The brand color earns its emphasis from scarcity.
- Use `font-weight: 600` minimum on all visible text.
- Use `min-height: 44px` on all mobile touch targets.
- Communicate state with color + shape/icon/text, never with color alone.
- Use `prefers-reduced-motion` — already global in `kitchen.css`.
- Make destructive action consequences explicit in writing before the confirm button.

### Don't
- Don't use purple or indigo as a primary brand color. The `periwinkle-lavender` theme is legacy, not the identity.
- Don't use gradient text (`background-clip: text` + gradient). Not in this vocabulary.
- Don't use glassmorphism on cards or modals. It is only justified on the sticky nav.
- Don't add a colored border stripe to a card side (`border-left: 4px solid brand`). It is a design cliché.
- Don't use color for status without a paired visual indicator.
- Don't put raw form fields inside a modal without padding.
- Don't nest cards.
- Don't add shadows to elements that are not elevated.
- Don't use `font-weight: 400` anywhere in product UI.
- Don't use the hero gradient (`--hf-bg-gradient`) on internal surfaces.
- Don't create new color values for elements that should use existing semantic tokens.
- Don't use animations on layout properties.
- Don't use confetti, star explosions, or oversized reward animations in gamification.
