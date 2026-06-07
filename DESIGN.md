---
name: HomeFirst
description: La app de menús semanales para familias — organizada, cálida, sin fricción.
colors:
  brand: "#4f46e5"
  brand-dark: "#4338ca"
  surface: "#ffffff"
  surface-bg: "#f8fafc"
  surface-soft: "#eef2ff"
  surface-mint: "#f0fdf4"
  surface-peach: "#fff7ed"
  text: "#1e293b"
  text-muted: "#667085"
  border: "#e4e7ec"
  danger: "#b42318"
typography:
  headline:
    fontFamily: "Montserrat, \"Segoe UI\", system-ui, -apple-system, sans-serif"
    fontSize: "22px"
    fontWeight: 700
    lineHeight: 1.2
    letterSpacing: "normal"
  title:
    fontFamily: "Montserrat, \"Segoe UI\", system-ui, -apple-system, sans-serif"
    fontSize: "18px"
    fontWeight: 700
    lineHeight: 1.3
    letterSpacing: "normal"
  body:
    fontFamily: "Montserrat, \"Segoe UI\", system-ui, -apple-system, sans-serif"
    fontSize: "14px"
    fontWeight: 600
    lineHeight: 1.5
    letterSpacing: "normal"
  label:
    fontFamily: "Montserrat, \"Segoe UI\", system-ui, -apple-system, sans-serif"
    fontSize: "12px"
    fontWeight: 700
    lineHeight: 1.2
    letterSpacing: "0.04em"
rounded:
  pill: "999px"
  lg: "24px"
  md: "14px"
  sm: "10px"
  xs: "8px"
spacing:
  xs: "8px"
  sm: "12px"
  md: "16px"
  lg: "24px"
  xl: "32px"
components:
  button-primary:
    backgroundColor: "{colors.brand}"
    textColor: "{colors.surface}"
    rounded: "{rounded.pill}"
    padding: "12px 16px"
  button-primary-hover:
    backgroundColor: "{colors.brand-dark}"
    textColor: "{colors.surface}"
    rounded: "{rounded.pill}"
    padding: "12px 16px"
  button-secondary:
    backgroundColor: "{colors.surface-soft}"
    textColor: "{colors.text}"
    rounded: "{rounded.pill}"
    padding: "12px 16px"
  button-ghost:
    backgroundColor: "transparent"
    textColor: "{colors.text}"
    rounded: "{rounded.pill}"
    padding: "12px 16px"
  input:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.text}"
    rounded: "{rounded.lg}"
    padding: "11px 12px"
  card:
    backgroundColor: "{colors.surface}"
    rounded: "{rounded.lg}"
    padding: "{spacing.lg}"
---

# Design System: HomeFirst

## 1. Overview

**Creative North Star: "La Cocina Organizada"**

HomeFirst es la herramienta que hace desaparecer el caos doméstico del menú semanal. Su diseño sigue la misma lógica: cada elemento en su lugar, nada sobrando. Como una cocina bien organizada donde los utensilios están exactamente donde los esperas, la UI no sorprende — libera. El usuario llega, encuentra lo que necesita, actúa, y se va.

La paleta extrae su personalidad del delantal del chef: el índigo (`#4f46e5`) es preciso y confiable, nunca decorativo. Los fondos son claros casi hasta el blanco, con gradientes sutiles que dan profundidad sin llamar atención. Los bordes redondeados (24-32px en superficies mayores) aportan calidez doméstica sin caer en la infantilización. La sombra es ambiental y discreta — eleva sin teatralidad.

Este sistema rechaza expresamente la formalidad institucional de las apps bancarias y corporativas: sin grises planos, sin tablas densas, sin botones rectangulares apagados. También rechaza el extremo opuesto: sin gradientes de arco iris, sin glassmorphismo agresivo, sin confeti de onboarding. La referencia es Calm (espacio en blanco que respira) cruzada con Airbnb (calidez controlada, jerarquía visual impecable).

**Key Characteristics:**
- Índigo como único color de acción — raro, por eso importa
- Superficies en blanco puro o muy cercano al blanco; los tintes de color van en las fichas y badges, no en los fondos de página
- Tipografía Montserrat con pesos 600/700 — no hay texto normal, todo comunica con intención
- Esquinas muy redondeadas (24px+) en contenedores, píldoras (999px) en controles pequeños
- Sombra ambiental y funcional; nunca decorativa

## 2. Colors: La Paleta del Orden

Un sistema restringido donde el índigo es la única voz de acción.

### Primary
- **Índigo Activo** (`#4f46e5`): El único color de acción de la app. Botones primarios, estados activos en navegación, elementos seleccionados, toggles activos, focus rings. Su rareza en el 90% del canvas es lo que lo hace funcionar.
- **Índigo Profundo** (`#4338ca`): Hover y pressed sobre el Índigo Activo. Nunca aparece como estado de reposo; solo como respuesta a la interacción.

