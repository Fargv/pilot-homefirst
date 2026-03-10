import React from "react";
import "./DevEnvironmentBanner.css";

const isDevelopmentEnvironment = import.meta.env.VITE_APP_ENV === "development";
const bannerText = "\u26A0 DEV ENVIRONMENT \u2014 Lunchfy Development";

export default function DevEnvironmentBanner() {
  if (!isDevelopmentEnvironment) {
    return null;
  }

  return (
    <>
      <div className="dev-environment-banner" role="status" aria-live="polite">
        <span className="dev-environment-banner__text">{bannerText}</span>
      </div>
      <div className="dev-environment-banner-spacer" aria-hidden="true" />
    </>
  );
}
