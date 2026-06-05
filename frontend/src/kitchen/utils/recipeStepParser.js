/**
 * recipeStepParser.js — Convert recipe elaboration (Tiptap JSON or plain text)
 * into structured guided-cooking steps with automatic timer detection.
 */

// ─── Timer detection ──────────────────────────────────────────────────────────

// Patterns in order of specificity (most specific first)
const TIMER_DEFS = [
  // "1 hora y 30 minutos" / "1 hora 30 min"
  {
    re: /(\d+)\s*hora?s?\s+(?:y\s+)?(\d+)\s*min(?:utos?)?/gi,
    toSec: (m) => parseInt(m[1], 10) * 3600 + parseInt(m[2], 10) * 60,
  },
  // "30 minutos" / "5 min" / "5'"
  {
    re: /(\d+)\s*min(?:utos?)?/gi,
    toSec: (m) => parseInt(m[1], 10) * 60,
  },
  // "30 segundos" / "30 seg"
  {
    re: /(\d+)\s*seg(?:undos?)?/gi,
    toSec: (m) => parseInt(m[1], 10),
  },
  // "2 horas" / "1 hora" (after more-specific hour+min pattern)
  {
    re: /(\d+)\s*hora?s?/gi,
    toSec: (m) => parseInt(m[1], 10) * 3600,
  },
];

const MIN_TIMER_SEC = 10;
const MAX_TIMER_SEC = 8 * 3600;

/**
 * Detect all timer mentions in plain text.
 * Returns [{durationSec, label, offset}] sorted by position, deduped.
 */
export function detectTimers(text) {
  if (!text) return [];
  const found = [];

  for (const { re, toSec } of TIMER_DEFS) {
    re.lastIndex = 0;
    let m;
    while ((m = re.exec(text)) !== null) {
      const durationSec = toSec(m);
      if (durationSec < MIN_TIMER_SEC || durationSec > MAX_TIMER_SEC) continue;
      found.push({ durationSec, label: m[0].trim(), offset: m.index });
    }
  }

  // Sort and deduplicate overlapping matches (keep first / longer)
  found.sort((a, b) => a.offset - b.offset);
  const deduped = [];
  let lastEnd = -1;
  for (const item of found) {
    const end = item.offset + item.label.length;
    if (item.offset >= lastEnd) {
      deduped.push(item);
      lastEnd = end;
    }
  }

  return deduped;
}

/**
 * Format total seconds as "5:00", "1:30:00", etc.
 */
