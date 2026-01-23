import React from "react";

export default function CategoryChip({ label, colorBg, colorText, onRemove, status }) {
  return (
    <span
      className={`kitchen-chip ${status ? `is-${status}` : ""}`}
      style={{
        background: colorBg || "#E8F1FF",
        color: colorText || "#1D4ED8"
      }}
    >
      <span className="kitchen-chip-label">{label}</span>
      {onRemove ? (
        <button className="kitchen-chip-remove" type="button" onClick={onRemove} aria-label={`Eliminar ${label}`}>
          ✕
        </button>
      ) : null}
    </span>
  );
}
