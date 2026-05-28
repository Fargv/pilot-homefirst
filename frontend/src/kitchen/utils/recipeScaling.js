/**
 * recipeScaling.js — Ingredient quantity scaling utilities for recipes.
 *
 * Quantity object shape (stored in KitchenDish.recipe.ingredients[].quantity):
 *   {
 *     amount:       Number | null   — numeric value, null for "al gusto"
 *     unit:         String          — one of RECIPE_UNITS[].value
 *     scalable:     Boolean         — false → keep amount unchanged
 *     note:         String?         — e.g. "de vino" for "1 vaso de vino"
 *     originalText: String?         — preserved legacy text
 *   }
 *
 * Backward compat: if quantity is a plain string, display it as-is and
 * attempt conservative parsing only when targetServings is set.
 */

export const RECIPE_UNITS = [
  { value: "g",           label: "g",           scalable: true  },
  { value: "kg",          label: "kg",          scalable: true  },
  { value: "ml",          label: "ml",          scalable: true  },
  { value: "l",           label: "l",           scalable: true  },
  { value: "unidad",      label: "unidad",      scalable: true  },
  { value: "unidades",    label: "unidades",    scalable: true  },
  { value: "cucharadita", label: "cucharadita", scalable: true  },
  { value: "cucharada",   label: "cucharada",   scalable: true  },
  { value: "cucharadas",  label: "cucharadas",  scalable: true  },
  { value: "taza",        label: "taza",        scalable: true  },
  { value: "tazas",       label: "tazas",       scalable: true  },
  { value: "vaso",        label: "vaso",        scalable: true  },
  { value: "vasos",       label: "vasos",       scalable: true  },
  { value: "pizca",       label: "pizca",       scalable: false },
  { value: "al gusto",    label: "al gusto",    scalable: false },
  { value: "oz",          label: "oz",          scalable: true  },
  { value: "lb",          label: "lb",          scalable: true  },
];

const NON_SCALABLE_UNITS = new Set(["al gusto", "pizca"]);

export function isUnitScalable(unit) {
  return !NON_SCALABLE_UNITS.has(unit);
}

function getRoundType(unit) {
  if (unit === "g" || unit === "ml") return "weight";
  if (unit === "kg" || unit === "l" || unit === "oz" || unit === "lb") return "decimal";
  return "fraction";
}

/**
 * Format a scaled amount intelligently based on its unit.
 * Returns null if amount is not a valid number.
 */
export function formatScaledAmount(amount, unit) {
  if (amount === null || amount === undefined || isNaN(amount)) return null;
  const rt = getRoundType(unit);

  if (rt === "weight") {
    if (amount < 10) return String(+amount.toFixed(1));
    if (amount < 100) return String(Math.round(amount / 5) * 5);
    return String(Math.round(amount / 10) * 10);
  }

  if (rt === "decimal") {
    return String(+amount.toFixed(2));
  }

  // Fraction: round to nearest quarter, use unicode fraction glyphs
  const q = Math.round(amount * 4) / 4;
  const whole = Math.floor(q);
  const frac = Math.round((q - whole) * 4);
  const fracGlyph = ["", "¼", "½", "¾"][frac] ?? "";
  if (whole === 0 && !fracGlyph) return "0";
  if (!fracGlyph) return String(whole);
  if (whole === 0) return fracGlyph;
  return `${whole} ${fracGlyph}`;
}

/**
 * Scale a structured quantity object.
 * Leaves the object unchanged when scalable === false or when
 * baseServings / targetServings are missing / equal.
 */
export function scaleIngredientQuantity(qty, baseServings, targetServings) {
  if (!qty || typeof qty !== "object") return qty;
  if (qty.scalable === false) return qty;
  if (typeof qty.amount !== "number" || qty.amount === null) return qty;
  if (!baseServings || !targetServings || baseServings <= 0) return qty;
  if (baseServings === targetServings) return qty;
  return { ...qty, amount: qty.amount * (targetServings / baseServings) };
}

/**
 * Returns the display string for an ingredient, scaling if possible.
 * Works with both legacy string quantities and structured objects.
 */
export function displayIngredientQuantity(item, baseServings, targetServings) {
  const qty = item?.quantity;

  if (qty == null || qty === "") return "";

  if (typeof qty === "string") {
    // Try to parse and scale legacy strings when servings differ
    if (baseServings && targetServings && baseServings !== targetServings) {
      const parsed = parseQuantityText(qty);
      if (parsed && typeof parsed.amount === "number" && parsed.scalable !== false && parsed.unit) {
        const scaled = scaleIngredientQuantity(parsed, baseServings, targetServings);
        const formatted = formatScaledAmount(scaled.amount, scaled.unit);
        if (formatted !== null) {
          return [formatted, scaled.unit, scaled.note].filter(Boolean).join(" ");
        }
      }
    }
    return qty;
  }

  if (typeof qty !== "object") return "";

  const scaled = scaleIngredientQuantity(qty, baseServings, targetServings);

  if (scaled.amount === null || scaled.amount === undefined) {
    const parts = [scaled.unit, scaled.note].filter(Boolean);
    return parts.join(" ") || (scaled.originalText ?? "");
  }

  const formatted = formatScaledAmount(scaled.amount, scaled.unit);
  return [formatted ?? String(scaled.amount), scaled.unit, scaled.note].filter(Boolean).join(" ");
}

