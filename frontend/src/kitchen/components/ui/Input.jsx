import React from "react";

export default function Input({ label, id, className = "", ...props }) {
  return (
    <label className="kitchen-ui-input-group" htmlFor={id}>
      {label ? <span className="kitchen-label">{label}</span> : null}
      <input id={id} className={`kitchen-ui-input ${className}`.trim()} {...props} />
    </label>
  );
}
