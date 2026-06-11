import React from "react";
import { NavLink } from "react-router-dom";

export default function BottomNav({ links = [], onNavigate, onPrefetch }) {
  return (
    <nav className="kitchen-ui-bottom-nav" aria-label="Navegación inferior">
      <div className="kitchen-ui-bottom-nav-inner">
        {links.map((link) => {
          const Icon = link.icon;
          return (
            <NavLink
              key={link.to}
              to={link.to}
              onClick={onNavigate}
              onMouseEnter={onPrefetch ? () => onPrefetch(link.to) : undefined}
              onTouchStart={onPrefetch ? () => onPrefetch(link.to) : undefined}
              className={({ isActive }) => `kitchen-ui-bottom-nav-item${isActive ? " active" : ""}`}
            >
              <Icon className="kitchen-bottom-nav-icon" />
              <span className="kitchen-bottom-nav-label">{link.label}</span>
            </NavLink>
          );
        })}
      </div>
    </nav>
  );
}
