import React from "react";

export default function ModalSheet({ open, title, children, actions, onClose }) {
  if (!open) return null;
  return (
    <div className="kitchen-ui-sheet-backdrop" role="presentation" onClick={onClose}>
      <div
        className="kitchen-ui-sheet"
        role="dialog"
        aria-modal="true"
        aria-label={title}
        onClick={(event) => event.stopPropagation()}
      >
        {title ? <h3>{title}</h3> : null}
        <div>{children}</div>
        {actions ? <div className="kitchen-ui-sheet-actions">{actions}</div> : null}
      </div>
    </div>
  );
}