### Neutral
- **Blanco Superficie** (`#ffffff`): Cards, modales, inputs, panels. La superficie de trabajo.
- **Blanco Página** (`#f8fafc`): El fondo general de la app — no puro blanco, sino levemente frío.
- **Índigo Suave** (`#eef2ff`): Fondo de elementos activos en nav y chips de selección. El índigo en su forma más discreta.
- **Verde Menta** (`#f0fdf4`): Superficie para estados positivos o de éxito ligero.
- **Melocotón** (`#fff7ed`): Superficie para advertencias o estados de atención.
- **Texto Principal** (`#1e293b`): Todo el texto primario — títulos, labels, contenido.
- **Texto Atenuado** (`#667085`): Metadatos, subtítulos, copy secundario. Mínimo 4.5:1 sobre fondos claros.
- **Borde** (`#e4e7ec`): Separadores, bordes de input y card. Casi invisible pero estructurante.
- **Peligro** (`#b42318`): Errores, acciones destructivas, validación fallida.

### Named Rules
**La Regla del Color Único.** El Índigo Activo (`#4f46e5`) se usa en estados de acción e interacción únicamente. Nunca como color decorativo, nunca en texto largo, nunca en más de un elemento por fila visual. Su escasez es el punto.

**La Regla del Gradiente de Página.** El fondo de la app usa un gradiente `linear-gradient(180deg, rgba(238,242,255,0.72) 0%, rgba(240,253,244,0.5) 42%, rgba(248,250,252,0.96) 100%)` — una transición de índigo suave a menta a blanco. Es invisible en uso pero da profundidad atmosférica. Prohibido en cards o superficies internas.

## 3. Typography

**Display/Body Font:** Montserrat (con fallback `"Segoe UI"`, `system-ui`, `-apple-system`, `sans-serif`)
**No hay fuente de display distinta** — Montserrat carga toda la jerarquía con peso y tamaño.

**Character:** Geométrica y cálida al mismo tiempo. El peso 700 en títulos da autoridad sin frialdad; el 600 en body da consistencia sin monotonía. La escala tipográfica es compacta (ratio ~1.2) — esto es una herramienta, no una revista.

### Hierarchy
- **Headline** (700, 22px, 1.2): Títulos de página y sección — `.kitchen-title`, headers de card. Primera cosa que lee el ojo.
- **Title** (700, 18–20px, 1.3): Títulos de modal, nombres de platos en tarjetas. Un nivel por debajo sin perder autoridad.
- **Body** (600, 14–15px, 1.5): Todo el contenido de acción: etiquetas de form, texto en cards, opciones de menú. El 600 (semi-bold) es intencionado — nunca texto normal aquí.
- **Label** (700, 12px, 1.2, `letter-spacing: 0.04em`): Badges de estado, categorías uppercase, metadata auxiliar. Siempre acompañado de color de estado.
- **Caption** (600, 11–13px, 1.4): Timestamps, contadores, subtítulos de dato. Siempre en `--hf-muted`.

### Named Rules
**La Regla del Semi-Bold Mínimo.** Este sistema no usa `font-weight: 400` en ningún elemento visible. El mínimo es 600. La app es concisa, no laxa — el peso tipográfico lo refleja.

## 4. Elevation

El sistema usa sombras ambientales y estructurales — nunca decorativas. La profundidad no es espectáculo; es arquitectura visual.

### Shadow Vocabulary
- **Ambient Surface** (`0 10px 25px -5px rgba(0, 0, 0, 0.05)`): Cards y panels en reposo. Suficiente para separar del fondo de página; insuficiente para llamar atención.
- **Card Lift** (`0 10px 30px rgba(15, 23, 42, 0.08)`): Cards de platos y semana. Elevación ligera en reposo.
- **Overlay Deep** (`0 24px 60px rgba(15, 23, 42, 0.20)`): Modales y drawers. El mayor valor del sistema — reservado para cosas que flotan sobre toda la UI.
- **Focus Ring** (`outline: 2px solid color-mix(in srgb, var(--hf-brand) 40%, transparent); outline-offset: 2px`): Estado de foco para teclado. No es sombra sino contorno — coherente con WCAG AA.

### Named Rules
**La Regla del Flat en Reposo.** Las superficies están planas en reposo. La sombra es una respuesta a estado (hover, elevación por z-index, superposición de modal), no una decoración aplicada a todo.

## 5. Components

### Buttons
Los botones son píldoras — `border-radius: 999px`. Esta decisión es sistémica y no se rompe. Un botón rectangular aquí sería un error de vocabulario.

- **Primary:** Fondo `--hf-brand` (`#4f46e5`), texto blanco, `padding: 12px 16px`, `font-weight: 700`. Hover: `--hf-brand-dark` (`#4338ca`). `min-height: 48px` en móvil.
- **Secondary:** Fondo `--hf-surface-soft` (`#eef2ff`), texto `--hf-text`, borde `--hf-border`. Misma geometría que el primario.
- **Ghost:** Fondo transparente, borde `--hf-border`, texto `--hf-text`. Para acciones terciarias — destruir, cancelar.
- **Danger:** Fondo `#b42318`, texto blanco. Solo para acciones destructivas irreversibles.
- **Focus:** `outline: 2px solid color-mix(in srgb, var(--hf-brand) 40%, transparent); outline-offset: 2px`. Siempre presente — WCAG AA no es opcional.
- **Disabled:** `opacity: 0.65; cursor: not-allowed`. Sin cambio de forma.