export function formatDuration(totalSec) {
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  if (h > 0) return `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  return `${m}:${String(s).padStart(2, "0")}`;
}

// ─── Tiptap JSON utilities ────────────────────────────────────────────────────

function extractNodeText(node) {
  if (!node) return "";
  if (node.type === "text") return node.text || "";
  if (node.type === "hardBreak") return " ";
  if (Array.isArray(node.content)) return node.content.map(extractNodeText).join("");
  return "";
}

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function nodeToHtml(node) {
  if (!node) return "";
  if (node.type === "text") {
    let text = escapeHtml(node.text || "");
    const marks = node.marks || [];
    for (const mark of marks) {
      if (mark.type === "bold") text = `<strong>${text}</strong>`;
      else if (mark.type === "italic") text = `<em>${text}</em>`;
      else if (mark.type === "underline") text = `<u>${text}</u>`;
      else if (mark.type === "link" && mark.attrs?.href) {
        text = `<a href="${escapeHtml(mark.attrs.href)}" target="_blank" rel="noopener noreferrer">${text}</a>`;
      }
    }
    return text;
  }

  const inner = (node.content || []).map(nodeToHtml).join("");

  switch (node.type) {
    case "paragraph": return inner ? `<p>${inner}</p>` : "";
    case "heading":   return `<h${node.attrs?.level || 2}>${inner}</h${node.attrs?.level || 2}>`;
    case "orderedList": return `<ol>${inner}</ol>`;
    case "bulletList":  return `<ul>${inner}</ul>`;
    case "listItem":    return `<li>${inner}</li>`;
    case "hardBreak":   return "<br />";
    default: return inner;
  }
}

// ─── Step builder ─────────────────────────────────────────────────────────────

function makeStep(index, text, html) {
  const trimmed = (text || "").trim();
  return {
    index,
    text: trimmed,
    html: html?.trim() || null,
    detectedTimers: detectTimers(trimmed),
  };
}

// ─── Tiptap JSON → steps ──────────────────────────────────────────────────────

function parseTiptapDoc(doc) {
  if (!doc || doc.type !== "doc" || !Array.isArray(doc.content)) return null;
  const top = doc.content;
  if (top.length === 0) return null;

  // Strategy 1: top-level orderedList or bulletList
  for (const node of top) {
    if (node.type === "orderedList" || node.type === "bulletList") {
      const items = (node.content || []).filter((n) => n.type === "listItem");
      if (items.length > 0) {
        return items
          .map((item, i) => makeStep(i, extractNodeText(item), nodeToHtml(item)))
          .filter((s) => s.text.length > 0);
      }
    }
  }

  // Strategy 2: paragraphs starting with "N. " or "N) "
  const NUMBERED = /^\d+[.)]\s+/;
  const paragraphs = top.filter((n) => n.type === "paragraph");
  if (paragraphs.length >= 2 && paragraphs.filter((n) => NUMBERED.test(extractNodeText(n))).length >= 2) {
    return paragraphs
      .map((n, i) => {
        const rawText = extractNodeText(n).replace(NUMBERED, "");
        return makeStep(i, rawText, nodeToHtml(n));
      })
      .filter((s) => s.text.length > 0);
  }

  // Strategy 3: each non-empty top-level block = one step
  const steps = [];
  let idx = 0;
  for (const node of top) {
    const text = extractNodeText(node);
    if (!text.trim()) continue;
    steps.push(makeStep(idx, text, nodeToHtml(node)));
    idx++;
  }
  return steps.length > 0 ? steps : null;
}

// ─── Plain string → steps ────────────────────────────────────────────────────

function parseStringSteps(text) {
  if (!text || typeof text !== "string") return null;
  const trimmed = text.trim();
  if (!trimmed) return null;

  const lines = trimmed.split(/\n+/).map((l) => l.trim()).filter(Boolean);
  const NUMBERED = /^(?:\d+[.)]\s*|\(\d+\)\s*)/;
  const BULLET = /^[-•*]\s+/;

  if (lines.length >= 2 && lines.filter((l) => NUMBERED.test(l)).length >= 2) {
    return lines.map((l, i) => makeStep(i, l.replace(NUMBERED, ""), null)).filter((s) => s.text.length > 0);
  }
  if (lines.length >= 2 && lines.filter((l) => BULLET.test(l)).length >= 2) {
    return lines.map((l, i) => makeStep(i, l.replace(BULLET, ""), null)).filter((s) => s.text.length > 0);
  }
  if (lines.length > 1) {
    return lines.map((l, i) => makeStep(i, l, null)).filter((s) => s.text.length > 0);
  }
  return [makeStep(0, trimmed, null)];
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Parse recipe.steps into structured guided-cooking steps.
 * Accepts Tiptap JSON, arrays, strings, or null.
 * Returns null when no elaboration is present.
 */
export function parseRecipeSteps(steps) {
  if (!steps) return null;

  // Tiptap JSON document
  if (typeof steps === "object" && !Array.isArray(steps) && steps.type === "doc") {
    return parseTiptapDoc(steps) || null;
  }

  // Structured steps array (new Guided Cooking Mode format)
  if (Array.isArray(steps)) {
    if (steps.length === 0) return null;
    return steps
      .map((s, i) => {
        if (typeof s === "string") return makeStep(i, s, null);

        const text = String(s.text || s.description || "");
        const base = makeStep(i, text, null);

        // Carry over explicit structured fields
        if (s.title)  base.title = s.title;
        if (s.tips)   base.tips  = s.tips;
        if (s.order != null) base.order = s.order;
        // Support both field names: stepIngredients (canonical) and ingredients (legacy)
        if (Array.isArray(s.stepIngredients)) base.stepIngredients = s.stepIngredients;
        else if (Array.isArray(s.ingredients)) base.stepIngredients = s.ingredients;

        // Use explicit timer data when available (overrides auto-detection)
        const durationSec = s.durationSeconds > 0
          ? s.durationSeconds
          : (s.durationMinutes > 0 ? Math.round(s.durationMinutes * 60) : 0);
        if (s.hasTimer === true && durationSec > 0) {
          base.detectedTimers = [{
            durationSec,
            label: s.timerLabel || formatDuration(durationSec),
            offset: 0,
          }];
        } else if (s.hasTimer === false) {
          base.detectedTimers = []; // explicit no-timer, skip auto-detect
        }

        return base;
      })
      .filter((s) => s.text.length > 0);
  }

  // Legacy string
  if (typeof steps === "string") {
    return parseStringSteps(steps);
  }

  return null;
}

/**
 * Sum of all detected timer durations across all steps (seconds).
 * Returns null when no timers are present.
 */
export function estimateTotalDuration(steps) {
  if (!steps || steps.length === 0) return null;
  let total = 0;
  for (const step of steps) {
    for (const t of step.detectedTimers || []) {
      total += t.durationSec;
    }
  }
  return total > 0 ? total : null;
}
