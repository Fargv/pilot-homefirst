import React from "react";

function ChevronIcon(props) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" {...props}>
      <path d="M15 18l-6-6 6-6" />
    </svg>
  );
}

export default function WeekNavigator({
  value,
  onChange,
  onPrevious,
  onNext,
  className = "",
  ariaLabel = "Cambiar semana",
  inputAriaLabel = "Semana",
  previousLabel = "Ir a la semana anterior",
  nextLabel = "Ir a la semana siguiente"
}) {
  const navClassName = ["kitchen-week-nav", className].filter(Boolean).join(" ");

  return (
    <div className={navClassName} role="group" aria-label={ariaLabel}>
      <button className="kitchen-week-arrow" type="button" onClick={onPrevious} aria-label={previousLabel}>
        <ChevronIcon className="kitchen-week-arrow-icon" />
      </button>
      <label className="kitchen-field kitchen-week-picker">
        <input
          className="kitchen-input"
          type="date"
          value={value}
          onChange={(event) => onChange(event.target.value)}
          aria-label={inputAriaLabel}
        />
      </label>
      <button className="kitchen-week-arrow" type="button" onClick={onNext} aria-label={nextLabel}>
        <ChevronIcon className="kitchen-week-arrow-icon is-next" />
      </button>
    </div>
  );
}
