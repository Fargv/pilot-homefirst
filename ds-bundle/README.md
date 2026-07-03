# LunchfyKitchen (lunchfy-kitchen@1.0.0)

This design system is the published lunchfy-kitchen React library, bundled as a single
browser global. All 21 components are the real upstream code.

## Where things are

- `_ds_bundle.js` — the whole-DS bundle at the project root; loads every component to `window.LunchfyKitchen`. First line is a `/* @ds-bundle: … */` metadata header.
- `styles.css` — the single stylesheet entry: it `@import`s the tokens, fonts, and component styles (`_ds_bundle.css`). Link this one file.
- `components/<group>/<Name>/<Name>.prompt.md` (example JSX + variants), `<Name>.d.ts` (types), `<Name>.html` (variant grid).
- `tokens/*.css` — CSS custom properties, names verbatim from upstream.
- `fonts/` — `@font-face` files + `fonts.css` (when the package ships fonts).

For a specific component, `read_file("components/<group>/<Name>/<Name>.prompt.md")`.

## Loading

Add these two lines to your page once (React must be on the page first):

```html
<link rel="stylesheet" href="styles.css">
<script src="_ds_bundle.js"></script>
```

Components are then available at `window.LunchfyKitchen.*`. Mount into a dedicated child node (e.g. `<div id="ds-root">`), not the host page's own React root, so the two trees don't collide:

```jsx
const { AvatarStack } = window.LunchfyKitchen;
ReactDOM.createRoot(document.getElementById('ds-root')).render(<AvatarStack />);
```

Wrap the tree in the provider — most components read theme/i18n from context:

```jsx
<KitchenProvider>{children}</KitchenProvider>
```

## Tokens

146 CSS custom properties from lunchfy-kitchen. Names are
preserved verbatim from upstream. They are declared inside `_ds_bundle.css` (this DS ships one compiled stylesheet rather than separate token files).

- **color** (29): `--hf-bg-gradient`, `--app-bg-soft`, `--surface`, …
- **spacing** (8): `--space-1`, `--space-2`, `--space-3`, …
- **radius** (10): `--hf-radius-md`, `--hf-radius-lg`, `--hf-radius-xl`, …
- **shadow** (10): `--card-shadow`, `--shadow-card`, `--hf-shadow-soft`, …
- **other** (89): `--app-bg`, `--input-bg`, `--input-border`, …

## Components

### general
- `AvatarStack`
- `Badge`
- `BottomNav`
- `Button`
- `Card`
- `CategoryChip`
- `DatePickerField`
- `DinnerUpgradeBanner`
- `Fab`
- `Header`
- `Input`
- `KitchenProvider`
- `ModalSheet`
- `PageHeader`
- `ProBadge`
- `SearchableSelect`
- `Skeleton`
- `WeekDatePicker`
- `WeekDayTabs`
- `WeekNavigator`

### rewards
- `MilestoneToast`
