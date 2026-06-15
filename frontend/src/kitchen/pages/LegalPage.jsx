import React, { useMemo } from "react";
import { Link } from "react-router-dom";
import termsRaw from "../../legal/terminos-y-condiciones.md?raw";
import privacyRaw from "../../legal/politica-de-privacidad.md?raw";

function escapeHtml(str) {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function applyInline(text) {
  return escapeHtml(text)
    .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
    .replace(/\[(.+?)\]\((.+?)\)/g, '<a href="$2" target="_blank" rel="noopener noreferrer">$1</a>');
}

function parseCells(row) {
  return row.split("|").slice(1, -1).map((c) => c.trim());
}

function renderMarkdown(md) {
  const lines = md.split("\n");
  const parts = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];

    // Table block
    if (line.trim().startsWith("|")) {
      const rows = [];
      while (i < lines.length && lines[i].trim().startsWith("|")) {
        rows.push(lines[i]);
        i++;
      }
      const headers = parseCells(rows[0]);
      const body = rows.slice(2);
      parts.push(
        `<div class="legal-table-wrap"><table class="legal-table">` +
        `<thead><tr>${headers.map((h) => `<th>${applyInline(h)}</th>`).join("")}</tr></thead>` +
        `<tbody>${body.map((r) => `<tr>${parseCells(r).map((c) => `<td>${applyInline(c)}</td>`).join("")}</tr>`).join("")}</tbody>` +
        `</table></div>`
      );
      continue;
    }

    // Headings
    const h1 = line.match(/^# (.+)/);
    const h2 = line.match(/^## (.+)/);
    const h3 = line.match(/^### (.+)/);
    if (h1) { parts.push(`<h1>${applyInline(h1[1])}</h1>`); i++; continue; }
    if (h2) { parts.push(`<h2>${applyInline(h2[1])}</h2>`); i++; continue; }
    if (h3) { parts.push(`<h3>${applyInline(h3[1])}</h3>`); i++; continue; }

    // Horizontal rule
    if (line.trim() === "---") { parts.push("<hr>"); i++; continue; }

    // Bullet list
    if (line.match(/^- /)) {
      const items = [];
      while (i < lines.length && lines[i].match(/^- /)) {
        items.push(`<li>${applyInline(lines[i].slice(2))}</li>`);
        i++;
      }
      parts.push(`<ul>${items.join("")}</ul>`);
      continue;
    }

    // Blank line
    if (!line.trim()) { i++; continue; }

    // Paragraph
    parts.push(`<p>${applyInline(line)}</p>`);
    i++;
  }

  return parts.join("");
}

function LegalPageLayout({ html }) {
  return (
    <div className="legal-page">
      <header className="legal-page-header">
        <Link to="/" className="legal-page-logo-link">
          <span className="legal-page-logo-text">Lunchfy</span>
        </Link>
      </header>
      <div className="legal-page-body">
        <div
          className="legal-page-content"
          dangerouslySetInnerHTML={{ __html: html }}
        />
      </div>
    </div>
  );
}

export function TermsPage() {
  const html = useMemo(() => renderMarkdown(termsRaw), []);
  return <LegalPageLayout html={html} />;
}

export function PrivacyPage() {
  const html = useMemo(() => renderMarkdown(privacyRaw), []);
  return <LegalPageLayout html={html} />;
}
