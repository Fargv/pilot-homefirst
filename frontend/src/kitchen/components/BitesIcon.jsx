import React from "react";

export default function BitesIcon({ size = 18, className = "", style = {}, decorative = false }) {
  return (
    <svg width="32" height="32" viewBox="0 0 64 64" fill="none" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Bites">
  <circle
    cx="32"
    cy="32"
    r="28"
    stroke="#4338CA"
    stroke-width="4"
  />

  <path
    d="M44.5 25.2C41.2 25.2 38.5 22.5 38.5 19.2C38.5 18.1 38.8 17.1 39.3 16.2C37.1 15.2 34.7 14.7 32.1 14.7C22.5 14.7 14.7 22.5 14.7 32.1C14.7 41.7 22.5 49.5 32.1 49.5C41.7 49.5 49.5 41.7 49.5 32.1C49.5 29.5 49 27.1 48 24.9C47 25.1 45.8 25.2 44.5 25.2Z"
    stroke="#4338CA"
    stroke-width="4"
    stroke-linecap="round"
    stroke-linejoin="round"
  />

  <circle cx="26" cy="28" r="2.4" fill="#4338CA"/>
  <circle cx="34" cy="36" r="2.4" fill="#4338CA"/>
  <circle cx="27.5" cy="39.5" r="1.8" fill="#4338CA"/>
</svg>
  );
}
