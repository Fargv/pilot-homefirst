import React from "react";
import { useNavigate } from "react-router-dom";

export function ProBadge({ className = "" }) {
  return (
    <span className={`pro-badge ${className}`.trim()} aria-label="Requiere plan Pro">
      PRO
    </span>
  );
}

export function ProGateButton({ children, className = "", title, onClick, ...props }) {
  const navigate = useNavigate();

  const handleClick = (e) => {
    e.stopPropagation();
    if (onClick) onClick(e);
    else navigate(`/kitchen/upgrade?from=${encodeURIComponent(window.location.pathname)}`);
  };

  return (
    <button
      type="button"
      className={`pro-gate-button ${className}`.trim()}
      onClick={handleClick}
      title={title || "Esta función requiere un plan Pro"}
      {...props}
    >
      {children}
      <ProBadge />
    </button>
  );
}