/**
 * Convert an ingredient's quantity (string or object) to a structured
 * editor representation. Called in edit mode to pre-populate fields.
 */
export function getStructuredQty(quantity) {
  if (!quantity) return { amount: null, unit: "", scalable: true };
  if (typeof quantity === "object") return quantity;
  const parsed = parseQuantityText(String(quantity));
  if (parsed) return parsed;
  return { amount: null, unit: "", scalable: true, originalText: String(quantity) };
}

// ─── Conservative text parser ──────────────────────────────────────────────────

const WORD_NUMBERS = {
  un: 1, una: 1, uno: 1,
  dos: 2, tres: 3, cuatro: 4, cinco: 5,
  seis: 6, siete: 7, ocho: 8, nueve: 9, diez: 10,
};

const UNIT_ALIASES = {
  g: "g", gr: "g", gramo: "g", gramos: "g",
  kg: "kg", kilo: "kg", kilos: "kg", kilogramo: "kg", kilogramos: "kg",
  ml: "ml", mililitro: "ml", mililitros: "ml",
  l: "l", litro: "l", litros: "l",
  cucharada: "cucharada", cucharadas: "cucharadas", cda: "cucharada", cdas: "cucharadas",
  cucharadita: "cucharadita", cucharaditas: "cucharadita", cdta: "cucharadita", cdtas: "cucharadita",
  taza: "taza", tazas: "tazas",
  vaso: "vaso", vasos: "vasos",
  unidad: "unidad", unidades: "unidades", ud: "unidad", uds: "unidades",
  pizca: "pizca", pizcas: "pizca",
  oz: "oz", onza: "oz", onzas: "oz",
  lb: "lb", libra: "lb", libras: "lb",
};

/**
 * Conservatively parses a quantity string into a structured object.
 * Returns null when the string cannot be parsed with confidence.
 *
 * Examples:
 *   "100 g"           → { amount: 100, unit: "g", scalable: true }
 *   "1 taza"          → { amount: 1,   unit: "taza", scalable: true }
 *   "una cucharada"   → { amount: 1,   unit: "cucharada", scalable: true }
 *   "un vaso de vino" → { amount: 1,   unit: "vaso", note: "vino", scalable: true }
 *   "al gusto"        → { amount: null, unit: "al gusto", scalable: false }
 *   "pizca de sal"    → { amount: null, unit: "pizca", note: "sal", scalable: false }
 */
export function parseQuantityText(text) {
  if (!text) return null;
  const t = text.trim().toLowerCase();

  // "al gusto" — non-scalable
  if (t === "al gusto" || t.startsWith("al gusto")) {
    return { amount: null, unit: "al gusto", scalable: false, originalText: text };
  }

  // "pizca [de X]" — non-scalable
  if (t === "pizca" || t.startsWith("pizca ") || t === "una pizca" || t.startsWith("una pizca ")) {
    const raw = t.replace(/^(una\s+)?pizca(\s+de)?/, "").trim();
    return { amount: null, unit: "pizca", scalable: false, ...(raw ? { note: raw } : {}), originalText: text };
  }

  // Normalize unicode fractions and written fractions
  let s = t
    .replace(/¼/g, "0.25").replace(/½/g, "0.5").replace(/¾/g, "0.75")
    .replace(/(\d+)\/(\d+)/g, (_, n, d) => String(Number(n) / Number(d)));

  // Extract leading amount: word number or numeric
  let amount = null;
  for (const [word, val] of Object.entries(WORD_NUMBERS)) {
    if (s === word || s.startsWith(`${word} `)) {
      amount = val;
      s = s.slice(word.length).trim();
      break;
    }
  }
  if (amount === null) {
    const m = s.match(/^(\d+(?:[.,]\d+)?)\s*/);
    if (m) {
      amount = parseFloat(m[1].replace(",", "."));
      s = s.slice(m[0].length);
    }
  }

  if (amount === null) return null;

  // Identify unit from alias table
  for (const [alias, canonical] of Object.entries(UNIT_ALIASES)) {
    if (s === alias || s.startsWith(`${alias} `) || s.startsWith(`${alias}s `)) {
      const unit = canonical;
      let note = s.slice(alias.length).trim();
      if (note.startsWith("de ")) note = note.slice(3);
      return {
        amount,
        unit,
        scalable: isUnitScalable(unit),
        ...(note ? { note } : {}),
        originalText: text
      };
    }
  }

  return null; // Unrecognized unit — don't guess
}