### Cards / Containers
- **Corner Style:** `border-radius: 24px` (--hf-radius-lg) para cards principales, modales, y panels. `border-radius: 14px` para cards secundarias (listas de platos, items de spesa).
- **Background:** `--hf-surface` (#fff) siempre. Las cards nunca toman el color de fondo de página.
- **Shadow:** Ambient Surface en reposo; Card Lift en cards de semana.
- **Border:** Opcional — `1px solid --hf-border` en cards con fondo #f8fafc o sin sombra propia.
- **Internal Padding:** 24px (`--spacing-lg`) estándar; 16–20px en cards compactas.

### Inputs / Fields
- **Style:** Borde `1px solid --hf-border`, fondo blanco, `border-radius: 24px` (--hf-radius-lg).
- **Font size:** 14px mínimo en móvil (evita zoom automático en iOS).
- **Focus:** `outline: 2px solid color-mix(in srgb, var(--hf-brand) 35%, white); outline-offset: 1px`.
- **Error:** Borde `--hf-danger`, mensaje inline en rojo debajo del campo.
- **Disabled:** `opacity: 0.65`.

### Chips / Pills
- **Filter chips:** `border-radius: 999px`, fondo `#f8fafc`, borde `--hf-border`. Activo: fondo `--hf-surface-soft`, borde `rgba(--hf-brand, 0.5)`.
- **Status pills:** `border-radius: 999px`, 11–12px, `font-weight: 600`, color semántico por estado (success/warning/info/danger).
- **Category chips:** Color de fondo y texto definidos por la paleta de categorías del usuario (personalizables).

### Navigation
- **Desktop (top bar):** Sticky, fondo blanco, `border-bottom: 1px solid --hf-border`. Links 14px/600, activo: fondo `--hf-surface-soft`, color `--hf-brand`.
- **Mobile (bottom nav):** Fixed, `backdrop-filter: blur(12px)`, fondo `rgba(255,255,255,0.7)`. 4 tabs, iconos 22px stroke, labels 12px/600. Tab activa: fondo `--hf-surface-soft`, color `--hf-brand`.

### Signature Component: Day Cards (WeekPage)
Las tarjetas de día son el corazón visual de la app. Cada día tiene un color de fondo tenue y distinto (índigo pálido el lunes, cian el martes, amarillo el miércoles, etc.) — una paleta pastel para el reconocimiento rápido de día sin comprometer legibilidad. `border-radius: 16–24px`, padding generoso, `min-height: 288–310px`.

## 6. Do's and Don'ts

### Do:
- **Do** usar `--hf-brand` (`#4f46e5`) exclusivamente para acciones, estados activos y foco. Un elemento por fila visual como máximo.
- **Do** mantener `border-radius: 999px` en todos los botones y controles pequeños (toggles, chips, pills). La píldora es el vocabulario de este sistema.
- **Do** usar `font-weight: 600` o `700` en todo texto visible. Nunca 400 ni 500.
- **Do** usar `min-height: 44px` en todos los targets táctiles en móvil — el sistema ya los cumple salvo `.kitchen-button.is-small` (revisar caso por caso).
- **Do** usar `prefers-reduced-motion` — ya incluido al final de kitchen.css. Toda animación nueva debe respetar este media query.
- **Do** comunicar estados con color + forma (nunca solo color) para cumplir con WCAG y daltónicos.

### Don't:
- **Don't** usar apps bancarias, corporativas o de administración como referencia (Santander, BBVA, SAP). Prohibido el gris plano, las tablas densas sin respiración, los botones rectangulares apagados.
- **Don't** añadir un segundo color de acción. El índigo es el único. Un segundo acento compite y rompe "La Regla del Color Único".
- **Don't** usar `color: #98a2b3` ni ningún valor más claro que `#667085` para texto sobre fondo claro — falla WCAG AA (ratio mínimo 4.5:1).
- **Don't** usar `font-weight: 400` en ningún texto del producto.
- **Don't** añadir gradientes de texto (`background-clip: text`) — no están en el vocabulario de este sistema.
- **Don't** usar glassmorphismo más allá del header/bottom-nav ya existente. El `backdrop-filter: blur(12px)` está justificado en esos dos elementos. Extenderlo a cards o modales sería sobreutilizarlo.
- **Don't** aplicar el gradiente de fondo de página (`--hf-bg-gradient`) en superficies internas — solo en el canvas raíz de la app.
- **Don't** usar `clamp()` para tipografía en pantallas de producto (dashboard, listados, formularios). Las pantallas tipo "landing" del login pueden usarlo; el core product no.
