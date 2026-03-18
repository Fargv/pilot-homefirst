import React from "react";

export default function Skeleton({
  as: Component = "div",
  className = "",
  style,
  children,
  ...props
}) {
  return (
    <Component
      className={["kitchen-skeleton", className].filter(Boolean).join(" ")}
      style={style}
      aria-hidden="true"
      {...props}
    >
      {children}
    </Component>
  );
}
