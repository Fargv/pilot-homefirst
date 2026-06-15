import React from "react";

const variantClass = {
  primary: "kitchen-ui-button",
  secondary: "kitchen-ui-button kitchen-ui-button-secondary",
  ghost: "kitchen-ui-button kitchen-ui-button-ghost",
  danger: "kitchen-ui-button kitchen-ui-button-danger",
  destructive: "kitchen-ui-button kitchen-ui-button-danger",
};

export default function Button({
  children,
  type = "button",
  variant = "primary",
  className = "",
  ...props
}) {
  return (
    <button type={type} className={`${variantClass[variant] || variantClass.primary} ${className}`.trim()} {...props}>
      {children}
    </button>
  );
}
