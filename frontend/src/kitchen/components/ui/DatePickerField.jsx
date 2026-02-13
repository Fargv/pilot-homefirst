import React from "react";

export default function DatePickerField({ label, id, ...props }) {
  return (
    <label className="kitchen-ui-input-group" htmlFor={id}>
      {label ? <span className="kitchen-label">{label}</span> : null}
      <input id={id} type="date" className="kitchen-ui-input" {...props} />
    </label>
  );
}
