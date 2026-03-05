import React from "react";

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
              aria-label="Cerrar modal"
              onClick={onClose}
            >
              x
            </button>
          ) : null}
        </div>
        <div>{children}</div>
        {actions ? <div className="kitchen-ui-sheet-actions">{actions}</div> : null}
      </div>
    </div>
  );
}
