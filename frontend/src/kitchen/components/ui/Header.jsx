import React from "react";

export default function Header({ left, center, right, mobileExtra = null }) {
  return (
    <header className="kitchen-ui-header">
      <div className="kitchen-ui-header-inner">
        <div>{left}</div>
        <div>{center}</div>
        <div>{right}</div>
      </div>
      {mobileExtra ? (
        <div className="kitchen-mobile-header-extra">
          {mobileExtra}
        </div>
      ) : null}
    </header>
  );
}
