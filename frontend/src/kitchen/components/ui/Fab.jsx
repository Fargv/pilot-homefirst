import React from "react";

export default function Fab({ children, className = "", ...props }) {
  return (
    <button className={`kitchen-ui-fab ${className}`.trim()} type="button" {...props}>
      {children}
    </button>
  );
}
