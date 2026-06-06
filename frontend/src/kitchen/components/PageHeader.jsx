import React from "react";

export default function PageHeader({
  title,
  subtitle,
  leading,
  primaryAction,
  secondaryLeft,
  secondaryRight,
  footer,
  className = "",
  topRef,
  noCard = false,
  children,
}) {
  const hasControls = secondaryLeft != null || secondaryRight != null;
  const outerClass = noCard
    ? className || ""
    : `page-header${className ? ` ${className}` : ""}`;

  return (
    <div className={outerClass}>
      <div className="page-header-top" ref={topRef}>
        {leading ? <div className="page-header-leading">{leading}</div> : null}
        <div className="page-header-text">
          <h1 className="page-header-title">{title}</h1>
          {subtitle ? <p className="page-header-subtitle">{subtitle}</p> : null}
        </div>
        {primaryAction ? (
          <div className="page-header-primary-action">{primaryAction}</div>
        ) : null}
      </div>
      {hasControls ? (
        <div className="page-header-controls">
          {secondaryLeft ? (
            <div className="page-header-controls-left">{secondaryLeft}</div>
          ) : null}
          {secondaryRight ? (
            <div className="page-header-controls-right">{secondaryRight}</div>
          ) : null}
        </div>
      ) : null}
      {footer ? <div className="page-header-footer">{footer}</div> : null}
      {children}
    </div>
  );
}
