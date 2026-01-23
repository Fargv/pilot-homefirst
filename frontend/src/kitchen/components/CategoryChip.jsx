import React from "react";

export default function CategoryChip({ label, colorBg, colorText, onRemove, status }) {
  return (
    <span
      className={`kitchen-chip ${status ? `is-${status}` : ""}`}
      style={{
        background: colorBg || "#eef2ff",
        color: colorText || "#4338ca"
      }}
    >
      <span>{label}</span>
      {onRemove ? (
        <button className="kitchen-chip-remove" type="button" onClick={onRemove} aria-label={`Eliminar ${label}`}>
          ×
        </button>
      ) : null}
    </span>
  );
}
