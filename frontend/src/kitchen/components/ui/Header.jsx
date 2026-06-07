import React from "react";

export default function Header({ left, center, right, mobileExtra = null }) {
  return (
    <header className="kitchen-ui-header">
      <div className="kitchen-ui-header-inner">
        <div className="kitchen-ui-header-left">{left}</div>
        <div className="kitchen-ui-header-center">
          {center}
          {mobileExtra ? (
            <div className="kitchen-mobile-header-extra">
              {mobileExtra}
            </div>
          ) : null}
        </div>
        <div className="kitchen-ui-header-right">{right}</div>
      </div>
    </header>
  );
}
