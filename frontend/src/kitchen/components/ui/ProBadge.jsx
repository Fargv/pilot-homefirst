import React from "react";
import { useNavigate } from "react-router-dom";
import { useSubscriptionsEnabled } from "../../monetization.jsx";

export function ProBadge({ className = "" }) {
  const subscriptionsEnabled = useSubscriptionsEnabled();
  if (subscriptionsEnabled !== true) return null;
  return (
    <span className={`pro-badge ${className}`.trim()} aria-label="Requiere plan Pro">
      PRO
    </span>
  );
}

export function ProGateButton({ children, className = "", title, onClick, ...props }) {
  const navigate = useNavigate();
  const subscriptionsEnabled = useSubscriptionsEnabled();

  const handleClick = (e) => {
    e.stopPropagation();
    if (onClick) onClick(e);
    else if (subscriptionsEnabled === true) navigate(`/kitchen/upgrade?from=${encodeURIComponent(window.location.pathname)}`);
  };

  return (
    <button
      type="button"
      className={`pro-gate-button ${className}`.trim()}
      onClick={handleClick}
      title={subscriptionsEnabled === true ? (title || "Esta función requiere un plan Pro") : undefined}
      {...props}
    >
      {children}
      {subscriptionsEnabled === true ? <ProBadge /> : null}
    </button>
  );
}
