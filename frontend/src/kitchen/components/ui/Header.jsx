import React from "react";

export default function Header({ left, center, right }) {
  return (
    <header className="kitchen-ui-header">
      <div className="kitchen-ui-header-inner">
        <div>{left}</div>
        <div>{center}</div>
        <div>{right}</div>
      </div>
    </header>
  );
}
