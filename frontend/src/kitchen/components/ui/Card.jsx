import React from "react";

export default function Card({ className = "", children, ...props }) {
  return (
    <section className={`kitchen-ui-card ${className}`.trim()} {...props}>
      {children}
    </section>
  );
}
