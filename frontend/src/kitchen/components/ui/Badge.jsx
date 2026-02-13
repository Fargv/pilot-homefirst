import React from "react";

export default function Badge({ children, tone = "default" }) {
  return <span className={`kitchen-ui-badge kitchen-ui-badge-${tone}`}>{children}</span>;
}
