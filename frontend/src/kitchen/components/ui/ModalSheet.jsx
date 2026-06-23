import React from "react";

function CloseIcon() {
  return (
    <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor"
      strokeWidth="2.5" strokeLinecap="round" aria-hidden="true">
      <path d="M18 6L6 18M6 6l12 12" />
    </svg>
  );
}

export default function ModalSheet({ open, title, children, actions, onClose }) {
  if (!open) return null;
  return (
    <div className="kitchen-ui-sheet-backdrop" role="presentation">
      <div
        className="kitchen-ui-sheet"
        role="dialog"
        aria-modal="true"
        aria-label={title}
      >
        <div className="kitchen-ui-sheet-header">
          {title ? <h3>{title}</h3> : <span />}
          {typeof onClose === "function" ? (
            <button
              type="button"
              className="kitchen-ui-sheet-close"
              aria-label="Cerrar"
              onClick={onClose}
            >
              <CloseIcon />
            </button>
          ) : null}
        </div>
        <div>{children}</div>
        {actions ? <div className="kitchen-ui-sheet-actions">{actions}</div> : null}
      </div>
    </div>
  );
}
