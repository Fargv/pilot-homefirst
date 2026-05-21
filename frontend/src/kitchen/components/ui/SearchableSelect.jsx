import React, { useEffect, useRef, useState } from "react";

export default function SearchableSelect({
  options = [],
  value = "",
  onChange,
  emptyLabel = "Sin categoría",
  placeholder = "Buscar...",
  onCreate,
  disabled = false
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const containerRef = useRef(null);
  const searchRef = useRef(null);

  const selectedOption = options.find((o) => o.value === value) || null;

  const filtered = query
    ? options.filter((o) => o.label.toLowerCase().includes(query.toLowerCase()))
    : options;

  const showCreate =
    onCreate &&
    query.trim() &&
    !options.some((o) => o.label.toLowerCase() === query.toLowerCase());

  useEffect(() => {
    if (!open) { setQuery(""); return; }
    setTimeout(() => searchRef.current?.focus(), 0);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const handler = (e) => {
      if (!containerRef.current?.contains(e.target)) setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  const select = (val) => {
    onChange?.(val);
    setOpen(false);
  };

  return (
    <div className={`ss-container${open ? " is-open" : ""}`} ref={containerRef}>
      <button
        type="button"
        className="ss-trigger"
        onClick={() => !disabled && setOpen((o) => !o)}
        disabled={disabled}
        aria-expanded={open}
        aria-haspopup="listbox"
      >
        {selectedOption ? (
          <span className="ss-trigger-content">
            {selectedOption.dotColor ? (
              <span className="ss-dot" style={{ background: selectedOption.dotColor }} aria-hidden="true" />
            ) : null}
            {selectedOption.label}
          </span>
        ) : (
          <span className="ss-trigger-empty">{emptyLabel}</span>
        )}
        <svg className="ss-chevron" viewBox="0 0 16 16" width="14" height="14" fill="none" aria-hidden="true">
          <path d="M4 6l4 4 4-4" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>

      {open ? (
        <div className="ss-panel" role="listbox">
          <div className="ss-search-wrapper">
            <svg viewBox="0 0 16 16" width="13" height="13" fill="none" aria-hidden="true">
              <circle cx="7" cy="7" r="4.5" stroke="currentColor" strokeWidth="1.4" />
              <path d="M11 11l2 2" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
            </svg>
            <input
              ref={searchRef}
              className="ss-search"
              placeholder={placeholder}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
          </div>
          <div className="ss-list">
            <button
              type="button"
              role="option"
              aria-selected={!value}
              className={`ss-option${!value ? " ss-option-selected" : ""}`}
              onClick={() => select("")}
            >
              {emptyLabel}
            </button>
            {filtered.map((opt) => (
              <button
                key={opt.value}
                type="button"
                role="option"
                aria-selected={value === opt.value}
                className={`ss-option${value === opt.value ? " ss-option-selected" : ""}`}
                onClick={() => select(opt.value)}
              >
                {opt.dotColor ? (
                  <span className="ss-dot" style={{ background: opt.dotColor }} aria-hidden="true" />
                ) : null}
                <span className="ss-option-label">{opt.label}</span>
                {value === opt.value ? (
                  <svg className="ss-check" viewBox="0 0 16 16" width="13" height="13" fill="none" aria-hidden="true">
                    <path d="M3 8l4 4 6-7" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                ) : null}
              </button>
            ))}
            {filtered.length === 0 && !showCreate ? (
              <p className="ss-empty">Sin resultados</p>
            ) : null}
            {showCreate ? (
              <button
                type="button"
                className="ss-option ss-option-create"
                onClick={() => { onCreate(query.trim()); setOpen(false); }}
              >
                <svg viewBox="0 0 16 16" width="13" height="13" fill="none" aria-hidden="true">
                  <path d="M8 3v10M3 8h10" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
                </svg>
                Crear &ldquo;{query}&rdquo;
              </button>
            ) : null}
          </div>
        </div>
      ) : null}
    </div>
  );
}
