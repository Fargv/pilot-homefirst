import React, { useEffect, useMemo, useRef } from "react";
import { NavLink, useLocation } from "react-router-dom";

export default function BottomNav({ links = [], onNavigate, onPrefetch }) {
  const location = useLocation();
  const itemRefs = useRef([]);
  const labelRefs = useRef([]);

  const activeIndex = useMemo(() => {
    const index = links.findIndex((link) => (
      location.pathname === link.to || location.pathname.startsWith(`${link.to}/`)
    ));
    return index >= 0 ? index : 0;
  }, [links, location.pathname]);

  useEffect(() => {
    const syncActiveLine = () => {
      const activeItem = itemRefs.current[activeIndex];
      const activeLabel = labelRefs.current[activeIndex];
      if (!activeItem || !activeLabel) return;
      activeItem.style.setProperty("--active-label-width", `${Math.round(activeLabel.offsetWidth)}px`);
    };

    syncActiveLine();
    window.addEventListener("resize", syncActiveLine);
    return () => window.removeEventListener("resize", syncActiveLine);
  }, [activeIndex, links]);

  return (
    <nav className="kitchen-ui-bottom-nav" aria-label="Navegacion inferior">
      <div className="kitchen-ui-bottom-nav-inner">
        {links.map((link, index) => {
          const Icon = link.icon;
          return (
            <NavLink
              key={link.to}
              to={link.to}
              ref={(node) => {
                itemRefs.current[index] = node;
              }}
              onClick={onNavigate}
              onMouseEnter={onPrefetch ? () => onPrefetch(link.to) : undefined}
              onTouchStart={onPrefetch ? () => onPrefetch(link.to) : undefined}
              style={{ "--active-label-width": "0px" }}
              className={({ isActive }) => `kitchen-ui-bottom-nav-item${isActive ? " active" : ""}`}
            >
              <Icon className="kitchen-bottom-nav-icon" />
              <span
                className="kitchen-bottom-nav-label"
                ref={(node) => {
                  labelRefs.current[index] = node;
                }}
              >
                {link.label}
              </span>
            </NavLink>
          );
        })}
      </div>
    </nav>
  );
}
