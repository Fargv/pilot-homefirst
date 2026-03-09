import React from "react";
import { getCategoryIconByCode } from "./categoryIconMap.js";

export default function CategoryIcon({ categoryCode, className = "", title = "" }) {
  const iconSrc = getCategoryIconByCode(categoryCode);
  if (!iconSrc) return null;

  const resolvedClassName = ["kitchen-category-icon", className].filter(Boolean).join(" ");
  return (
    <img
      src={iconSrc}
      className={resolvedClassName}
      alt=""
      aria-hidden="true"
      title={title || undefined}
      loading="lazy"
      decoding="async"
    />
  );
}
